import mongoose from 'mongoose';
import crypto from 'crypto';
import { CAMPAIGN_TYPES, QUEST_STATUS } from '../config/constants.js';

const campaignSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  shortCode: {
    type: String,
    unique: true,
    index: true
  },

  // Creator/Organization Info
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organizationType: {
    type: String,
    enum: ['brand', 'government', 'ngo', 'individual', 'organization'],
    required: true
  },
  organizationName: { type: String },
  organizationLogo: { type: String },
  website: { type: String },
  contactEmail: { type: String },

  // Campaign Type
  campaignType: {
    type: String,
    enum: Object.values(CAMPAIGN_TYPES),
    required: true
  },

  // Quests in Campaign
  quests: [{
    questId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quest'
    },
    order: { type: Number },
    isRequired: { type: Boolean, default: true },
    unlockAfter: { type: mongoose.Schema.Types.ObjectId, ref: 'Quest' } // Quest dependency
  }],
  
  // Completion Requirements
  completionRequirements: {
    minQuestsRequired: { type: Number, default: null }, // null = all required
    specificQuestsRequired: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Quest' }],
    timeLimit: { type: Number }, // Hours to complete entire campaign
    sequentialCompletion: { type: Boolean, default: false }
  },

  // Grand Prize (for completing entire campaign)
  grandPrize: {
    enabled: { type: Boolean, default: false },
    aptAmount: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    badgeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Badge'
    },
    nftMetadata: {
      enabled: { type: Boolean, default: false },
      name: { type: String },
      description: { type: String },
      imageUrl: { type: String }
    },
    physicalReward: {
      enabled: { type: Boolean, default: false },
      description: { type: String },
      redemptionInstructions: { type: String }
    }
  },

  // Budget
  budget: {
    totalAptAllocated: { type: Number, default: 0 },
    aptSpent: { type: Number, default: 0 },
    aptRemaining: { type: Number, default: 0 },
    maxParticipants: { type: Number, default: null }
  },

  // Scheduling
  status: {
    type: String,
    enum: Object.values(QUEST_STATUS),
    default: QUEST_STATUS.DRAFT
  },
  startDate: { type: Date },
  endDate: { type: Date },
  timezone: { type: String, default: 'UTC' },

  // Geographic Targeting
  targetRegions: [{
    country: String,
    state: String,
    city: String,
    coordinates: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number]
    },
    radius: Number
  }],

  // Statistics
  stats: {
    totalParticipants: { type: Number, default: 0 },
    totalCompletions: { type: Number, default: 0 },
    averageCompletionRate: { type: Number, default: 0 },
    averageCompletionTime: { type: Number, default: 0 }, // hours
    questCompletionRates: [{
      questId: mongoose.Schema.Types.ObjectId,
      completionRate: Number
    }]
  },

  // Media
  coverImage: { type: String },
  bannerImage: { type: String },
  promoVideo: { type: String },
  gallery: [{ type: String }],

  // Blockchain
  onChainCampaignId: { type: String },
  escrowAddress: { type: String },
  txHash: { type: String },

  // Settings
  settings: {
    isPublic: { type: Boolean, default: true },
    requiresRegistration: { type: Boolean, default: false },
    allowLateJoin: { type: Boolean, default: true },
    showLeaderboard: { type: Boolean, default: true },
    showProgress: { type: Boolean, default: true }
  },

  // Tags & Categories
  tags: [{ type: String }],
  category: {
    type: String,
    enum: ['travel', 'food', 'retail', 'entertainment', 'fitness', 'education', 'community', 'other'],
    default: 'other'
  },

  // Verification
  isVerified: { type: Boolean, default: false },
  verifiedAt: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Flags
  isFeatured: { type: Boolean, default: false },
  isSponsored: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Indexes
campaignSchema.index({ status: 1, startDate: 1, endDate: 1 });
campaignSchema.index({ organizationId: 1 });
campaignSchema.index({ campaignType: 1 });
campaignSchema.index({ 'targetRegions.coordinates': '2dsphere' });

// Generate short code
campaignSchema.pre('save', function(next) {
  if (!this.shortCode) {
    this.shortCode = 'C' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// Virtual: Is Active
campaignSchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === QUEST_STATUS.ACTIVE &&
         (!this.startDate || now >= this.startDate) &&
         (!this.endDate || now <= this.endDate);
});

// Virtual: Quest count
campaignSchema.virtual('questCount').get(function() {
  return this.quests?.length || 0;
});

// Method: Get user progress
campaignSchema.methods.getUserProgress = async function(userId) {
  const QuestCompletion = mongoose.model('QuestCompletion');
  
  const questIds = this.quests.map(q => q.questId);
  const completions = await QuestCompletion.find({
    userId,
    questId: { $in: questIds },
    status: 'completed'
  }).select('questId');
  
  const completedQuestIds = completions.map(c => c.questId.toString());
  
  return {
    totalQuests: questIds.length,
    completedQuests: completedQuestIds.length,
    progress: (completedQuestIds.length / questIds.length) * 100,
    isCompleted: completedQuestIds.length === questIds.length,
    remainingQuests: questIds.filter(id => !completedQuestIds.includes(id.toString()))
  };
};

export default mongoose.model('Campaign', campaignSchema);