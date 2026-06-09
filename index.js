require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const path = require('path');
const { initDb } = require('./src/models/db');
const { importSenders } = require('./src/utils/excelImporter');
const { startEmailListener } = require('./src/services/emailListener');
const { startPrestaShopListener } = require('./src/services/prestaShopListener');
const apiRouter = require('./src/services/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// app.use(morgan('dev')); // Disabled for performance
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

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

    // Automatically build frontend on start to ensure latest changes are live
    console.log('Building frontend assets...');
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { cwd: path.join(__dirname, 'client'), stdio: 'inherit' });
      console.log('Frontend build successful.');
    } catch (buildError) {
      console.error('Frontend build failed, serving existing assets:', buildError.message);
    }
    
    // Non-blocking initialization
    (async () => {
        try {
            await importSenders();
            startEmailListener();
            startPrestaShopListener();
        } catch (e) {
            console.error('Background initialization error:', e);
        }
    })();
    
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
