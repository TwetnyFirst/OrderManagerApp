require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const { initDb } = require('./src/models/db');
const { importSenders } = require('./src/utils/excelImporter');
const { startEmailListener } = require('./src/services/emailListener');
const apiRouter = require('./src/services/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve labels from LABELS_DIR if defined, otherwise from local 'labels' folder
const labelsPath = process.env.LABELS_DIR || path.join(__dirname, 'labels');
app.use('/labels', express.static(labelsPath));

// Routes
app.use('/api', apiRouter);

// Initialize App
const startServer = async () => {
  try {
    await initDb();
    console.log('Database initialized.');
    
    await importSenders();
    
    startEmailListener();
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
