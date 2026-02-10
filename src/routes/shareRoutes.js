


// file: backEnd/src/routes/shareRoutes.js

import express from 'express';
import SharedLink from '../models/SharedLink.js';
import Memory from '../models/Memory.js';
import { protect } from '../middleware/authMiddleware.js';
import bcrypt from 'bcryptjs';
import os from 'os';

const router = express.Router();

// Duration options in milliseconds
const DURATION_OPTIONS = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

/**
 * Helper: Get the correct base URL dynamically
 * Priority:
 *   1. FRONTEND_URL env variable (for production / custom domain)
 *   2. Request origin header (browser sends this)
 *   3. Build from request host header
 *   4. Build from local network IP
 */
function getBaseUrl(req) {
  // 1. If explicitly set in env, always use that
  if (process.env.FRONTEND_URL && process.env.FRONTEND_URL !== 'http://localhost:5173') {
    return process.env.FRONTEND_URL;
  }

  // 2. Use the origin header (sent by browsers automatically)
  if (req.headers.origin) {
    return req.headers.origin;
  }

  // 3. Use the referer header to extract origin
  if (req.headers.referer) {
    try {
      const url = new URL(req.headers.referer);
      return `${url.protocol}//${url.host}`;
    } catch (e) {
      // ignore parse errors
    }
  }

  // 4. Build from the host header
  //    (works when accessing via IP or domain)
  if (req.headers.host) {
    const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https'
      ? 'https'
      : 'http';

    // If host already contains the frontend port, use it directly
    // Otherwise, replace backend port with frontend port
    let host = req.headers.host;
    const backendPort = process.env.PORT || 5000;
    const frontendPort = process.env.FRONTEND_PORT || 5173;

    if (host.includes(`:${backendPort}`)) {
      host = host.replace(`:${backendPort}`, `:${frontendPort}`);
    }

    return `${protocol}://${host}`;
  }

  // 5. Fallback: use local network IP
  const localIp = getLocalNetworkIP();
  const frontendPort = process.env.FRONTEND_PORT || 5173;
  return `http://${localIp}:${frontendPort}`;
}

/**
 * Helper: Get the machine's local network IP (192.168.x.x / 10.x.x.x)
 * So other devices on the same WiFi/LAN can access the link
 */
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address; // e.g., "192.168.1.42"
      }
    }
  }

  return 'localhost'; // ultimate fallback
}

/**
 * @desc    Get server network info (helpful for debugging)
 * @route   GET /api/share/network-info
 * @access  Private
 */
router.get('/network-info', protect, async (req, res) => {
  const localIp = getLocalNetworkIP();
  const frontendPort = process.env.FRONTEND_PORT || 5173;
  const backendPort = process.env.PORT || 5000;

  res.json({
    success: true,
    data: {
      localNetworkIP: localIp,
      frontendUrl: `http://${localIp}:${frontendPort}`,
      backendUrl: `http://${localIp}:${backendPort}`,
      configuredFrontendUrl: process.env.FRONTEND_URL || 'not set',
      detectedBaseUrl: getBaseUrl(req),
      tip: 'Other devices on same network can access using the localNetworkIP URLs'
    }
  });
});

/**
 * @desc    Create a share link for a memory
 * @route   POST /api/share
 * @access  Private
 */
