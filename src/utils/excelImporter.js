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

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const stmt = db.prepare(`INSERT OR REPLACE INTO senders 
          (id, name, company, street, city, zip_code, phone, email, fid) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        data.forEach((row, index) => {
          stmt.run(
            index + 1,
            row['Imię Nazwisko'] || '',
            row['Firma'] || '',
            row['Ulica'] || '',
            row['Miasto'] || '',
            row['Kod pocztowy'] || '',
            row['Telefon'] ? String(row['Telefon']) : '',
            '', // Email is not in Excel
            row['Numer'] ? String(row['Numer']) : ''
          );
        });

        stmt.finalize((err) => {
          if (err) reject(err);
          else {
            console.log(`Successfully imported ${data.length} senders.`);
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
