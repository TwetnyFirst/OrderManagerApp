const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Enable WAL mode for better concurrency
db.run('PRAGMA journal_mode = WAL');

const initDb = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Senders Table
      db.run(`CREATE TABLE IF NOT EXISTS senders (
        fid TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        street TEXT,
        city TEXT,
        zip_code TEXT,
        phone TEXT,
        email TEXT
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT DEFAULT 'Email'
      )`, (err) => {
        if (err) {
          reject(err);
        } else {
          // Migration for older columns if they don't exist
          const columns_to_add = [
            "ALTER TABLE orders ADD COLUMN delivery_method TEXT",
            "ALTER TABLE orders ADD COLUMN invoice_number TEXT",
            "ALTER TABLE orders ADD COLUMN paczkomat_id TEXT",
            "ALTER TABLE orders ADD COLUMN parcel_size TEXT DEFAULT 'C'",
            "ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'Email'",
            "ALTER TABLE orders ADD COLUMN parsing_status TEXT",
            "ALTER TABLE orders ADD COLUMN raw_email_body TEXT"
          ];
          
          db.serialize(() => {
            columns_to_add.forEach(addColumn => {
              db.run(addColumn, (err) => {
                if (err && !err.message.includes('duplicate column')) {
                  console.error(`Migration error: ${err.message}`);
                }
              });
            });
            resolve();
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
