import Campaign from '../models/Campaign.js';
import Quest from '../models/Quest.js';
import QuestCompletion from '../models/QuestCompletion.js';
import Badge from '../models/Badge.js';
import User from '../models/User.js';
import { QUEST_STATUS, CAMPAIGN_TYPES } from '../config/constants.js';

/**
 * @desc    Create a new campaign
 * @route   POST /api/campaigns
 * @access  Private (Brands/Government/Admins)
 */
export const createCampaign = async (req, res, next) => {
  try {
    const {
      name,
      description,
      campaignType,
      organizationType,
      organizationName,
      organizationLogo,
      website,
      contactEmail,
      completionRequirements,
      grandPrize,
      budget,
      startDate,
      endDate,
      timezone,
      targetRegions,
      coverImage,
      bannerImage,
      tags,
      category,
      settings
    } = req.body;

    // Validate required fields
    if (!name || !campaignType || !organizationType) {
      return res.status(400).json({
        success: false,
        message: 'Name, campaign type, and organization type are required'
      });
    }

    // Create campaign
    const campaign = await Campaign.create({
      name,
      description,
      organizationId: req.user._id,
      organizationType,
      organizationName: organizationName || req.user.organizationInfo?.name,
      organizationLogo,
      website,
      contactEmail,
      campaignType,
      completionRequirements: completionRequirements || {},
      grandPrize: grandPrize || {},
      budget: {
        totalAptAllocated: budget?.totalAptAllocated || 0,
        aptRemaining: budget?.totalAptAllocated || 0,
        maxParticipants: budget?.maxParticipants || null
      },
      status: QUEST_STATUS.DRAFT,
      startDate,
      endDate,
      timezone,
      targetRegions,
      coverImage,
      bannerImage,
      tags,
      category,
      settings
    });

    console.log('✅ Campaign created:', campaign._id);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Create campaign error:', error);
    next(error);
  }
};

/**
 * @desc    Get all campaigns
 * @route   GET /api/campaigns
 * @access  Public
 */
