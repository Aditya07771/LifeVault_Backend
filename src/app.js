import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

// Import Routes
import memoryRoutes from './routes/memoryRoutes.js';
import authRoutes from './routes/authRoutes.js';

const app = express();

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: '*', // Configure for production
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body Parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check Route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🔐 LifeVault API is running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      memories: '/api/memories'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/memories', memoryRoutes);

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