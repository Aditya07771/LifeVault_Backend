import Memory from '../models/Memory.js';
import User from '../models/User.js';
import ipfsService from '../services/ipfsService.js';
import blockchainService from '../services/blockchainService.js';

/**
 * @desc    Create new memory
 * @route   POST /api/memories
 * @access  Private
 */
const createMemory = async (req, res, next) => {
  try {
    const { 
      title, 
      description, 
      category, 
      fileData,  // Base64 encoded file
      fileName,
      fileType,
      storeOnChain = false 
    } = req.body;

    // Validate required fields
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

    // 2. Store on blockchain (optional)
    let blockchainResult = null;
    if (storeOnChain) {
      console.log('⛓️ Storing on blockchain...');
      blockchainResult = await blockchainService.storeMemoryOnChain(
        ipfsResult.ipfsHash,
        req.user.walletAddress
      );
      console.log('✅ Blockchain storage:', blockchainResult);
    }

    // 3. Save to database
    const memory = await Memory.create({
      userId: req.user._id,
      title,
      description,
      category: category || 'other',
      ipfsHash: ipfsResult.ipfsHash,
      ipfsUrl: ipfsResult.gatewayUrl,
      txHash: blockchainResult?.txHash || null,
      blockNumber: blockchainResult?.blockNumber || null,
      isOnChain: !!blockchainResult?.success,
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
        blockchain: blockchainResult
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
 * @access  Private
 */
const getMemories = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category, search } = req.query;

    // Build query
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

    // Execute query with pagination
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

export { createMemory, getMemories, getMemory, deleteMemory, getMemoryFile, verifyMemory, getStats };

/**
 * @desc    Get single memory
 * @route   GET /api/memories/:id
 * @access  Private
 */
const getMemory = async (req, res, next) => {
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

    res.json({
      success: true,
      data: memory
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete memory
 * @route   DELETE /api/memories/:id
 * @access  Private
 */
const deleteMemory = async (req, res, next) => {
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

    // Unpin from IPFS (optional - you might want to keep it)
    try {
      await ipfsService.unpin(memory.ipfsHash);
    } catch (err) {
      console.warn('Failed to unpin from IPFS:', err.message);
    }

    // Delete from database
    await memory.deleteOne();

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { 
        totalMemories: -1,
        storageUsed: -memory.fileSize
      }
    });

    res.json({
      success: true,
      message: 'Memory deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get memory file from IPFS
 * @route   GET /api/memories/:id/file
 * @access  Private
 */
const getMemoryFile = async (req, res, next) => {
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

    const file = await ipfsService.getFile(memory.ipfsHash);

    res.set('Content-Type', file.contentType || 'application/octet-stream');
    res.send(Buffer.from(file.data));

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Verify memory on blockchain
 * @route   GET /api/memories/:id/verify
 * @access  Private
 */
const verifyMemory = async (req, res, next) => {
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

    // Get blockchain data
    const blockchainData = await blockchainService.getMemoryFromChain(memory.blockchainId);

    res.json({
      success: true,
      verified: true,
      data: {
        memory,
        blockchain: blockchainData
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user statistics
 * @route   GET /api/memories/stats
 * @access  Private
 */
const getStats = async (req, res, next) => {
  try {
    const stats = await Memory.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          totalMemories: { $sum: 1 },
          totalSize: { $sum: '$fileSize' },
          onChain: { $sum: { $cond: ['$isOnChain', 1, 0] } },
          categories: { $addToSet: '$category' }
        }
      }
    ]);

    const categoryStats = await Memory.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { totalMemories: 0, totalSize: 0, onChain: 0 },
        byCategory: categoryStats
      }
    });

  } catch (error) {
    next(error);
  }
};