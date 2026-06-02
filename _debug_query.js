const { db } = require('./src/models/db');

const orderNumber = '34960';

const sql = `
    SELECT 
        raw_email_body, 
        street, 
        city, 
        zip_code 
    FROM orders 
    WHERE order_number = ?
`;

db.get(sql, [orderNumber], (err, row) => {
    if (err) {
        console.error(JSON.stringify({ error: err.message }));
    } else if (row) {
        console.log(JSON.stringify(row, null, 2));
    } else {
        console.log(JSON.stringify({ message: `Order ${orderNumber} not found.` }));
    }
    db.close();
});
