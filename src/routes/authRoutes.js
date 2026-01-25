import express from 'express';
import User from '../models/User.js';
import aptosService from '../services/aptosService.js';
import { protect } from '../middleware/authMiddleware.js';
const router = express.Router();

/**
 * @desc    Register new user with Aptos wallet
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    const user = new User({ email, password, name });
    
    // Generate Aptos wallet for user
    await user.generateAptosWallet();
    
    await user.save();

    // Fund the new account on testnet (optional)
    if (process.env.APTOS_NETWORK !== 'mainnet') {
      try {
        await aptosService.fundAccount(user.aptosAddress);
        console.log(`💰 Funded new user wallet: ${user.aptosAddress}`);
      } catch (err) {
        console.warn('Could not fund account:', err.message);
      }
    }

    const token = user.generateAuthToken();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          aptosAddress: user.aptosAddress
        },
        token
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Login user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = user.generateAuthToken();

    // Get Aptos balance
    let balance = null;
    if (user.aptosAddress) {
      balance = await aptosService.getBalance(user.aptosAddress);
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          aptosAddress: user.aptosAddress,
          totalMemories: user.totalMemories,
          storageUsed: user.storageUsed,
          aptosBalance: balance?.balance || 0
        },
        token
      }
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get current user
 */
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    let balance = null;
    if (user.aptosAddress) {
      balance = await aptosService.getBalance(user.aptosAddress);
    }
    
    res.json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        aptosAddress: user.aptosAddress,
        aptosBalance: balance?.balance || 0,
        totalMemories: user.totalMemories,
        storageUsed: user.storageUsed,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;