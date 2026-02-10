import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';

// Middleware
import { requestLogger, limiter, sanitizeInput } from './middleware/utilityMiddleware.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

// Import Routes
import authRoutes from './routes/authRoutes.js';
import memoryRoutes from './routes/memoryRoutes.js';
import shareRoutes from './routes/shareRoutes.js';
import questRoutes from './routes/questRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import badgeRoutes from './routes/badgeRoutes.js';
import storyRoutes from './routes/storyRoutes.js';

const app = express();

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// Helmet - Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
}));

// Prevent MongoDB Operator Injection
app.use(mongoSanitize());

// Compression
app.use(compression());

// ==========================================
// BODY PARSER & INPUT SANITIZATION
// ==========================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(sanitizeInput);

// ==========================================
// REQUEST LOGGING
// ==========================================

if (process.env.NODE_ENV !== 'test') {
  app.use(requestLogger);
}

// ==========================================
// RATE LIMITING
// ==========================================

// Apply rate limiting to all routes
if (process.env.NODE_ENV === 'production') {
  app.use('/api/', limiter);
}

// ==========================================
// HEALTH CHECK & INFO ROUTES
// ==========================================

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🔐 LifeVault API is running on Aptos!',
    version: '2.0.0',
    blockchain: 'Aptos',
    network: process.env.APTOS_NETWORK || 'testnet',
    environment: process.env.NODE_ENV || 'development',
    endpoints: {
      auth: '/api/auth',
      memories: '/api/memories',
      share: '/api/share',
      quests: '/api/quests',
      campaigns: '/api/campaigns',
      badges: '/api/badges',
      stories: '/api/stories',
    },
    documentation: '/api/docs',
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

// ==========================================
// API ROUTES
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/memories', memoryRoutes);
app.use('/api/share', shareRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/stories', storyRoutes);

// ==========================================
// API DOCUMENTATION (if needed)
// ==========================================

app.get('/api/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    version: '2.0.0',
    routes: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        wallet: 'POST /api/auth/wallet',
        linkWallet: 'POST /api/auth/link-wallet',
        me: 'GET /api/auth/me',
      },
      memories: {
        create: 'POST /api/memories',
        list: 'GET /api/memories',
        get: 'GET /api/memories/:id',
        delete: 'DELETE /api/memories/:id',
        verify: 'GET /api/memories/:id/verify',
        relay: 'POST /api/memories/relay',
        stats: 'GET /api/memories/stats',
      },
      share: {
        create: 'POST /api/share',
        access: 'GET /api/share/:shortCode',
        verify: 'GET /api/share/:shortCode/verify',
        myLinks: 'GET /api/share/user/my-links',
        memoryLinks: 'GET /api/share/memory/:memoryId',
        revoke: 'DELETE /api/share/:shortCode',
        update: 'PATCH /api/share/:shortCode',
      },
      quests: {
        list: 'GET /api/quests',
        nearby: 'GET /api/quests/nearby',
        get: 'GET /api/quests/:id',
        create: 'POST /api/quests',
        attempt: 'POST /api/quests/:id/attempt',
        myCompletions: 'GET /api/quests/user/my-completions',
        myQuests: 'GET /api/quests/user/my-quests',
      },
      campaigns: {
        list: 'GET /api/campaigns',
        get: 'GET /api/campaigns/:id',
        create: 'POST /api/campaigns',
        join: 'POST /api/campaigns/:id/join',
        leaderboard: 'GET /api/campaigns/:id/leaderboard',
        myCampaigns: 'GET /api/campaigns/user/my-campaigns',
      },
      badges: {
        list: 'GET /api/badges',
        get: 'GET /api/badges/:id',
        create: 'POST /api/badges',
        myBadges: 'GET /api/badges/user/my-badges',
        leaderboard: 'GET /api/badges/leaderboard',
      },
      stories: {
        list: 'GET /api/stories',
        get: 'GET /api/stories/:id',
        create: 'POST /api/stories',
        addChapter: 'POST /api/stories/:storyId/chapters',
        unlock: 'POST /api/stories/:storyId/chapters/:chapterNumber/unlock',
      },
    },
  });
});

// ==========================================
// ERROR HANDLING
// ==========================================

// 404 Handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

export default app;