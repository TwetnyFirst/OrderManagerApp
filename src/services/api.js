const express = require('express');
const router = express.Router();
const { db } = require('../models/db');
const dpdService = require('../services/dpdService');
const apaczkaService = require('../services/apaczkaService');

// Test endpoint to verify API is working
router.get('/test', (req, res) => {
    res.json({ status: 'ok', message: 'API is reachable' });
});

// Get orders with pagination and associated shipments
router.get('/orders', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    db.get('SELECT COUNT(*) as count FROM orders', (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const totalCount = row.count;

        // Query with json_group_array to fetch multiple shipments per order
        const sql = `
            SELECT o.*, 
            (SELECT json_group_array(json_object(
                'id', s.id, 
                'waybill', s.waybill, 
                'label_path', s.label_path, 
                'provider', s.provider,
                'created_at', s.created_at
            )) FROM shipments s WHERE s.order_id = o.id) as shipments
            FROM orders o 
            ORDER BY CAST(o.order_number AS INTEGER) DESC 
            LIMIT ? OFFSET ?
        `;

        db.all(sql, [limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Parse shipments JSON for each row
            const processedRows = rows.map(row => ({
                ...row,
                shipments: JSON.parse(row.shipments || '[]')
            }));

            res.json({
                orders: processedRows,
                totalCount,
                totalPages: Math.ceil(totalCount / limit),
                currentPage: page,
                limit
            });
        });
    });
});

// Get all senders
router.get('/senders', (req, res) => {
    db.all('SELECT * FROM senders', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Generate DPD Label
router.post('/generate-label/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { senderId, packageCount } = req.body;

    try {
        const order = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        const sender = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM senders WHERE id = ?', [senderId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!order || !sender) return res.status(404).json({ error: 'Order or Sender not found' });

        const waybillData = await dpdService.generatePackagesNumbers(order, sender, parseInt(packageCount));
        const { waybill, sessionId, packageReference, parcelReference } = waybillData;
        const labelFileName = await dpdService.generateSpedLabels(waybill, sessionId, packageReference, parcelReference);

        // Update Database: Insert into shipments table
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO shipments (order_id, waybill, label_path, provider) VALUES (?, ?, ?, ?)',
                [orderId, waybill, `/labels/${labelFileName}`, 'DPD'],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        // Update main order status
        db.run('UPDATE orders SET status = "Label Created" WHERE id = ?', [orderId]);

        res.json({ success: true, waybill, labelPath: `/labels/${labelFileName}` });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate APaczka (InPost) Label
router.post('/generate-apaczka-label/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const { senderId } = req.body;

    try {
        const order = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE id = ?', [orderId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        const sender = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM senders WHERE id = ?', [senderId], (err, row) => {
                if (err) reject(err); else resolve(row);
            });
        });

        if (!order || !sender) return res.status(404).json({ error: 'Order or Sender not found' });
        if (!order.paczkomat_id) return res.status(400).json({ error: 'Brak kodu paczkomatu. Proszę uzupełnić dane.' });

        const shipmentData = await apaczkaService.createShipment(order, sender);
        const labelData = await apaczkaService.getLabel(shipmentData.orderId);
        
        const finalWaybill = labelData.waybill || shipmentData.waybill;
        const labelFileName = labelData.fileName;

        // Update Database: Insert into shipments table
        await new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO shipments (order_id, waybill, label_path, provider) VALUES (?, ?, ?, ?)',
                [orderId, finalWaybill, `/labels/${labelFileName}`, 'APaczka'],
                (err) => { if (err) reject(err); else resolve(); }
            );
        });

        // Update main order status
        db.run('UPDATE orders SET status = "Label Created" WHERE id = ?', [orderId]);

        res.json({ success: true, waybill: finalWaybill, labelPath: `/labels/${labelFileName}` });
    } catch (error) {
        console.error('APaczka API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update Invoice Number
router.post('/update-invoice/:orderId', (req, res) => {
    const { orderId } = req.params;
    const { invoiceNumber } = req.body;
    
    db.run('UPDATE orders SET invoice_number = ? WHERE id = ?', [invoiceNumber, orderId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Update InPost Details
router.post('/update-inpost/:orderId', (req, res) => {
    const { orderId } = req.params;
    const { paczkomatId, parcelSize } = req.body;
    
    db.run('UPDATE orders SET paczkomat_id = ?, parcel_size = ? WHERE id = ?', [paczkomatId, parcelSize, orderId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Delete Shipment
router.delete('/shipments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM shipments WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Delete Shipment by Waybill
router.delete('/shipments/waybill/:waybill', (req, res) => {
    const { waybill } = req.params;
    db.run('DELETE FROM shipments WHERE waybill = ?', [waybill], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

module.exports = router;
