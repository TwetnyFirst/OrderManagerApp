const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// MiddleWare to ensure fast response and logging
router.use((req, res, next) => {
    console.log(`[API] ${req.method} ${req.url}`);
    next(); 
});

const { db } = require('../models/db');
const dpdService = require('../services/dpdService');
const apaczkaService = require('../services/apaczkaService');

const { startEmailListener, processEmails } = require('./emailListener');
const { syncPrestaShopOrders } = require('./prestaShopListener');

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

// Manual PrestaShop Sync
router.post('/sync-prestashop', async (req, res) => {
    try {
        const result = await syncPrestaShopOrders();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Manual Email Sync
router.post('/sync-email', async (req, res) => {
    try {
        const result = await processEmails();
        res.json({ success: true, count: result?.count || 0 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get orders with pagination and associated shipments
router.get('/orders', async (req, res) => {
    const start = Date.now();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const source = req.query.source;
    const search = req.query.search;

    try {
        const params = [];
        let countSql = 'SELECT COUNT(*) as count FROM orders WHERE 1=1';
        
        if (source) {
            countSql += ' AND source = ?';
            params.push(source);
        }
        
        if (search) {
            countSql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR city LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        const { count } = await p.get(countSql, params);
        const tCount = Date.now() - start;

        let sql = 'SELECT * FROM orders WHERE 1=1';
        const queryParams = [...params];
        
        if (source) {
            sql += ' AND source = ?';
        }
        if (search) {
            sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR email LIKE ? OR city LIKE ?)';
        }
        
        // Sorting by numeric order_number DESC for Email and PrestaShop
        sql += ' ORDER BY CAST(order_number AS INTEGER) DESC LIMIT ? OFFSET ?'; 
        queryParams.push(limit, offset);

        const orders = await p.all(sql, queryParams);
        const tOrders = Date.now() - start - tCount;

        if (orders.length > 0) {
            const orderIds = orders.map(o => o.id);
            // Optimization: select only needed columns
            const shipments = await p.all(
                `SELECT id, order_id, waybill, label_path, provider, created_at FROM shipments WHERE order_id IN (${orderIds.map(() => '?').join(',')})`,
                orderIds
            );

            // Optimization: Use a map for O(1) lookup instead of filter() inside loop
            const shipmentsMap = {};
            shipments.forEach(s => {
                if (!shipmentsMap[s.order_id]) shipmentsMap[s.order_id] = [];
                shipmentsMap[s.order_id].push(s);
            });

            orders.forEach(order => {
                order.shipments = shipmentsMap[order.id] || [];
            });
        }
        const tShipments = Date.now() - start - tCount - tOrders;
        
        const total = Date.now() - start;
        console.log(`[PERF] /orders (${source}): total=${total}ms (count=${tCount}ms, orders=${tOrders}ms, shipments=${tShipments}ms)`);

        res.json({
            orders,
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

const { sendEmail, templates } = require('./emailService');

// Send Email to Customer or Sender
router.post('/send-email', async (req, res) => {
    const { orderId, target, template, customSubject, customBody, senderId, productName } = req.body;

    try {
        const order = await p.get('SELECT * FROM orders WHERE id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        let to = "";
        let emailData = { subject: "", text: "", html: "" };

        if (target === 'customer') {
            to = order.email;
            if (template === 'custom') {
                emailData = templates.customer.custom(customSubject, customBody);
            } else if (template === 'out_of_stock') {
                emailData = templates.customer.out_of_stock(order, productName);
            } else if (templates.customer[template]) {
                // For order_shipped, we might need a waybill
                const shipment = await p.get('SELECT waybill FROM shipments WHERE order_id = ? ORDER BY id DESC', [orderId]);
                emailData = templates.customer[template](order, shipment ? shipment.waybill : 'Wkrótce zostanie podany');
            }
        } else if (target === 'sender') {
            const sender = await p.get('SELECT * FROM senders WHERE id = ?', [senderId]);
            if (!sender || !sender.email) return res.status(400).json({ error: 'Sender email not found' });
            to = sender.email;
            emailData = templates.sender.new_order(sender, order);
        }

        if (!to) return res.status(400).json({ error: 'Recipient email address is missing' });

        const result = await sendEmail({
            to,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html
        });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Email API Error:', error);
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

// Catch-all for unmatched API routes
router.use((req, res) => {
    console.warn(`[API] 404 - Unmatched route: ${req.method} ${req.url}`);
    res.status(404).json({ error: `Route ${req.method} ${req.url} not found` });
});

module.exports = router;
