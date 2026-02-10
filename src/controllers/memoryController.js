import Memory from '../models/Memory.js';
import User from '../models/User.js';
import aptosService from '../services/aptosService.js';
import ipfsService from '../services/ipfsService.js';

/**
 * @desc    Create new memory
 * @route   POST /api/memories
 * @access  Private
 */
export const createMemory = async (req, res, next) => {
  try {
    const { 
      title, 
      description, 
      category, 
      fileData,
      fileName,
      fileType,
      storeOnChain = false 
    } = req.body;

    if (!title || !fileData) {
      return res.status(400).json({
        success: false,
        message: 'Title and file data are required'
      });
    }

    // 1. Upload to IPFS
    console.log('📤 Uploading to IPFS...');
    const ipfsResult = await ipfsService.pinBase64(fileData, fileName || 'memory', {
      userId: req.user._id.toString(),
      title,
      category
    });
    console.log('✅ IPFS Upload successful:', ipfsResult.ipfsHash);

    // 2. Store on Aptos blockchain (optional)
    let aptosResult = null;
    if (storeOnChain) {
      console.log('⛓️ Storing on Aptos blockchain...');
      aptosResult = await aptosService.storeMemoryOnChain(
        ipfsResult.ipfsHash,
        req.user.aptosAddress
      );
      console.log('✅ Aptos storage:', aptosResult);
    }

    // 3. Save to database
    const memory = await Memory.create({
      userId: req.user._id,
      title,
      description,
      category: category || 'other',
      ipfsHash: ipfsResult.ipfsHash,
      ipfsUrl: ipfsResult.gatewayUrl,
      txHash: aptosResult?.txHash || null,
      txVersion: aptosResult?.txVersion || null,
      isOnChain: !!aptosResult?.success,
      fileType,
      fileSize: Buffer.byteLength(fileData, 'base64'),
      fileName
    });

    // 4. Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 
        totalMemories: 1,
        storageUsed: memory.fileSize
      }
    });

    res.status(201).json({
      success: true,
      message: 'Memory created successfully',
      data: {
        memory,
        ipfs: {
          hash: ipfsResult.ipfsHash,
          url: ipfsResult.gatewayUrl
        },
        aptos: aptosResult
      }
    });

  } catch (error) {
    console.error('Create memory error:', error);
    next(error);
  }
};

/**
 * @desc    Get all memories for user
 * @route   GET /api/memories
 */
