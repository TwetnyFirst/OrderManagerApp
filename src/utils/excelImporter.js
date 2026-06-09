const xlsx = require('xlsx');
const { db } = require('../models/db');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const importSenders = async () => {
  const filePath = process.env.SENDERS_EXCEL_PATH || path.resolve(__dirname, '../../Senders.xlsx');
  
  if (!fs.existsSync(filePath)) {
    console.warn(`Senders file not found at ${filePath}, skipping import.`);
    return;
  }

  // Simple optimization: check if file has changed since last import
  const stats = fs.statSync(filePath);
  const lastModified = stats.mtimeMs;
  
  // Track last modified in a small file
  const cachePath = path.resolve(__dirname, '../../.senders_cache');
  if (fs.existsSync(cachePath)) {
    const cachedTime = parseFloat(fs.readFileSync(cachePath, 'utf8'));
    if (cachedTime === lastModified) {
      console.log('Senders file not changed, skipping import.');
      return;
    }
  }

  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let importedCount = 0;

    await new Promise((resolve, reject) => {
      db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO senders 
          (fid, name, company, street, city, zip_code, phone, email) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

        data.forEach((row) => {
          const fid = row['Numer'] ? String(row['Numer']) : null;
          if (!fid) return;

          // Mapping column names from Excel to DB fields
          const email = row['Email'] || row['E-mail'] || row['email'] || '';

          stmt.run(
            fid,
            row['Imię Nazwisko'] || '',
            row['Firma'] || '',
            row['Ulica'] || '',
            row['Miasto'] || '',
            row['Kod pocztowy'] || '',
            row['Telefon'] ? String(row['Telefon']) : '',
            email
          );
          importedCount++;
        });

        stmt.finalize((err) => {
          if (err) reject(err);
          else {
            console.log(`Successfully imported or updated ${importedCount} senders.`);
            fs.writeFileSync(cachePath, lastModified.toString());
            resolve();
          }
        });
      });
    });
  } catch (error) {
    console.error('Error importing senders:', error);
  }
};

module.exports = { importSenders };
