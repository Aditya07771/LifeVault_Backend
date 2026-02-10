// src/controllers/badgeController.js

import Badge from '../models/Badge.js';
import User from '../models/User.js';
import ipfsService from '../services/ipfsService.js';
import { BADGE_RARITY } from '../config/constants.js';

/**
 * @desc    Create a new badge
 * @route   POST /api/badges
 * @access  Private (Creator/Brand/Admin)
 */
export const createBadge = async (req, res, next) => {
  try {
    const {
      name,
      description,
      imageData,
      imageUrl,
      rarity,
      category,
      tier,
      requirements,
      nftMetadata,
      campaignId,
      pointValue,
      isTransferable,
      isBurnable
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Badge name is required'
      });
    }

    // Upload image to IPFS if base64 provided
    let finalImageUrl = imageUrl;
    if (imageData) {
      const ipfsResult = await ipfsService.pinBase64(
        imageData,
        `badge_${name.replace(/\s+/g, '_')}`,
        { type: 'badge', name }
      );
      finalImageUrl = ipfsResult.gatewayUrl;
    }

    if (!finalImageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Badge image is required'
      });
    }

    const badge = await Badge.create({
      name,
      description,
      creatorId: req.user._id,
      campaignId,
      imageUrl: finalImageUrl,
      nftMetadata: {
        isNft: nftMetadata?.isNft || false,
        maxSupply: nftMetadata?.maxSupply || null,
        royaltyPercentage: nftMetadata?.royaltyPercentage || 0,
        attributes: nftMetadata?.attributes || []
      },
      rarity: rarity || BADGE_RARITY.COMMON,
      category: category || 'achievement',
      tier: tier || 1,
      requirements: requirements || {},
      isTransferable: isTransferable !== false,
      isBurnable: isBurnable || false,
      pointValue: pointValue || 0
    });

    console.log('✅ Badge created:', badge._id);

    res.status(201).json({
      success: true,
      message: 'Badge created successfully',
      data: badge
    });

  } catch (error) {
    console.error('Create badge error:', error);
    next(error);
  }
};

/**
 * @desc    Get all badges
 * @route   GET /api/badges
 * @access  Public
 */
