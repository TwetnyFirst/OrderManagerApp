const fs = require('fs');
const path = require('path');
const { db } = require('../models/db');
const prestaShopService = require('./prestaShopService');

const logFile = path.resolve(__dirname, '../../prestashop.log');

const log = (message) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `${timestamp} - ${message}\n`);
};

const syncPrestaShopOrders = async () => {
    log('Manual PrestaShop sync started...');
    try {
        const orderIds = await prestaShopService.getNewOrderIds();
        if (!orderIds || orderIds.length === 0) {
            log('No orders found in PrestaShop.');
            return { count: 0 };
        }

        const existingOrders = await new Promise((res, rej) => {
            db.all('SELECT order_number FROM orders WHERE source = "PrestaShop"', (err, rows) => {
                if (err) rej(err); else res(new Set(rows.map(r => r.order_number)));
            });
        });

        let newCount = 0;
        for (const orderId of orderIds) {
            if (existingOrders.has(String(orderId))) continue;

            try {
                const order = await prestaShopService.getOrderDetails(orderId);
                if (order && !existingOrders.has(order.order_number)) {
                    await new Promise((res, rej) => {
                        db.run(`INSERT OR IGNORE INTO orders 
                            (order_number, customer_name, company_name, nip, email, phone, street, city, zip_code, payment_method, total_price, delivery_method, status, created_at, paczkomat_id, parcel_size, source) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                order.order_number, order.customer_name, order.company_name, order.nip,
                                order.email, order.phone, order.street, order.city, order.zip_code,
                                order.payment_method, order.total_price, order.delivery_method,
                                order.status, order.created_at, order.paczkomat_id, order.parcel_size,
                                order.source
                            ], (err) => err ? rej(err) : res());
                    });
                    newCount++;
                }
            } catch (e) {
                log(`Failed to process PrestaShop order ${orderId}: ${e.message}`);
            }
        }
        log(`Sync finished. Imported ${newCount} new orders.`);
        return { count: newCount };
    } catch (error) {
        log(`Sync Error: ${error.message}`);
        throw error;
    }
};

const startPrestaShopListener = () => {
    log('PrestaShop manual sync mode initialized.');
};

module.exports = { startPrestaShopListener, syncPrestaShopOrders };
