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

let isProcessing = false;

const processEmails = async () => {
    if (isProcessing) return;
    isProcessing = true;
    
    let connection;
    try {
        connection = await imaps.connect(config);
        
        const folders = ['INBOX', 'INBOX.Spam'];
        let newOrdersCount = 0;
        let newNotificationsCount = 0;

        for (const folder of folders) {
            try {
                console.log(`[Email] Opening folder ${folder}...`);
                await connection.openBox(folder);

                // Scan orders from the last 14 days to make sure we don't miss anything due to downtime or spam delay
                const daysToLookBack = 14;
                const targetDate = new Date();
                targetDate.setDate(targetDate.getDate() - daysToLookBack);
                
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const imapDate = `${targetDate.getDate()}-${months[targetDate.getMonth()]}-${targetDate.getFullYear()}`;
                
                // Fetch all emails matching "Zamówienie" in subject since target date (seen or unseen)
                const searchCriteria = [['SINCE', imapDate], ['SUBJECT', 'Zamówienie']]; 
                const fetchOptions = {
                    bodies: ['HEADER'],
                    markSeen: false
                };

                const messages = await connection.search(searchCriteria, fetchOptions);
                if (messages.length === 0) {
                    console.log(`[Email] No matching messages found in folder ${folder}`);
                    continue;
                }

                console.log(`[Email] Found ${messages.length} matching emails in folder ${folder}. Processing...`);

                for (const item of messages) {
                    try {
                        const id = item.attributes.uid;
                        const headerPart = item.parts.find(p => p.which === 'HEADER');
                        if (!headerPart || !headerPart.body) continue;

                        const subjectHeader = (headerPart.body.subject && headerPart.body.subject[0]) || '';
                        if (!subjectHeader) continue;

                        const messageId = ((headerPart.body['message-id'] && headerPart.body['message-id'][0]) || '').trim();
                        const inReplyTo = ((headerPart.body['in-reply-to'] && headerPart.body['in-reply-to'][0]) || '').trim();

                        let orderNo = null;
                        let existingOrder = null;

                        // 1. Try to find order number in subject
                        const orderNumberMatch = subjectHeader.match(/(?:#|nr|zamówienie|zamówienia)\s*\b(\d{4,7})\b/i) || subjectHeader.match(/\b([A-Z]{9})\b/);
                        
                        if (orderNumberMatch) {
                            const potentialNo = orderNumberMatch[1];
                            const isComplexReference = subjectHeader.includes('/' + potentialNo) || subjectHeader.includes(potentialNo + '/');
                            
                            if (!isComplexReference) {
                                orderNo = potentialNo;
                                existingOrder = await new Promise((res, rej) => {
                                    db.get('SELECT id, email FROM orders WHERE order_number = ?', [orderNo], (err, row) => {
                                        if (err) rej(err); else res(row);
                                    });
                                });
                            }
                        }

                        // 2. If not found in subject, try matching via In-Reply-To
                        if (!existingOrder && inReplyTo) {
                            const sentEmail = await new Promise((res, rej) => {
                                db.get('SELECT order_id FROM sent_emails WHERE message_id = ?', [inReplyTo], (err, row) => {
                                    if (err) rej(err); else res(row);
                                });
                            });
                            
                            if (sentEmail) {
                                existingOrder = await new Promise((res, rej) => {
                                    db.get('SELECT id, email, order_number FROM orders WHERE id = ?', [sentEmail.order_id], (err, row) => {
                                        if (err) rej(err); else res(row);
                                    });
                                });
                                if (existingOrder) orderNo = existingOrder.order_number;
                            }
                        }

                        if (existingOrder) {
                            // Notification for EXISTING order - Proceed with saving
                            const notificationExists = await new Promise((res, rej) => {
                                if (messageId) {
                                    db.get('SELECT id FROM order_notifications WHERE message_id = ?', [messageId], (err, row) => {
                                        if (err) rej(err); else res(row);
                                    });
                                } else {
                                    db.get('SELECT id FROM order_notifications WHERE order_id = ? AND subject = ? AND created_at > datetime("now", "-1 day")', 
                                        [existingOrder.id, subjectHeader], (err, row) => {
                                        if (err) rej(err); else res(row);
                                    });
                                }
                            });

                            if (notificationExists) continue;

                            const fullFetchOptions = { bodies: [''], markSeen: true };
                            const fullResults = await connection.search([['UID', id]], fullFetchOptions);
                            const fullItem = fullResults[0];
                            if (!fullItem) continue;
                            
                            const all = fullItem.parts.find(part => part.which === '');
                            const mail = await simpleParser(all.body);
                            
                            let type = 'INITIATIVE';
                            if (inReplyTo) {
                                const sentEmail = await new Promise((res, rej) => {
                                    db.get('SELECT id FROM sent_emails WHERE message_id = ?', [inReplyTo], (err, row) => {
                                        if (err) rej(err); else res(row);
                                    });
                                });
                                if (sentEmail) type = 'REPLY';
                            }

                            let bodyContent = mail.text;
                            if (!bodyContent && mail.html) {
                                bodyContent = mail.html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
                            }

                            await new Promise((res, rej) => {
                                db.run(`INSERT INTO order_notifications (order_id, type, from_email, subject, body, message_id) VALUES (?, ?, ?, ?, ?, ?)`,
                                    [existingOrder.id, type, mail.from?.value[0]?.address || 'Unknown', mail.subject, bodyContent, messageId],
                                    (err) => err ? rej(err) : res()
                                );
                            });

                            console.log(`> New Notification [${type}] for Order ${orderNo}`);
                            newNotificationsCount++;
                            continue; 
                        } else {
                            // If order doesn't exist, we only process it as a NEW order if it STRICTLY matches the store's template (not a thread reply)
                            const cleanSubject = subjectHeader.toLowerCase().trim();
                            const isReply = /^(?:re|odp|fwd|fw|odp\s*:|re\s*:)\b/i.test(cleanSubject);
                            const isStoreTemplate = !isReply && /zamówienie\s+nr\s+\d+\s+w\s+sklepie\s+instalszop\.pl/i.test(cleanSubject);
                            
                            if (!isStoreTemplate) {
                                 continue;
                            }
                        }

                        // Try to parse it as a NEW order (Original logic)
                        const fullFetchOptions = {
                            bodies: [''],
                            markSeen: true 
                        };
                        
                        const fullResults = await connection.search([['UID', id]], fullFetchOptions);
                        const fullItem = fullResults[0];
                        if (!fullItem) continue;
                        
                        const all = fullItem.parts.find(part => part.which === '');
                        const mail = await simpleParser(all.body);
                        const { orderData, parsing_status } = parseOrderEmail(mail.text, mail.subject);

                        if (orderData && String(orderData.order_number) === String(orderNo)) {
                            const { isNew, status } = await saveOrderToDb(orderData, parsing_status, mail.text);
                            if (isNew) {
                                console.log(`+ New order saved: ${orderData.order_number} | Status: ${status}`);
                                newOrdersCount++;
                            }
                        }

                        // Yield to event loop
                        await new Promise(resolve => setImmediate(resolve));

                    } catch (innerError) {
                        console.error(`Error processing UID ${item.attributes.uid} in ${folder}:`, innerError.message);
                    }
                }
            } catch (folderError) {
                console.error(`Error processing folder ${folder}:`, folderError.message);
            }
        }
        
        return { count: newOrdersCount, notifications: newNotificationsCount };

    } catch (error) {
        console.error('--- IMAP CONNECTION ERROR ---');
        console.error('An error occurred during the email check process. Please verify IMAP credentials and server details.');
        console.error('Error details:', error.message);
        throw error;
    } finally {
        isProcessing = false;
        if (connection) connection.end();
    }
};

// IMAP IDLE for true real-time push notifications
let idleConnection = null;

const startEmailListener = () => {
    console.log('Email background listener started (IMAP IDLE mode).');

    const setupIdle = () => {
        imaps.connect(config).then(async (connection) => {
            idleConnection = connection;
            await connection.openBox('INBOX');
            
            console.log('[IMAP IDLE] Connection established and listening for new emails...');
            
            // Run initial check
            processEmails().catch(e => console.error('Initial check failed:', e.message));

            connection.on('mail', (numNewMsgs) => {
                console.log(`\n[IMAP IDLE] ⚡ ${numNewMsgs} new email(s) detected in real-time! Triggering processor...`);
                processEmails().catch(e => console.error('IDLE trigger failed:', e.message));
            });

            connection.on('error', (err) => {
                console.error('[IMAP IDLE] connection error:', err.message);
            });

            connection.on('close', () => {
                console.log('[IMAP IDLE] connection closed. Reconnecting in 10s...');
                setTimeout(setupIdle, 10000);
            });
        }).catch(err => {
            console.error('[IMAP IDLE] Connection failed, retrying in 10s:', err.message);
            setTimeout(setupIdle, 10000);
        });
    };

    // Delay initial connection slightly to ensure DB and other services are ready
    setTimeout(setupIdle, 3000);
};

module.exports = { startEmailListener, processEmails };