export const getBadges = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      rarity,
      category,
      campaignId,
      search
    } = req.query;

    const query = { isActive: true };

    if (rarity) query.rarity = rarity;
    if (category) query.category = category;
    if (campaignId) query.campaignId = campaignId;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const badges = await Badge.find(query)
      .populate('creatorId', 'name organizationInfo')
      .populate('campaignId', 'name')
      .sort({ rarity: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Badge.countDocuments(query);

    res.json({
      success: true,
      data: {
        badges,
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
 * @desc    Get single badge
 * @route   GET /api/badges/:id
 * @access  Public
 */
export const getBadge = async (req, res, next) => {
  try {
    const badge = await Badge.findById(req.params.id)
      .populate('creatorId', 'name avatar organizationInfo')
      .populate('campaignId', 'name description')
      .populate('requirements.questId', 'title description');

    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found'
      });
    }

    // Get recent holders
    const recentHolders = await User.find({
      'badges.badgeId': badge._id
    })
      .select('name avatar badges')
      .sort({ 'badges.awardedAt': -1 })
      .limit(10);

    res.json({
      success: true,
      data: {
        badge,
        recentHolders: recentHolders.map(u => ({
          name: u.name,
          avatar: u.avatar,
          awardedAt: u.badges.find(b => b.badgeId.toString() === badge._id.toString())?.awardedAt
        }))
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's badges
 * @route   GET /api/badges/my-badges
 * @access  Private
 */
export const getMyBadges = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'badges.badgeId',
        select: 'name description imageUrl rarity category tier pointValue'
      })
      .select('badges');

    const badges = user.badges.map(b => ({
      ...b.badgeId?.toObject(),
      awardedAt: b.awardedAt,
      questCompletionId: b.questCompletionId
    }));

    // Group by rarity
    const byRarity = {
      legendary: badges.filter(b => b.rarity === 'legendary'),
      epic: badges.filter(b => b.rarity === 'epic'),
      rare: badges.filter(b => b.rarity === 'rare'),
      uncommon: badges.filter(b => b.rarity === 'uncommon'),
      common: badges.filter(b => b.rarity === 'common')
    };

    res.json({
      success: true,
      data: {
        badges,
        byRarity,
        totalBadges: badges.length,
        totalPoints: badges.reduce((sum, b) => sum + (b.pointValue || 0), 0)
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get badges for a user (public profile)
 * @route   GET /api/badges/user/:userId
 * @access  Public
 */
export const getUserBadges = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId)
      .populate({
        path: 'badges.badgeId',
        select: 'name description imageUrl rarity category tier'
      })
      .select('badges preferences name avatar');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check privacy settings
    if (!user.preferences?.privacy?.showBadges) {
      return res.status(403).json({
        success: false,
        message: 'User has hidden their badges'
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          name: user.name,
          avatar: user.avatar
        },
        badges: user.badges.map(b => ({
          ...b.badgeId?.toObject(),
          awardedAt: b.awardedAt
        }))
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Award badge to user (admin/creator only)
 * @route   POST /api/badges/:id/award
 * @access  Private (Creator/Admin)
 */
export const awardBadge = async (req, res, next) => {
  try {
    const { userId, reason } = req.body;

    const badge = await Badge.findById(req.params.id);
    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found'
      });
    }

    // Verify ownership or admin
    if (badge.creatorId.toString() !== req.user._id.toString() &&
        req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to award this badge'
      });
    }

    const result = await badge.awardTo(userId);

    console.log('✅ Badge awarded:', badge.name, 'to user:', userId);

    res.json({
      success: true,
      message: 'Badge awarded successfully',
      data: {
        badge: {
          id: badge._id,
          name: badge.name,
          rarity: badge.rarity
        },
        awardedTo: userId,
        reason
      }
    });

  } catch (error) {
    if (error.message === 'User already has this badge') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    next(error);
  }
};

/**
 * @desc    Get badges created by user
 * @route   GET /api/badges/created
 * @access  Private
 */
export const getCreatedBadges = async (req, res, next) => {
  try {
    const badges = await Badge.find({ creatorId: req.user._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: badges
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update badge
 * @route   PUT /api/badges/:id
 * @access  Private (Owner only)
 */
export const updateBadge = async (req, res, next) => {
  try {
    const badge = await Badge.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found or unauthorized'
      });
    }

    const allowedUpdates = [
      'name', 'description', 'rarity', 'category',
      'tier', 'pointValue', 'requirements', 'isActive'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        badge[field] = req.body[field];
      }
    });

    await badge.save();

    res.json({
      success: true,
      message: 'Badge updated successfully',
      data: badge
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete badge
 * @route   DELETE /api/badges/:id
 * @access  Private (Owner only)
 */
export const deleteBadge = async (req, res, next) => {
  try {
    const badge = await Badge.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!badge) {
      return res.status(404).json({
        success: false,
        message: 'Badge not found or unauthorized'
      });
    }

    // Check if badge has been awarded
    if (badge.stats.totalAwarded > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete badge that has been awarded. Deactivate instead.'
      });
    }

    await badge.deleteOne();

    res.json({
      success: true,
      message: 'Badge deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get badge leaderboard (most badges)
 * @route   GET /api/badges/leaderboard
 * @access  Public
 */
export const getBadgeLeaderboard = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    const leaderboard = await User.aggregate([
      {
        $match: {
          'badges.0': { $exists: true },
          'preferences.privacy.showBadges': { $ne: false }
        }
      },
      {
        $project: {
          name: 1,
          avatar: 1,
          badgeCount: { $size: '$badges' },
          level: '$level.current'
        }
      },
      { $sort: { badgeCount: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.json({
      success: true,
      data: leaderboard
    });

  } catch (error) {
    next(error);
  }
};

export default {
  createBadge,
  getBadges,
  getBadge,
  getMyBadges,
  getUserBadges,
  awardBadge,
  getCreatedBadges,
  updateBadge,
  deleteBadge,
  getBadgeLeaderboard
};