const fs = require('fs');
const path = require('path');
const { db } = require('../models/db');
const prestaShopService = require('./prestaShopService');

let pollInterval;
const logFile = path.resolve(__dirname, '../../prestashop.log');

const log = (message) => {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `${timestamp} - ${message}
`);
};

const pollNewOrders = async () => {
    log('Checking for new PrestaShop orders...');
    try {
        const orderIds = await prestaShopService.getNewOrderIds();
        if (!orderIds || orderIds.length === 0) {
            log('No new PrestaShop orders found.');
            return;
        }

        log(`Found ${orderIds.length} new order(s). Fetching details...`);
        
        db.serialize(() => {
            const insertStmt = db.prepare(`INSERT OR IGNORE INTO orders 
                (order_number, customer_name, company_name, nip, email, phone, street, city, zip_code, payment_method, total_price, delivery_method, status, created_at, paczkomat_id, parcel_size, source) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            const checkStmt = db.prepare('SELECT id FROM orders WHERE order_number = ?');

            for (const orderId of orderIds) {
                checkStmt.get(orderId, async (err, row) => {
                    if (err) {
                        log(`DB Error checking for order ${orderId}: ${err.message}`);
                        return;
                    }
                    if (row) {
                        return;
                    }
                    
                    try {
                        const order = await prestaShopService.getOrderDetails(orderId);
                        if (order) {
                            insertStmt.run(
                                order.order_number, order.customer_name, order.company_name, order.nip,
                                order.email, order.phone, order.street, order.city, order.zip_code,
                                order.payment_method, order.total_price, order.delivery_method,
                                order.status, order.created_at, order.paczkomat_id, order.parcel_size,
                                order.source
                            );
                            log(`Successfully imported PrestaShop order #${order.order_number}`);
                        }
                    } catch (e) {
                        log(`Failed to process order ${orderId}: ${e.message}`);
                    }
                });
            }
            insertStmt.finalize();
            checkStmt.finalize();
        });

    } catch (error) {
        log(`FATAL: Failed to poll PrestaShop orders: ${error.message}`);
    }
};

const startPrestaShopListener = () => {
    if (!process.env.PRESTASHOP_API_KEY || !process.env.PRESTASHOP_SHOP_URL) {
        log('WARNING: PrestaShop API key or URL not set. Listener will not start.');
        return;
    }
    log('Listener starting...');
    pollNewOrders();
    pollInterval = setInterval(pollNewOrders, 5 * 60 * 1000);
};

const stopPrestaShopListener = () => {
    if (pollInterval) {
        clearInterval(pollInterval);
    }
    log('Listener stopped.');
};

module.exports = { startPrestaShopListener, stopPrestaShopListener };
