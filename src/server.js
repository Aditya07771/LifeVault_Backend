import dotenv from 'dotenv';
dotenv.config();
import app from './app.js';
import connectDB from './config/database.js';
import aptosService from './services/aptosService.js';

const PORT = process.env.PORT || 5000;

// Initialize services
const initializeServices = async () => {
  // Connect to Database
  await connectDB();
  
  // Initialize Aptos connection
  await aptosService.initialize();
};

// Start Server
initializeServices().then(() => {
  app.listen(PORT, () => {
    console.log(`
    🔐 LifeVault Backend Running!
    📡 Port: ${PORT}
    🌍 Environment: ${process.env.NODE_ENV}
    🗄️  Database: MongoDB Atlas
    🌐 IPFS: Pinata
    ⛓️  Blockchain: Aptos ${process.env.APTOS_NETWORK || 'testnet'}
    `);
  });
}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});