import Quest from '../models/Quest.js';
import QuestCompletion from '../models/QuestCompletion.js';
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import verificationService from '../services/verificationService.js';
import rewardService from '../services/rewardService.js';
import ipfsService from '../services/ipfsService.js';
import encryptionService from '../services/encryptionService.js';
import emailService from '../services/emailService.js';
import { QUEST_STATUS, VERIFICATION_RESULT, ERROR_CODES } from '../config/constants.js';

/**
 * @desc    Create a new quest
 * @route   POST /api/quests
 * @access  Private (Creators/Brands/Admins)
 */
export const createQuest = async (req, res, next) => {
  try {
    const {
      title, description, questType, location, timeWindow,
      qrCode, aiVerification, rewards, budget, startDate,
      endDate, category, difficulty, tags, campaignId, coverImage
    } = req.body;

    // Validate required fields
    if (!title || !description || !questType) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and quest type are required'
      });
    }

    // ============================================
    // 🔧 FIX: Validate & sanitize rewards.badgeId
    // ============================================
    let sanitizedRewards = { ...(rewards || {}) };

    if (sanitizedRewards.badgeId) {
      const { Types } = await import('mongoose');

      if (!Types.ObjectId.isValid(sanitizedRewards.badgeId)) {
        // Option A: Return an error
        return res.status(400).json({
          success: false,
          message: `Invalid badgeId: "${sanitizedRewards.badgeId}". Must be a valid 24-character hex ObjectId.`
        });

        // Option B (alternative): Silently strip invalid badgeId
        // delete sanitizedRewards.badgeId;
      }
    }

    // Generate QR code secret if QR is enabled
    let qrCodeData = qrCode;
    if (qrCode?.enabled && !qrCode.code) {
      const { code, hash } = encryptionService.generateQRSecret();
      qrCodeData = { ...qrCode, code, codeHash: hash };
    }

    // Create quest
    const quest = await Quest.create({
      title,
      description,
      questType,
      creatorId: req.user._id,
      creatorType: req.user.userType || 'user',
      location,
      timeWindow,
      qrCode: qrCodeData,
      aiVerification,
      rewards: sanitizedRewards,   // ✅ Use sanitized rewards
      budget: budget || {},
      status: QUEST_STATUS.DRAFT,
      startDate,
      endDate,
      category,
      difficulty,
      tags,
      campaignId,
      coverImage
    });

    res.status(201).json({
      success: true,
      message: 'Quest created successfully',
      data: quest
    });
  } catch (error) {
    console.error('Create quest error:', error);
    next(error);
  }
};

/**
 * @desc    Get all quests (with filters)
 * @route   GET /api/quests
 * @access  Public
 */