router.post('/', protect, async (req, res, next) => {
  try {
    const {
      memoryId,
      duration = '24h',
      accessType = 'view',
      maxViews = null,
      password = null,
      customBaseUrl = null   // <-- allow client to send their own base URL
    } = req.body;

    // Validate memory exists and belongs to user
    const memory = await Memory.findOne({
      _id: memoryId,
      userId: req.user._id
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    // Calculate expiration
    const durationMs = DURATION_OPTIONS[duration];
    if (!durationMs) {
      return res.status(400).json({
        success: false,
        message: 'Invalid duration. Options: 1h, 6h, 24h, 7d, 30d, 90d'
      });
    }

    const expiresAt = new Date(Date.now() + durationMs);

    // Generate tokens
    const token = SharedLink.generateToken();
    const shortCode = SharedLink.generateShortCode();

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    // Create share link
    const shareLink = await SharedLink.create({
      memoryId,
      userId: req.user._id,
      token,
      shortCode,
      expiresAt,
      accessType,
      maxViews: maxViews ? parseInt(maxViews) : null,
      password: hashedPassword,
      isPasswordProtected: !!password
    });

    // ──────────────────────────────────────────────
    // KEY FIX: Generate URL dynamically
    // ──────────────────────────────────────────────
    const baseUrl = customBaseUrl || getBaseUrl(req);
    const shareUrl = `${baseUrl}/share/${shortCode}`;

    // Also generate a LAN-accessible URL
    const localIp = getLocalNetworkIP();
    const frontendPort = process.env.FRONTEND_PORT || 5173;
    const lanShareUrl = `http://${localIp}:${frontendPort}/share/${shortCode}`;

    res.status(201).json({
      success: true,
      message: 'Share link created successfully',
      data: {
        shareUrl,            // URL based on how YOU accessed it
        lanShareUrl,         // URL for other devices on same network
        shortCode,
        token,
        expiresAt,
        expiresIn: duration,
        accessType,
        maxViews,
        isPasswordProtected: !!password
      }
    });

  } catch (error) {
    console.error('Create share link error:', error);
    next(error);
  }
});

/**
 * @desc    Access shared memory via link
 * @route   GET /api/share/:shortCode
 * @access  Public
 */
router.get('/:shortCode/', async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const { password } = req.query;

    // Prevent matching utility routes
    if (['network-info', 'user'].includes(shortCode)) {
      return next();
    }

    const shareLink = await SharedLink.findOne({ shortCode })
      .populate({
        path: 'memoryId',
        select: 'title description category ipfsHash fileType fileName createdAt'
      })
      .populate({
        path: 'userId',
        select: 'name email'
      });

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        message: 'Share link not found'
      });
    }

    // Check validity
    const validity = shareLink.isValid();
    if (!validity.valid) {
      return res.status(410).json({
        success: false,
        message: validity.reason,
        expired: true
      });
    }

    // Check password if protected
    if (shareLink.isPasswordProtected) {
      if (!password) {
        return res.status(401).json({
          success: false,
          message: 'Password required',
          passwordRequired: true
        });
      }

      const isMatch = await bcrypt.compare(password, shareLink.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password',
          passwordRequired: true
        });
      }
    }

    // Record access
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    await shareLink.recordAccess(ipAddress, userAgent);

    // Build response
    const memory = shareLink.memoryId;
    const ipfsGateway = process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

    res.json({
      success: true,
      data: {
        memory: {
          title: memory.title,
          description: memory.description,
          category: memory.category,
          fileType: memory.fileType,
          fileName: memory.fileName,
          createdAt: memory.createdAt,
          ipfsUrl: `${ipfsGateway}/${memory.ipfsHash}`,
          ipfsHash: shareLink.accessType === 'download' ? memory.ipfsHash : undefined
        },
        share: {
          accessType: shareLink.accessType,
          expiresAt: shareLink.expiresAt,
          remainingTime: shareLink.remainingTime,
          viewCount: shareLink.viewCount,
          maxViews: shareLink.maxViews
        },
        sharedBy: {
          name: shareLink.userId.name || 'Anonymous',
        }
      }
    });

  } catch (error) {
    console.error('Access share link error:', error);
    next(error);
  }
});

/**
 * @desc    Verify share link
 * @route   GET /api/share/:shortCode/verify
 * @access  Public
 */
