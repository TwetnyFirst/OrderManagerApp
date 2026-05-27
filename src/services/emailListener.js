const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { parseOrderEmail } = require('../utils/parser');
const { db } = require('../models/db');
require('dotenv').config();

const config = {
    imap: {
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASSWORD,
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT) || 993,
        tls: process.env.IMAP_TLS === 'true',
        authTimeout: 10000, // Увеличим таймаут до 10 секунд
        tlsOptions: { rejectUnauthorized: false }, // Игнорировать проблемы с самоподписанными сертификатами
        debug: console.log // Включаем детальный лог протокола IMAP
    }
};

const saveOrderToDb = (order) => {
    return new Promise((resolve, reject) => {
        // First check if order already exists to avoid unnecessary processing
        db.get('SELECT id FROM orders WHERE order_number = ?', [order.order_number], (err, row) => {
            if (err) return reject(err);
            if (row) {
                return resolve(false); // Order already exists
            }

            const stmt = db.prepare(`INSERT INTO orders 
                (order_number, customer_name, company_name, nip, email, phone, street, city, zip_code, delivery_method, payment_method, total_price) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            
            stmt.run(
                order.order_number,
                order.customer_name,
                order.company_name,
                order.nip,
                order.email,
                order.phone,
                order.street,
                order.city,
                order.zip_code,
                order.delivery_method,
                order.payment_method,
                order.total_price,
                function(err) {
                    if (err) reject(err);
                    else resolve(true); // New order saved
                }
            );
            stmt.finalize();
        });
    });
};

const processEmails = async () => {
    let connection;
    try {
        console.log(`Checking for orders...`);
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        // Limit search to last 3 days to prevent long startup times
        const delay = 3 * 24 * 3600 * 1000; // 3 days in ms
        const yesterday = new Date(Date.now() - delay).toISOString();
        
        const searchCriteria = [['SUBJECT', 'Zamówienie nr'], ['SINCE', yesterday]]; 
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false 
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log(`Found ${messages.length} messages in the last 3 days.`);

        for (const item of messages) {
            try {
                const id = item.attributes.uid;
                
                // Quick check: Extract order number from subject before full parsing
                const subject = item.parts.find(p => p.which === 'HEADER').body.subject[0];
                const orderNumberMatch = subject.match(/Zamówienie nr\s*\b(\d{4,6})\b/i);
                
                if (orderNumberMatch) {
                    const orderNo = orderNumberMatch[1];
                    // Check if exists in DB before heavy parsing
                    const exists = await new Promise(res => {
                        db.get('SELECT id FROM orders WHERE order_number = ?', [orderNo], (err, row) => res(!!row));
                    });
                    if (exists) continue;
                }

                const all = item.parts.find(part => part.which === '');
                const idHeader = `Imap-Id: ${id}\r\n`;
                
                const mail = await simpleParser(idHeader + all.body);
                const parsedOrder = parseOrderEmail(mail.text, mail.subject);

                if (parsedOrder) {
                    const isNew = await saveOrderToDb(parsedOrder);
                    if (isNew) {
                        console.log(`+ New order saved: ${parsedOrder.order_number}`);
                    }
                }
            } catch (innerError) {
                console.error(`Error processing UID ${item.attributes.uid}:`, innerError.message);
            }
        }

    } catch (error) {
        console.error('--- IMAP CONNECTION ERROR DETAILS ---');
        console.error('Message:', error.message);
        if (error.source) console.error('Source:', error.source);
        if (error.textCode) console.error('Code:', error.textCode);
        console.error('-------------------------------------');
    } finally {
        if (connection) connection.end();
    }
};

// Polling interval (e.g., every 5 minutes)
const startEmailListener = () => {
    console.log('Email listener started...');
    processEmails(); // Run immediately on start
    setInterval(processEmails, 5 * 60 * 1000); 
};

module.exports = { startEmailListener };