export const getQuests = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      difficulty,
      status = 'active',
      lat,
      lon,
      radius = 5000,
      search,
      campaignId,
      creatorId,
      sortBy = 'createdAt'
    } = req.query;

    let query = {};

    // Status filter
    if (status === 'active') {
      query.status = QUEST_STATUS.ACTIVE;
      query.$or = [
        { endDate: { $gte: new Date() } },
        { endDate: null }
      ];
    } else if (status !== 'all') {
      query.status = status;
    }

    // Category filter
    if (category) {
      query.category = category;
    }

    // Difficulty filter
    if (difficulty) {
      query.difficulty = difficulty;
    }

    // Campaign filter
    if (campaignId) {
      query.campaignId = campaignId;
    }

    // Creator filter
    if (creatorId) {
      query.creatorId = creatorId;
    }

    // Search filter
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Location-based query
    if (lat && lon) {
      query['location.coordinates'] = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lon), parseFloat(lat)]
          },
          $maxDistance: parseInt(radius)
        }
      };
    }

    // Sort options
    const sortOptions = {
      createdAt: { createdAt: -1 },
      rewards: { 'rewards.aptAmount': -1 },
      completions: { 'stats.totalCompletions': -1 },
      distance: null // Handled by $near
    };

    const quests = await Quest.find(query)
      .populate('creatorId', 'name avatar organizationInfo')
      .populate('rewards.badgeId', 'name imageUrl rarity')
      .sort(sortOptions[sortBy] || { createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Quest.countDocuments(query);

    // Add user-specific data if authenticated
    let enrichedQuests = quests;
    if (req.user) {
      const userCompletions = await QuestCompletion.find({
        userId: req.user._id,
        questId: { $in: quests.map(q => q._id) },
        status: 'completed'
      }).select('questId');

      const completedIds = new Set(userCompletions.map(c => c.questId.toString()));

      enrichedQuests = quests.map(quest => ({
        ...quest,
        userCompleted: completedIds.has(quest._id.toString())
      }));
    }

    res.json({
      success: true,
      data: {
        quests: enrichedQuests,
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
 * @desc    Get nearby quests
 * @route   GET /api/quests/nearby
 * @access  Public
 */
export const getNearbyQuests = async (req, res, next) => {
  try {
    const { lat, lon, radius = 5000, limit = 50 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const quests = await Quest.findNearby(
      parseFloat(lon),
      parseFloat(lat),
      parseInt(radius),
      { limit: parseInt(limit) }
    );

    res.json({
      success: true,
      data: {
        quests,
        searchCenter: { lat: parseFloat(lat), lon: parseFloat(lon) },
        searchRadius: parseInt(radius)
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single quest
 * @route   GET /api/quests/:id
 * @access  Public
 */
export const getQuest = async (req, res, next) => {
  try {
    const quest = await Quest.findById(req.params.id)
      .populate('creatorId', 'name avatar organizationInfo')
      .populate('rewards.badgeId', 'name imageUrl rarity description')
      .populate('campaignId', 'name shortCode');

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Check if user can attempt
    let canAttempt = null;
    let userCompletions = [];

    if (req.user) {
      canAttempt = await quest.canUserAttempt(req.user._id);
      userCompletions = await QuestCompletion.find({
        questId: quest._id,
        userId: req.user._id
      }).sort({ createdAt: -1 }).limit(5);
    }

    res.json({
      success: true,
      data: {
        quest,
        canAttempt,
        userCompletions,
        isActive: quest.isActive,
        remainingCompletions: quest.remainingCompletions
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Start quest attempt
 * @route   POST /api/quests/:id/start
 * @access  Private
 */
export const startQuestAttempt = async (req, res, next) => {
  try {
    const quest = await Quest.findById(req.params.id);

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Check if user can attempt
    const canAttempt = await quest.canUserAttempt(req.user._id);
    if (!canAttempt.canAttempt) {
      return res.status(400).json({
        success: false,
        message: canAttempt.reason
      });
    }

    // Count previous attempts
    const previousAttempts = await QuestCompletion.countDocuments({
      questId: quest._id,
      userId: req.user._id
    });

    // Create new attempt
    const attempt = await QuestCompletion.create({
      questId: quest._id,
      userId: req.user._id,
      campaignId: quest.campaignId,
      status: 'pending',
      attemptNumber: previousAttempts + 1,
      startedAt: new Date()
    });

    // Update quest stats
    quest.stats.totalAttempts += 1;
    await quest.save();

    res.status(201).json({
      success: true,
      message: 'Quest attempt started',
      data: {
        attemptId: attempt._id,
        quest: {
          id: quest._id,
          title: quest.title,
          location: quest.location,
          timeWindow: quest.timeWindow,
          aiVerification: quest.aiVerification ? {
            prompt: quest.aiVerification.prompt,
            requiredObjects: quest.aiVerification.requiredObjects,
            requireFace: quest.aiVerification.requireFace,
            requireSelfie: quest.aiVerification.requireSelfie
          } : null,
          qrCodeRequired: quest.qrCode?.enabled || false
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Submit quest completion
 * @route   POST /api/quests/:id/submit
 * @access  Private
 */
export const submitQuestCompletion = async (req, res, next) => {
  try {
    const {
      attemptId,
      photoBase64,
      location,
      qrCodeScanned,
      deviceInfo,
      capturedAt
    } = req.body;

    const quest = await Quest.findById(req.params.id);
    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Find or create attempt
    let attempt;
    if (attemptId) {
      attempt = await QuestCompletion.findOne({
        _id: attemptId,
        userId: req.user._id,
        questId: quest._id
      });
    }

    if (!attempt) {
      // Create new attempt if none provided
      const previousAttempts = await QuestCompletion.countDocuments({
        questId: quest._id,
        userId: req.user._id
      });

      attempt = await QuestCompletion.create({
        questId: quest._id,
        userId: req.user._id,
        campaignId: quest.campaignId,
        status: 'verifying',
        attemptNumber: previousAttempts + 1,
        startedAt: new Date()
      });
    }

    // Update attempt status
    attempt.status = 'verifying';
    attempt.submission = {
      photoUrl: null,
      photoBase64: photoBase64 ? true : false, // Don't store full base64 in DB
      location,
      qrCodeScanned,
      deviceInfo,
      capturedAt: capturedAt || new Date(),
      submittedAt: new Date()
    };
    await attempt.save();

    console.log('\n=== Processing Quest Submission ===');
    console.log('Quest:', quest.title);
    console.log('User:', req.user._id);
    console.log('Attempt:', attempt._id);

    // Run verification
    const submissionData = {
      photoBase64,
      location,
      qrCodeScanned,
      deviceInfo,
      capturedAt
    };

    const verification = await verificationService.verifyQuestCompletion(quest, submissionData);

    // Update attempt with verification results
    attempt.verification = verification;

    if (verification.overallResult === VERIFICATION_RESULT.PASSED) {
      console.log('✅ Quest completed successfully!');

      // Upload photo to IPFS if provided
      if (photoBase64) {
        try {
          const ipfsResult = await ipfsService.pinBase64(
            photoBase64,
            `quest_${quest._id}_${attempt._id}`,
            { questId: quest._id.toString(), userId: req.user._id.toString() }
          );
          attempt.submission.photoUrl = ipfsResult.gatewayUrl;
          attempt.submission.photoIpfsHash = ipfsResult.ipfsHash;
        } catch (err) {
          console.warn('IPFS upload failed:', err.message);
        }
      }

      // Process rewards
      const rewardResults = await rewardService.processQuestRewards(
        req.user._id,
        quest,
        attempt
      );

      // Update attempt
      await attempt.markAsCompleted(verification, rewardResults, rewardResults.apt);

      // Send completion email (optional; skipped if SMTP not configured)
      try {
        if (req.user?.email) {
          await emailService.sendQuestCompletionEmail({
            to: req.user.email,
            userName: req.user.name,
            questTitle: quest.title,
            rewards: {
              apt: rewardResults.apt,
              points: rewardResults.points,
              xp: rewardResults.xp
            }
          });
        }
      } catch (err) {
        console.warn('Email send failed:', err.message);
      }

      // Check campaign progress
      if (quest.campaignId) {
        const campaign = await Campaign.findById(quest.campaignId);
        if (campaign) {
          const progress = await campaign.getUserProgress(req.user._id);

          if (progress.isCompleted) {
            // Award campaign grand prize
            await rewardService.processCampaignCompletion(req.user._id, campaign);
          }
        }
      }

      res.json({
        success: true,
        message: '🎉 Quest completed!',
        data: {
          attempt: {
            id: attempt._id,
            status: 'completed',
            completedAt: attempt.completedAt
          },
          verification: {
            result: 'PASSED',
            score: verification.overallScore,
            details: {
              gps: verification.gps,
              timeWindow: verification.timeWindow,
              aiVision: verification.aiVision ? {
                passed: verification.aiVision.passed,
                confidence: verification.aiVision.confidence,
                message: verification.aiVision.message
              } : null,
              qrCode: verification.qrCode
            }
          },
          rewards: {
            apt: rewardResults.apt,
            points: rewardResults.points,
            badge: rewardResults.badge,
            xp: rewardResults.xp
          }
        }
      });

    } else {
      console.log('❌ Quest verification failed');

      await attempt.markAsFailed(
        verification.failureCode || 'VERIFICATION_FAILED',
        verification.aiVision?.message || verification.gps?.message || 'Verification failed',
        verification
      );

      res.status(400).json({
        success: false,
        message: 'Quest verification failed',
        data: {
          attempt: {
            id: attempt._id,
            status: 'failed',
            canRetry: attempt.failure.canRetry
          },
          verification: {
            result: 'FAILED',
            failureCode: verification.failureCode,
            details: {
              gps: verification.gps,
              timeWindow: verification.timeWindow,
              aiVision: verification.aiVision ? {
                passed: verification.aiVision.passed,
                confidence: verification.aiVision.confidence,
                message: verification.aiVision.message,
                requiredObjectsMissing: verification.aiVision.requiredObjectsMissing
              } : null,
              qrCode: verification.qrCode
            }
          }
        }
      });
    }

  } catch (error) {
    console.error('Submit quest error:', error);
    next(error);
  }
};

/**
 * @desc    Update quest
 * @route   PUT /api/quests/:id
 * @access  Private (Creator only)
 */
export const updateQuest = async (req, res, next) => {
  try {
    const quest = await Quest.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found or you do not have permission'
      });
    }

    // Prevent updating active quests with completions
    if (quest.status === QUEST_STATUS.ACTIVE && quest.stats.totalCompletions > 0) {
      const allowedUpdates = ['description', 'coverImage', 'tags'];
      const updates = Object.keys(req.body);
      const hasDisallowedUpdates = updates.some(u => !allowedUpdates.includes(u));

      if (hasDisallowedUpdates) {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify core quest settings after completions have been made'
        });
      }
    }

    Object.assign(quest, req.body);
    await quest.save();

    res.json({
      success: true,
      message: 'Quest updated successfully',
      data: quest
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Activate/Publish quest
 * @route   POST /api/quests/:id/activate
 * @access  Private (Creator only)
 */
export const activateQuest = async (req, res, next) => {
  try {
    const quest = await Quest.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Validate quest is ready to be activated
    const validationErrors = [];

    if (!quest.location?.coordinates?.coordinates && quest.questType !== 'time_window') {
      validationErrors.push('Location is required');
    }

    if (quest.aiVerification?.enabled && !quest.aiVerification?.prompt) {
      validationErrors.push('AI verification prompt is required');
    }

    if (quest.rewards?.aptAmount > 0 && (!quest.budget?.aptRemaining || quest.budget.aptRemaining < quest.rewards.aptAmount)) {
      validationErrors.push('Insufficient budget for rewards');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Quest validation failed',
        errors: validationErrors
      });
    }

    quest.status = QUEST_STATUS.ACTIVE;
    if (!quest.startDate) {
      quest.startDate = new Date();
    }
    await quest.save();

    res.json({
      success: true,
      message: 'Quest activated successfully',
      data: quest
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Pause quest
 * @route   POST /api/quests/:id/pause
 * @access  Private (Creator only)
 */
export const pauseQuest = async (req, res, next) => {
  try {
    const quest = await Quest.findOneAndUpdate(
      { _id: req.params.id, creatorId: req.user._id },
      { status: QUEST_STATUS.PAUSED },
      { new: true }
    );

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    res.json({
      success: true,
      message: 'Quest paused',
      data: quest
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete quest
 * @route   DELETE /api/quests/:id
 * @access  Private (Creator only)
 */
export const deleteQuest = async (req, res, next) => {
  try {
    const quest = await Quest.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Prevent deleting quests with completions
    if (quest.stats.totalCompletions > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete quest with completions. Consider pausing instead.'
      });
    }

    await quest.deleteOne();

    res.json({
      success: true,
      message: 'Quest deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user's quest history
 * @route   GET /api/quests/history
 * @access  Private
 */
export const getQuestHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const completions = await QuestCompletion.find(query)
      .populate('questId', 'title category coverImage location rewards')
      .populate('campaignId', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await QuestCompletion.countDocuments(query);

    res.json({
      success: true,
      data: {
        completions,
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
 * @desc    Get quest leaderboard
 * @route   GET /api/quests/:id/leaderboard
 * @access  Public
 */
export const getQuestLeaderboard = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    const leaderboard = await QuestCompletion.aggregate([
      { $match: { questId: req.params.id, status: 'completed' } },
      {
        $group: {
          _id: '$userId',
          completions: { $sum: 1 },
          fastestTime: { $min: '$verification.processingTime' },
          firstCompletion: { $min: '$completedAt' }
        }
      },
      { $sort: { firstCompletion: 1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          name: '$user.name',
          avatar: '$user.avatar',
          completions: 1,
          fastestTime: 1,
          firstCompletion: 1
        }
      }
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
  createQuest,
  getQuests,
  getNearbyQuests,
  getQuest,
  startQuestAttempt,
  submitQuestCompletion,
  updateQuest,
  activateQuest,
  pauseQuest,
  deleteQuest,
  getQuestHistory,
  getQuestLeaderboard
};