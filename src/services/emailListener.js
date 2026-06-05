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

        // Step 1: Search for orders from the last 3 days
        // IMAP SINCE expects a date in "DD-Mon-YYYY" format
        const daysToLookBack = 3;
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() - daysToLookBack);
        
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const imapDate = `${targetDate.getDate()}-${months[targetDate.getMonth()]}-${targetDate.getFullYear()}`;
        
        // Removed UNSEEN to catch orders read by other devices
        const searchCriteria = [['SUBJECT', 'Zamówienie nr'], ['SINCE', imapDate]]; 
        const fetchOptions = {
            bodies: ['HEADER'],
            markSeen: false // Don't mark as seen here, only if we actually process it? 
            // Actually, markSeen: true in search is only for the header.
        };

        const messages = await connection.search(searchCriteria, fetchOptions);
        if (messages.length === 0) {
            console.log('No order emails found in the last 3 days.');
            return;
        }

        // Increase limit to 50 to catch up faster
        const limitedMessages = messages.slice(-50); // Take the latest 50
        console.log(`Checking ${limitedMessages.length} latest emails (out of ${messages.length} found)...`);

        // Get last 1000 orders to prevent duplicates
        const existingOrders = await new Promise((res, rej) => {
            db.all('SELECT order_number FROM orders WHERE source = "Email" ORDER BY id DESC LIMIT 1000', (err, rows) => {
                if (err) rej(err); else res(new Set(rows.map(r => String(r.order_number))));
            });
        });

        let newOrdersCount = 0;
        for (const item of limitedMessages) {
            try {
                const id = item.attributes.uid;
                const subjectHeader = item.parts.find(p => p.which === 'HEADER').body.subject[0];
                const orderNumberMatch = subjectHeader.match(/Zamówienie nr\s*\b(\d{4,6})\b/i);
                
                let orderNo = "Unknown";
                if (orderNumberMatch) {
                    orderNo = orderNumberMatch[1];
                    if (existingOrders.has(String(orderNo))) {
                        // Optional: console.log(`Skipping duplicate order #${orderNo} (from header)`);
                        continue; 
                    }
                }

                // Step 3: Only download full body if it's a new order
                const fullFetchOptions = {
                    bodies: [''],
                    markSeen: true 
                };
                
                // Fix: Use search with UID as fetch/getMessage are not part of imap-simple API
                const fullResults = await connection.search([['UID', id]], fullFetchOptions);
                const fullItem = fullResults[0];
                
                if (!fullItem) {
                    console.warn(`! Could not fetch full content for UID ${id}`);
                    continue;
                }
                
                const all = fullItem.parts.find(part => part.which === '');
                if (!all || !all.body) {
                    console.warn(`! Empty body for UID ${id}`);
                    continue;
                }
                
                const mail = await simpleParser(all.body);
                const { orderData, parsing_status, parsing_warnings } = parseOrderEmail(mail.text, mail.subject);

                if (orderData) {
                    if (existingOrders.has(String(orderData.order_number))) {
                        continue;
                    }
                    
                    const { isNew, status } = await saveOrderToDb(orderData, parsing_status, mail.text);
                    if (isNew) {
                        console.log(`+ New order saved: ${orderData.order_number} | Status: ${status}`);
                        existingOrders.add(String(orderData.order_number));
                        newOrdersCount++;
                    }
                } else {
                    console.warn(`! Failed to parse order data from email UID ${id} | Subject: ${mail.subject}`);
                }

                // Yield to event loop to keep API responsive
                await new Promise(resolve => setImmediate(resolve));

            } catch (innerError) {
                console.error(`Error processing UID ${item.attributes.uid}:`, innerError.message);
            }
        }
        
        return { count: newOrdersCount };

    } catch (error) {
        console.error('--- IMAP CONNECTION ERROR ---');
        console.error('An error occurred during the email check process. Please verify IMAP credentials and server details.');
        console.error('Error details:', error.message);
        throw error;
    } finally {
        if (connection) connection.end();
    }
};

// Polling interval (disabled as requested, now via button)
const startEmailListener = () => {
    console.log('Email manual sync mode initialized.');
};

module.exports = { startEmailListener, processEmails };