router.get('/:shortCode/verify', async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const shareLink = await SharedLink.findOne({ shortCode });

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Share link not found'
      });
    }

    const validity = shareLink.isValid();

    res.json({
      success: true,
      valid: validity.valid,
      message: validity.reason || 'Link is valid',
      passwordRequired: shareLink.isPasswordProtected,
      expiresAt: shareLink.expiresAt,
      remainingTime: shareLink.remainingTime
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get all share links for user's memories
 * @route   GET /api/share/user/my-links
 * @access  Private
 */
router.get('/user/my-links', protect, async (req, res, next) => {
  try {
    const shareLinks = await SharedLink.find({
      userId: req.user._id,
      isRevoked: false
    })
      .populate('memoryId', 'title category ipfsHash')
      .sort({ createdAt: -1 });

    const baseUrl = getBaseUrl(req);

    const links = shareLinks.map(link => ({
      id: link._id,
      shortCode: link.shortCode,
      shareUrl: `${baseUrl}/share/${link.shortCode}`,
      memory: {
        id: link.memoryId._id,
        title: link.memoryId.title,
        category: link.memoryId.category
      },
      accessType: link.accessType,
      expiresAt: link.expiresAt,
      remainingTime: link.remainingTime,
      isExpired: new Date() > link.expiresAt,
      viewCount: link.viewCount,
      maxViews: link.maxViews,
      isPasswordProtected: link.isPasswordProtected,
      createdAt: link.createdAt
    }));

    res.json({
      success: true,
      data: links
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Get share links for a specific memory
 * @route   GET /api/share/memory/:memoryId
 * @access  Private
 */
router.get('/memory/:memoryId', protect, async (req, res, next) => {
  try {
    const { memoryId } = req.params;

    const memory = await Memory.findOne({
      _id: memoryId,
      userId: req.user._id
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    const shareLinks = await SharedLink.find({
      memoryId,
      userId: req.user._id,
      isRevoked: false
    }).sort({ createdAt: -1 });

    const baseUrl = getBaseUrl(req);

    const links = shareLinks.map(link => ({
      id: link._id,
      shortCode: link.shortCode,
      shareUrl: `${baseUrl}/share/${link.shortCode}`,
      accessType: link.accessType,
      expiresAt: link.expiresAt,
      remainingTime: link.remainingTime,
      isExpired: new Date() > link.expiresAt,
      viewCount: link.viewCount,
      maxViews: link.maxViews,
      isPasswordProtected: link.isPasswordProtected,
      createdAt: link.createdAt
    }));

    res.json({
      success: true,
      data: links
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Revoke a share link
 * @route   DELETE /api/share/:shortCode
 * @access  Private
 */
router.delete('/:shortCode', protect, async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    const shareLink = await SharedLink.findOne({
      shortCode,
      userId: req.user._id
    });

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        message: 'Share link not found'
      });
    }

    shareLink.isRevoked = true;
    shareLink.isActive = false;
    shareLink.revokedAt = new Date();
    await shareLink.save();

    res.json({
      success: true,
      message: 'Share link revoked successfully'
    });

  } catch (error) {
    next(error);
  }
});

/**
 * @desc    Update share link settings
 * @route   PATCH /api/share/:shortCode
 * @access  Private
 */
router.patch('/:shortCode', protect, async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    const { duration, maxViews, password, removePassword } = req.body;

    const shareLink = await SharedLink.findOne({
      shortCode,
      userId: req.user._id
    });

    if (!shareLink) {
      return res.status(404).json({
        success: false,
        message: 'Share link not found'
      });
    }

    if (duration && DURATION_OPTIONS[duration]) {
      shareLink.expiresAt = new Date(Date.now() + DURATION_OPTIONS[duration]);
    }

    if (maxViews !== undefined) {
      shareLink.maxViews = maxViews ? parseInt(maxViews) : null;
    }

    if (removePassword) {
      shareLink.password = null;
      shareLink.isPasswordProtected = false;
    } else if (password) {
      const salt = await bcrypt.genSalt(10);
      shareLink.password = await bcrypt.hash(password, salt);
      shareLink.isPasswordProtected = true;
    }

    await shareLink.save();

    res.json({
      success: true,
      message: 'Share link updated successfully',
      data: {
        expiresAt: shareLink.expiresAt,
        maxViews: shareLink.maxViews,
        isPasswordProtected: shareLink.isPasswordProtected
      }
    });

  } catch (error) {
    next(error);
  }
});

export default router;