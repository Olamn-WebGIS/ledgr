import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import { authMiddleware } from './authMiddleware.js';
import { getDashboard } from './controllers/dashboardController.js';
import { createAccount } from './controllers/authController.js';
import { createProduct, deleteAllProducts, deleteProduct, getProductByName, updateProduct } from './controllers/productsController.js';
import { createSale, deleteAllSales } from './controllers/salesController.js';
import { createRestock, deleteAllRestocks } from './controllers/restockController.js';
import { deleteActivityEntry, deleteAllActivities, refundActivityEntry, updateActivityEntry } from './controllers/activityController.js';
import { createExpense, deleteAllExpenses, deleteExpense, listExpenses, updateExpense } from './controllers/expensesController.js';
import { resetWorkspace } from './controllers/workspaceController.js';
import { savePushSubscription, sendPushNotification } from './controllers/pushController.js';

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

// Auth middleware to extract userId from JWT
app.use(authMiddleware);

// Public endpoints (no auth required)
app.post('/api/auth/signup', createAccount);
app.post('/api/push/subscribe', savePushSubscription);
app.post('/api/push/send', sendPushNotification);

// Protected endpoints (auth required)
app.get('/api/dashboard', getDashboard);
app.get('/api/products', getProductByName);
app.post('/api/products', createProduct);
app.put('/api/products/:id', updateProduct);
app.delete('/api/products', deleteAllProducts);
app.delete('/api/products/:id', deleteProduct);
app.post('/api/sales', createSale);
app.delete('/api/sales', deleteAllSales);
app.post('/api/restocks', createRestock);
app.delete('/api/restocks', deleteAllRestocks);
app.get('/api/expenses', listExpenses);
app.post('/api/expenses', createExpense);
app.put('/api/expenses/:id', updateExpense);
app.delete('/api/expenses', deleteAllExpenses);
app.delete('/api/expenses/:id', deleteExpense);
app.put('/api/activities/:id', updateActivityEntry);
app.delete('/api/activities', deleteAllActivities);
app.delete('/api/activities/:id', deleteActivityEntry);
app.post('/api/activities/:id/refund', refundActivityEntry);
app.post('/api/workspace/reset', resetWorkspace);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (process.argv[1] === __filename) {
  app.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

export default app;