export const getCampaigns = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      campaignType,
      status = 'active',
      featured,
      search
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

    if (category) query.category = category;
    if (campaignType) query.campaignType = campaignType;
    if (featured === 'true') query.isFeatured = true;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const campaigns = await Campaign.find(query)
      .populate('organizationId', 'name avatar organizationInfo')
      .populate('grandPrize.badgeId', 'name imageUrl rarity')
      .sort({ isFeatured: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    // Enrich with quest counts
    const enrichedCampaigns = await Promise.all(campaigns.map(async (campaign) => {
      const questCount = campaign.quests?.length || 0;
      let userProgress = null;

      if (req.user) {
        const campaignDoc = await Campaign.findById(campaign._id);
        userProgress = await campaignDoc.getUserProgress(req.user._id);
      }

      return {
        ...campaign,
        questCount,
        userProgress
      };
    }));

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: {
        campaigns: enrichedCampaigns,
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
 * @desc    Get single campaign with quests
 * @route   GET /api/campaigns/:id
 * @access  Public
 */
export const getCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('organizationId', 'name avatar organizationInfo')
      .populate('grandPrize.badgeId', 'name imageUrl rarity description')
      .populate({
        path: 'quests.questId',
        select: 'title description location rewards category difficulty coverImage stats'
      });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Get user progress if authenticated
    let userProgress = null;
    if (req.user) {
      userProgress = await campaign.getUserProgress(req.user._id);
    }

    res.json({
      success: true,
      data: {
        campaign,
        userProgress,
        isActive: campaign.isActive
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Join a campaign
 * @route   POST /api/campaigns/:id/join
 * @access  Private
 */
export const joinCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    if (!campaign.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Campaign is not active'
      });
    }

    // Check if user already joined
    const user = await User.findById(req.user._id);
    const alreadyJoined = user.campaigns?.some(
      c => c.campaignId.toString() === campaign._id.toString()
    );

    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        message: 'You have already joined this campaign'
      });
    }

    // Check max participants
    if (campaign.budget.maxParticipants && 
        campaign.stats.totalParticipants >= campaign.budget.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: 'Campaign has reached maximum participants'
      });
    }

    // Add to user's campaigns
    if (!user.campaigns) user.campaigns = [];
    user.campaigns.push({
      campaignId: campaign._id,
      joinedAt: new Date()
    });
    await user.save();

    // Update campaign stats
    campaign.stats.totalParticipants += 1;
    await campaign.save();

    res.json({
      success: true,
      message: 'Successfully joined campaign',
      data: {
        campaignId: campaign._id,
        campaignName: campaign.name,
        questCount: campaign.quests.length
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add quest to campaign
 * @route   POST /api/campaigns/:id/quests
 * @access  Private (Campaign owner)
 */
export const addQuestToCampaign = async (req, res, next) => {
  try {
    const { questId, order, isRequired, unlockAfter } = req.body;

    const campaign = await Campaign.findOne({
      _id: req.params.id,
      organizationId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have permission'
      });
    }

    const quest = await Quest.findById(questId);
    if (!quest) {
      return res.status(404).json({
        success: false,
        message: 'Quest not found'
      });
    }

    // Check if quest already in campaign
    if (campaign.quests.some(q => q.questId.toString() === questId)) {
      return res.status(400).json({
        success: false,
        message: 'Quest is already in this campaign'
      });
    }

    // Add quest to campaign
    campaign.quests.push({
      questId,
      order: order || campaign.quests.length,
      isRequired: isRequired !== false,
      unlockAfter
    });
    campaign.totalChapters = campaign.quests.length;
    await campaign.save();

    // Update quest with campaign reference
    quest.campaignId = campaign._id;
    await quest.save();

    res.json({
      success: true,
      message: 'Quest added to campaign',
      data: campaign.quests
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get campaign leaderboard
 * @route   GET /api/campaigns/:id/leaderboard
 * @access  Public
 */
export const getCampaignLeaderboard = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    const questIds = campaign.quests.map(q => q.questId);

    const leaderboard = await QuestCompletion.aggregate([
      { 
        $match: { 
          questId: { $in: questIds },
          status: 'completed'
        } 
      },
      {
        $group: {
          _id: '$userId',
          questsCompleted: { $addToSet: '$questId' },
          totalPoints: { $sum: '$rewards.points' },
          totalApt: { $sum: '$rewards.aptAmount' },
          firstCompletion: { $min: '$completedAt' },
          lastCompletion: { $max: '$completedAt' }
        }
      },
      {
        $addFields: {
          questCount: { $size: '$questsCompleted' }
        }
      },
      { $sort: { questCount: -1, lastCompletion: 1 } },
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
          questCount: 1,
          totalPoints: 1,
          totalApt: 1,
          isComplete: { $eq: ['$questCount', questIds.length] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        leaderboard,
        totalQuests: questIds.length
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update campaign
 * @route   PUT /api/campaigns/:id
 * @access  Private (Campaign owner)
 */
export const updateCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      organizationId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have permission'
      });
    }

    // Don't allow changing certain fields after activation
    if (campaign.status === QUEST_STATUS.ACTIVE && campaign.stats.totalParticipants > 0) {
      const protectedFields = ['budget.totalAptAllocated', 'grandPrize.aptAmount'];
      // Filter out protected fields
    }

    Object.assign(campaign, req.body);
    await campaign.save();

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Activate campaign
 * @route   POST /api/campaigns/:id/activate
 * @access  Private (Campaign owner)
 */
export const activateCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      organizationId: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Validate campaign is ready
    if (campaign.quests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campaign must have at least one quest'
      });
    }

    campaign.status = QUEST_STATUS.ACTIVE;
    if (!campaign.startDate) {
      campaign.startDate = new Date();
    }
    await campaign.save();

    // Activate all quests in campaign
    await Quest.updateMany(
      { _id: { $in: campaign.quests.map(q => q.questId) } },
      { status: QUEST_STATUS.ACTIVE }
    );

    res.json({
      success: true,
      message: 'Campaign activated successfully',
      data: campaign
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get my campaigns (created by user)
 * @route   GET /api/campaigns/my-campaigns
 * @access  Private
 */
export const getMyCampaigns = async (req, res, next) => {
  try {
    const campaigns = await Campaign.find({ organizationId: req.user._id })
      .populate('grandPrize.badgeId', 'name imageUrl')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: campaigns
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get campaigns user has joined
 * @route   GET /api/campaigns/joined
 * @access  Private
 */
export const getJoinedCampaigns = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate({
        path: 'campaigns.campaignId',
        select: 'name description coverImage status stats quests grandPrize'
      });

    const campaigns = await Promise.all(user.campaigns.map(async (c) => {
      const campaign = c.campaignId;
      if (!campaign) return null;

      const campaignDoc = await Campaign.findById(campaign._id);
      const progress = await campaignDoc.getUserProgress(req.user._id);

      return {
        campaign,
        joinedAt: c.joinedAt,
        progress: c.progress,
        completedAt: c.completedAt,
        userProgress: progress
      };
    }));

    res.json({
      success: true,
      data: campaigns.filter(Boolean)
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Check if user has completed a campaign
 * @route   POST /api/campaigns/:id/check-completion
 * @access  Private
 */
export const checkCampaignCompletion = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const campaignId = req.params.id;

    // Get campaign
    const campaign = await Campaign.findById(campaignId).populate(
      'quests.questId',
      '_id title'
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // If campaign has no quests
    if (!campaign.quests || campaign.quests.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Campaign has no quests'
      });
    }

    // Get all completed quests by user for this campaign
    const completedQuests = await QuestCompletion.find({
      userId,
      campaignId,
      status: 'completed'
    }).select('questId');

    const completedQuestIds = new Set(
      completedQuests.map(q => q.questId.toString())
    );

    // Check which quests are completed
    const questProgress = campaign.quests.map(q => ({
      questId: q.questId._id,
      title: q.questId.title,
      completed: completedQuestIds.has(q.questId._id.toString())
    }));

    const completedCount = questProgress.filter(q => q.completed).length;
    const totalQuests = campaign.quests.length;

    const isCompleted = completedCount === totalQuests;

    res.json({
      success: true,
      data: {
        campaignId: campaign._id,
        isCompleted,
        progress: {
          completed: completedCount,
          total: totalQuests
        },
        quests: questProgress
      }
    });

  } catch (error) {
    console.error('Check campaign completion error:', error);
    next(error);
  }
};


/**
 * @desc    Delete a campaign
 * @route   DELETE /api/campaigns/:id
 * @access  Private (Creator only)
 */
export const deleteCampaign = async (req, res, next) => {
  try {
    const campaignId = req.params.id;
    const userId = req.user._id;

    // Find campaign owned by user
    const campaign = await Campaign.findOne({
      _id: campaignId,
      creatorId: userId
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found or you do not have permission'
      });
    }

    // Check if any user has joined / completed this campaign
    const hasProgress = await QuestCompletion.exists({
      campaignId
    });

    if (hasProgress) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete campaign with user progress. Consider pausing or ending it instead.'
      });
    }

    // Remove campaign reference from quests (optional but clean)
    await Quest.updateMany(
      { campaignId },
      { $unset: { campaignId: '' } }
    );

    // Delete campaign
    await campaign.deleteOne();

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (error) {
    console.error('Delete campaign error:', error);
    next(error);
  }
};



export default {
  createCampaign,
  getCampaigns,
  getCampaign,
  joinCampaign,
  addQuestToCampaign,
  getCampaignLeaderboard,
  updateCampaign,
  activateCampaign,
  getMyCampaigns,
  getJoinedCampaigns,
  checkCampaignCompletion,
  deleteCampaign
};