export const getMemories = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;

    const query = { userId: req.user._id };
    
    if (category && category !== 'all') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const memories = await Memory.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Memory.countDocuments(query);

    res.json({
      success: true,
      data: {
        memories,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single memory
 */
export const getMemory = async (req, res, next) => {
  try {
    const memory = await Memory.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    res.json({ success: true, data: memory });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete memory
 */
export const deleteMemory = async (req, res, next) => {
  try {
    const memory = await Memory.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    try {
      await ipfsService.unpin(memory.ipfsHash);
    } catch (err) {
      console.warn('Failed to unpin from IPFS:', err.message);
    }

    await memory.deleteOne();

    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 
        totalMemories: -1,
        storageUsed: -memory.fileSize
      }
    });

    res.json({ success: true, message: 'Memory deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify memory on Aptos blockchain
 */
export const verifyMemory = async (req, res, next) => {
  try {
    const memory = await Memory.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!memory) {
      return res.status(404).json({
        success: false,
        message: 'Memory not found'
      });
    }

    if (!memory.isOnChain || !memory.txHash) {
      return res.json({
        success: true,
        verified: false,
        message: 'Memory is not stored on blockchain'
      });
    }

    // Get transaction details from Aptos
    const txDetails = await aptosService.getTransaction(memory.txHash);

    res.json({
      success: true,
      verified: txDetails.success,
      data: {
        memory,
        blockchain: txDetails.transaction
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user statistics
 */
export const getStats = async (req, res, next) => {
  try {
    const stats = await Memory.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          totalMemories: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          onChain: { $sum: { $cond: ['$isOnChain', 1, 0] } }
        }
      }
    ]);

    const categoryStats = await Memory.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);

    // Get Aptos balance if user has address
    let aptosBalance = null;
    if (req.user.aptosAddress) {
      aptosBalance = await aptosService.getBalance(req.user.aptosAddress);
    }

    res.json({
      success: true,
      data: {
        overview: stats[0] || { totalMemories: 0, totalSize: 0, onChain: 0 },
        byCategory: categoryStats,
        aptos: aptosBalance
      }
    });

  } catch (error) {
    next(error);
  }
};


// =============================================================
// ← NEW CONTROLLER: RELAY / SPONSORED TRANSACTION
// =============================================================

/**
 * @desc    Relay a memory to Aptos blockchain (server pays gas)
 * @route   POST /api/memories/relay
 * @access  Private
 *
 * Expected request body from the Android app:
 * {
 *   "ipfsHash":    "QmXyz...",           // CID returned from IPFS upload
 *   "signature":   "0xabcdef...",         // Ed25519 sig = Sign(ipfsHash, userPrivateKey)
 *   "title":       "My vacation photo",
 *   "description": "Optional note",
 *   "category":    "photo",
 *   "fileType":    "image/jpeg",
 *   "fileName":    "photo.jpg",
 *   "fileSize":    123456               // bytes (optional, for stats)
 * }
 *
 * The user must already have aptosPublicKey stored on their profile
 * (set during wallet auth or registration).
 */
export const relayMemory = async (req, res, next) => {
  try {
    const {
      ipfsHash,
      signature,
      title,
      description,
      category,
      fileType,
      fileName,
      fileSize
    } = req.body;

    // ── Validate required fields ────────────────────────────────
    if (!ipfsHash || !signature) {
      return res.status(400).json({
        success: false,
        message: 'ipfsHash and signature are required'
      });
    }

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'title is required'
      });
    }

    // ── Get user's public key ───────────────────────────────────
    const userPublicKey = req.user.aptosPublicKey;

    if (!userPublicKey) {
      return res.status(400).json({
        success: false,
        message:
          'No Aptos public key found on your account. ' +
          'Please link a wallet first via /api/auth/wallet or /api/auth/link-wallet.'
      });
    }

    console.log('\n=== Relay / Sponsored Transaction ===');
    console.log('User ID   :', req.user._id);
    console.log('IPFS Hash :', ipfsHash);
    console.log('Public Key:', userPublicKey.substring(0, 20) + '...');

    // ── Call the service (verify sig → submit tx) ───────────────
    const aptosResult = await aptosService.submitSponsoredMemory(
      ipfsHash,
      userPublicKey,
      signature
    );

    // ── Persist to MongoDB ──────────────────────────────────────
    const ipfsGateway =
      process.env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

    const memory = await Memory.create({
      userId: req.user._id,
      title,
      description: description || '',
      category: category || 'other',
      ipfsHash,
      ipfsUrl: `${ipfsGateway}/${ipfsHash}`,
      txHash: aptosResult.txHash,
      txVersion: aptosResult.txVersion,
      isOnChain: true,
      fileType: fileType || null,
      fileSize: fileSize || 0,
      fileName: fileName || null
    });

    // ── Update user stats ───────────────────────────────────────
    await User.findByIdAndUpdate(req.user._id, {
      $inc: {
        totalMemories: 1,
        storageUsed: fileSize || 0
      }
    });

    console.log('✅ Relay complete. Memory ID:', memory._id);

    // ── Respond ─────────────────────────────────────────────────
    res.status(201).json({
      success: true,
      message: 'Memory relayed to blockchain successfully (gas sponsored)',
      data: {
        memory,
        ipfs: {
          hash: ipfsHash,
          url: `${ipfsGateway}/${ipfsHash}`
        },
        aptos: {
          txHash: aptosResult.txHash,
          txVersion: aptosResult.txVersion,
          sponsored: true
        }
      }
    });
  } catch (error) {
    console.error('❌ Relay error:', error.message);

    // Return a descriptive status when signature verification fails
    if (error.message.includes('Relay rejected')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    next(error);
  }
};