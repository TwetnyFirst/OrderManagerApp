const xlsx = require('xlsx');
const { db } = require('../models/db');
const path = require('path');
require('dotenv').config();

const importSenders = async () => {
  const filePath = process.env.SENDERS_EXCEL_PATH || path.resolve(__dirname, '../../Senders.xlsx');
  
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let importedCount = 0;

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO senders 
          (fid, name, company, street, city, zip_code, phone, email) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

        data.forEach((row) => {
          const fid = row['Numer'] ? String(row['Numer']) : null;

          if (!fid) {
            console.warn('Skipping sender row: "Numer" (FID) column is missing or empty.');
            return;
          }

          stmt.run(
            fid,
            row['Imię Nazwisko'] || '',
            row['Firma'] || '',
            row['Ulica'] || '',
            row['Miasto'] || '',
            row['Kod pocztowy'] || '',
            row['Telefon'] ? String(row['Telefon']) : '',
            row['Email'] || '' // Get email from excel if it exists
          );
          importedCount++;
        });

        stmt.finalize((err) => {
          if (err) reject(err);
          else {
            console.log(`Successfully imported or updated ${importedCount} senders.`);
            resolve();
          }
        });
      });
    });
  } catch (error) {
    console.error('Error importing senders:', error);
    throw error;
  }
};

module.exports = { importSenders };
