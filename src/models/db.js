const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Senders Table
      db.run(`CREATE TABLE IF NOT EXISTS senders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        company TEXT,
        street TEXT,
        city TEXT,
        zip_code TEXT,
        phone TEXT,
        email TEXT,
        fid TEXT
      )`, (err) => {
        if (err) reject(err);
      });

      // Shipments Table (New: Multiple labels per order)
      db.run(`CREATE TABLE IF NOT EXISTS shipments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        waybill TEXT,
        label_path TEXT,
        provider TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )`, (err) => {
        if (err) reject(err);
      });

      // Orders Table
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        customer_name TEXT,
        company_name TEXT,
        nip TEXT,
        email TEXT,
        phone TEXT,
        street TEXT,
        city TEXT,
        zip_code TEXT,
        delivery_method TEXT,
        payment_method TEXT,
        total_price REAL,
        packages_count INTEGER DEFAULT 1,
        status TEXT DEFAULT 'New',
        dpd_waybill TEXT,
        label_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          // 1. Migration: Move existing data from orders to shipments
          db.all("SELECT id, dpd_waybill, label_path FROM orders WHERE dpd_waybill IS NOT NULL", (selErr, rows) => {
            if (!selErr && rows.length > 0) {
              const stmt = db.prepare("INSERT INTO shipments (order_id, waybill, label_path, provider) SELECT ?, ?, ?, 'DPD' WHERE NOT EXISTS (SELECT 1 FROM shipments WHERE order_id = ? AND waybill = ?)");
              rows.forEach(row => {
                stmt.run(row.id, row.dpd_waybill, row.label_path, row.id, row.dpd_waybill);
              });
              stmt.finalize();
            }
          });

          // 2. Migration: Add columns
          db.run("ALTER TABLE orders ADD COLUMN delivery_method TEXT", (alterErr) => {
            db.run("ALTER TABLE orders ADD COLUMN invoice_number TEXT", (invErr) => {
              db.run("ALTER TABLE orders ADD COLUMN paczkomat_id TEXT", (pIdErr) => {
                db.run("ALTER TABLE orders ADD COLUMN parcel_size TEXT DEFAULT 'C'", (sizeErr) => {
                  resolve();
                });
              });
            });
          });
        }
      });
    });
  });
};

module.exports = {
  db,
  initDb
};
