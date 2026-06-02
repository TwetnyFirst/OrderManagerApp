const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { db } = require('../models/db');
const dpdService = require('../services/dpdService');
const apaczkaService = require('../services/apaczkaService');

// Helper to make db calls cleaner
const p = {
    get: (sql, params) => new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    }),
    all: (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    }),
    run: (sql, params) => new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err); else resolve(this);
        });
    })
};

// Get orders with pagination and associated shipments
router.get('/orders', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const source = req.query.source;

    try {
        const params = [];
        let countSql = 'SELECT COUNT(*) as count FROM orders';
        if (source) {
            countSql += ' WHERE source = ?';
            params.push(source);
        }

        const { count } = await p.get(countSql, params);

        let sql = `
            SELECT o.*, 
            (SELECT json_group_array(json_object(
                'id', s.id, 'waybill', s.waybill, 'label_path', s.label_path, 'provider', s.provider, 'created_at', s.created_at
            )) FROM shipments s WHERE s.order_id = o.id) as shipments
            FROM orders o 
        `;

        const queryParams = [...params];
        if (source) {
            sql += ' WHERE o.source = ?';
        }
        sql += ' ORDER BY CAST(o.order_number AS INTEGER) DESC LIMIT ? OFFSET ?';
        queryParams.push(limit, offset);

        const rows = await p.all(sql, queryParams);
        const processedRows = rows.map(row => ({ ...row, shipments: JSON.parse(row.shipments || '[]') }));

        res.json({
            orders: processedRows,
            totalCount: count,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            limit
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all senders
router.get('/senders', async (req, res) => {
    try {
        const rows = await p.all('SELECT * FROM senders');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Generate DPD Label
router.post('/generate-label/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { senderId, senderFid, packageCount } = req.body;
    const finalSenderId = senderId || senderFid;

    try {
        console.log(`[API] Generating DPD label for order ${orderId}, sender ${finalSenderId}`);

        // Idempotency Check
        const existingShipment = await p.get('SELECT * FROM shipments WHERE order_id = ? AND provider = ?', [orderId, 'DPD']);
        if (existingShipment) {
            return res.status(409).json({ error: 'DPD label already exists for this order.', labelPath: existingShipment.label_path });
        }

        const order = await p.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        // Search sender by ID (standard) or FID (fallback)
        const sender = await p.get('SELECT * FROM senders WHERE id = ? OR fid = ?', [finalSenderId, finalSenderId]);

        if (!order) {
            console.error(`[API] Order ${orderId} not found`);
            return res.status(404).json({ error: 'Order not found' });
        }
        if (!sender) {
            console.error(`[API] Sender ${finalSenderId} not found`);
            return res.status(404).json({ error: 'Sender not found' });
        }

        const waybillData = await dpdService.generatePackagesNumbers(order, sender, parseInt(packageCount || 1));
        const { waybill, sessionId, packageReference, parcelReference } = waybillData;
        const labelFileName = await dpdService.generateSpedLabels(waybill, sessionId, packageReference, parcelReference);

        // Transaction-like update
        await p.run('BEGIN');
        try {
            await p.run(
                'INSERT INTO shipments (order_id, waybill, label_path, provider) VALUES (?, ?, ?, ?)',
                [orderId, waybill, `/labels/${labelFileName}`, 'DPD']
            );
            await p.run('UPDATE orders SET status = "Label Created" WHERE id = ?', [orderId]);
            await p.run('COMMIT');
        } catch (dbError) {
            await p.run('ROLLBACK');
            throw dbError;
        }

        res.json({ success: true, waybill, labelPath: `/labels/${labelFileName}` });
    } catch (error) {
        console.error('DPD Label Generation API Error:', error.response ? JSON.stringify(error.response.data) : error);
        res.status(500).json({ error: error.message });
    }
});

// Generate APaczka (InPost) Label
router.post('/generate-apaczka-label/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { senderFid } = req.body;

    try {
        // Idempotency Check: See if an Apaczka shipment already exists
        const existingShipment = await p.get('SELECT * FROM shipments WHERE order_id = ? AND provider = ?', [orderId, 'APaczka']);
        if (existingShipment) {
            return res.status(409).json({ error: 'Apaczka label already exists for this order.', labelPath: existingShipment.label_path });
        }

        const order = await p.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        const sender = await p.get('SELECT * FROM senders WHERE fid = ?', [senderFid]);

        if (!order || !sender) {
            return res.status(404).json({ error: 'Order or Sender not found' });
        }
        if (!order.paczkomat_id) {
            return res.status(400).json({ error: 'Brak kodu paczkomatu. Proszę uzupełnić dane.' });
        }

        const shipmentData = await apaczkaService.createShipment(order, sender);
        const labelData = await apaczkaService.getLabel(shipmentData.orderId);
        
        const finalWaybill = labelData.waybill || shipmentData.waybill;
        const labelFileName = labelData.fileName;

        // Transaction-like update
        await p.run('BEGIN');
        try {
            await p.run(
                'INSERT INTO shipments (order_id, waybill, label_path, provider) VALUES (?, ?, ?, ?)',
                [orderId, finalWaybill, `/labels/${labelFileName}`, 'APaczka']
            );
            await p.run('UPDATE orders SET status = "Label Created" WHERE id = ?', [orderId]);
            await p.run('COMMIT');
        } catch (dbError) {
            await p.run('ROLLBACK');
            throw dbError; // re-throw to be caught by outer catch
        }

        res.json({ success: true, waybill: finalWaybill, labelPath: `/labels/${labelFileName}` });
    } catch (error) {
        console.error('APaczka Label Generation API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update Invoice Number / etc.
router.post('/update-order/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { invoice_number, paczkomat_id, parcel_size } = req.body;

    // Build query dynamically
    const fields = [];
    const params = [];
    if(invoice_number !== undefined) { fields.push('invoice_number = ?'); params.push(invoice_number); }
    if(paczkomat_id !== undefined) { fields.push('paczkomat_id = ?'); params.push(paczkomat_id); }
    if(parcel_size !== undefined) { fields.push('parcel_size = ?'); params.push(parcel_size); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }

    const sql = `UPDATE orders SET ${fields.join(', ')} WHERE id = ?`;
    params.push(orderId);

    try {
        await p.run(sql, params);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Delete Shipment
router.delete('/shipments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const shipment = await p.get('SELECT * FROM shipments WHERE id = ?', [id]);
        if (!shipment) {
            return res.status(404).json({ error: 'Shipment not found' });
        }

        // 1. If DPD, cancel it in their system
        if (shipment.provider === 'DPD') {
            try {
                await dpdService.deletePackage(shipment.waybill);
            } catch (dpdError) {
                console.error('Failed to cancel DPD shipment:', dpdError.message);
                // We continue to delete locally even if API fails (e.g. already cancelled)
            }
        }

        // 2. Delete physical label file
        if (shipment.label_path) {
            const labelsDir = process.env.LABELS_DIR || path.join(__dirname, '../../labels');
            const fileName = path.basename(shipment.label_path);
            const filePath = path.join(labelsDir, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }

        // 3. Database Updates
        await p.run('BEGIN');
        try {
            await p.run('DELETE FROM shipments WHERE id = ?', [id]);
            
            // Check if there are any other shipments for this order
            const otherShipments = await p.get('SELECT id FROM shipments WHERE order_id = ?', [shipment.order_id]);
            if (!otherShipments) {
                // Reset order status if no shipments left
                await p.run('UPDATE orders SET status = "New" WHERE id = ?', [shipment.order_id]);
            }
            
            await p.run('COMMIT');
        } catch (dbError) {
            await p.run('ROLLBACK');
            throw dbError;
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Shipment Deletion Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Delete Shipment by Waybill (keeping legacy route for safety)
router.delete('/shipments/waybill/:waybill', async (req, res) => {
    const { waybill } = req.params;
    try {
        const shipment = await p.get('SELECT id FROM shipments WHERE waybill = ?', [waybill]);
        if (shipment) {
            // Forward to the ID-based route logic or replicate it
            // For brevity, we'll just delete from DB here as it was before, 
            // but the UI should use the ID-based route.
            await p.run('DELETE FROM shipments WHERE waybill = ?', [waybill]);
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
