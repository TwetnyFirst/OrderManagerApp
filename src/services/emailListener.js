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
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false },
    }
};

const saveOrderToDb = (orderData, parsing_status, raw_email_body) => {
    return new Promise((resolve, reject) => {
        // First check if order already exists to avoid unnecessary processing
        db.get('SELECT id FROM orders WHERE order_number = ?', [orderData.order_number], (err, row) => {
            if (err) return reject(err);
            if (row) {
                return resolve({ isNew: false }); // Order already exists
            }

            const stmt = db.prepare(`INSERT INTO orders 
                (order_number, customer_name, company_name, nip, email, phone, street, city, zip_code, delivery_method, payment_method, total_price, source, parsing_status, raw_email_body) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
            
            stmt.run(
                orderData.order_number,
                orderData.customer_name,
                orderData.company_name,
                orderData.nip,
                orderData.email,
                orderData.phone,
                orderData.street,
                orderData.city,
                orderData.zip_code,
                orderData.delivery_method,
                orderData.payment_method,
                orderData.total_price,
                'Email', // Set source
                parsing_status,
                raw_email_body,
                function(err) {
                    if (err) reject(err);
                    else resolve({ isNew: true, status: parsing_status }); // New order saved
                }
            );
            stmt.finalize();
        });
    });
};

const processEmails = async () => {
    let connection;
    try {
        console.log(`Checking for email orders...`);
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        const delay = 3 * 24 * 3600 * 1000;
        const sinceDate = new Date(Date.now() - delay).toISOString();
        
        // Step 1: Search only for UIDs and Headers to minimize initial download
        const searchCriteria = [['SUBJECT', 'Zamówienie nr'], ['SINCE', sinceDate]]; 
        const fetchOptions = {
            bodies: ['HEADER'],
            markSeen: false 
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (messages.length === 0) return;

        console.log(`Found ${messages.length} potential order emails. Filtering...`);

        // Step 2: Get all existing order numbers in one go for O(1) lookup
        const existingOrders = await new Promise((res, rej) => {
            db.all('SELECT order_number FROM orders WHERE source = "Email"', (err, rows) => {
                if (err) rej(err); else res(new Set(rows.map(r => r.order_number)));
            });
        });

        for (const item of messages) {
            try {
                const id = item.attributes.uid;
                const subjectHeader = item.parts.find(p => p.which === 'HEADER').body.subject[0];
                const orderNumberMatch = subjectHeader.match(/Zamówienie nr\s*\b(\d{4,6})\b/i);
                
                if (orderNumberMatch) {
                    const orderNo = orderNumberMatch[1];
                    if (existingOrders.has(orderNo)) continue; 
                }

                // Step 3: Only download full body if it's a new order
                const fullFetchOptions = {
                    bodies: [''],
                    markSeen: false
                };
                
                // Fetch the single message body
                const fullMessages = await connection.fetch(id, fullFetchOptions);
                const fullItem = fullMessages[0];
                const all = fullItem.parts.find(part => part.which === '');
                
                const mail = await simpleParser(all.body);
                const { orderData, parsing_status, parsing_warnings } = parseOrderEmail(mail.text, mail.subject);

                if (orderData && !existingOrders.has(orderData.order_number)) {
                    const { isNew, status } = await saveOrderToDb(orderData, parsing_status, mail.text);
                    if (isNew) {
                        console.log(`+ New order saved: ${orderData.order_number} | Status: ${status}`);
                        existingOrders.add(orderData.order_number);
                    }
                }

                // Yield to event loop to keep API responsive
                await new Promise(resolve => setImmediate(resolve));

            } catch (innerError) {
                console.error(`Error processing UID ${item.attributes.uid}:`, innerError.message);
            }
        }

    } catch (error) {
        console.error('--- IMAP CONNECTION ERROR ---');
        console.error('An error occurred during the email check process. Please verify IMAP credentials and server details.');
        console.error('Error details:', error.message);
    } finally {
        if (connection) connection.end();
    }
};

// Polling interval (e.g., every 5 minutes)
const startEmailListener = () => {
    console.log('Email listener started. First check in 10 seconds...');
    setTimeout(processEmails, 10000); // Run after a short delay on start
    setInterval(processEmails, 5 * 60 * 1000); 
};

module.exports = { startEmailListener };
