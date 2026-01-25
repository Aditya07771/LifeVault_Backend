import 'dotenv/config';
import app from './app.js';
import connectDB from './config/database.js';

const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Start Server
app.listen(PORT, () => {
  console.log(`
  🔐 LifeVault Backend Running!
  📡 Port: ${PORT}
  🌍 Environment: ${process.env.NODE_ENV}
  🗄️  Database: MongoDB Atlas
  🌐 IPFS: Pinata
  ⛓️  Blockchain: Polygon
  `);
});