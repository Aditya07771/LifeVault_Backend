import express from 'express';
import helmet from 'helmet';
import cors from 'cors';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import shareRoutes from './routes/shareRoutes.js';  // Add this

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check Route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🔐 LifeVault API is running on Aptos!',
    version: '2.0.0',
    blockchain: 'Aptos',
    endpoints: {
      auth: '/api/auth',
      memories: '/api/memories',
      share: '/api/share'  // Add this
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/share', shareRoutes);  // Add this

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

export default app;