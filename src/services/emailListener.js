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

        // Limit search to last 3 days to prevent long startup times
        const delay = 3 * 24 * 3600 * 1000; // 3 days in ms
        const sinceDate = new Date(Date.now() - delay).toISOString();
        
        const searchCriteria = [['SUBJECT', 'Zamówienie nr'], ['SINCE', sinceDate]]; 
        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],
            markSeen: false 
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (messages.length > 0) {
            console.log(`Found ${messages.length} potential order emails from the last 3 days.`);
        }

        for (const item of messages) {
            try {
                const id = item.attributes.uid;
                
                // Quick check: Extract order number from subject before full parsing
                const subjectHeader = item.parts.find(p => p.which === 'HEADER').body.subject[0];
                const orderNumberMatch = subjectHeader.match(/Zamówienie nr\s*\b(\d{4,6})\b/i);
                
                if (orderNumberMatch) {
                    const orderNo = orderNumberMatch[1];
                    const exists = await new Promise(res => {
                        db.get('SELECT id FROM orders WHERE order_number = ?', [orderNo], (err, row) => res(!!row));
                    });
                    if (exists) continue; // Skip if order number is already in DB
                }

                const all = item.parts.find(part => part.which === '');
                const idHeader = `Imap-Id: ${id}\r\n`;
                
                const mail = await simpleParser(idHeader + all.body);
                const { orderData, parsing_status, parsing_warnings } = parseOrderEmail(mail.text, mail.subject);

                if (parsing_status === 'FAILED') {
                    console.warn(`Skipping email UID ${id}: parsing failed. Reason: ${parsing_warnings.join(', ')}`);
                    continue;
                }

                if (orderData) {
                    const { isNew, status } = await saveOrderToDb(orderData, parsing_status, mail.text);
                    if (isNew) {
                        console.log(`+ New order saved: ${orderData.order_number} | Status: ${status}`);
                        if (parsing_warnings.length > 0) {
                            console.warn(`  - Warnings for ${orderData.order_number}: ${parsing_warnings.join('; ')}`);
                        }
                    }
                }
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
