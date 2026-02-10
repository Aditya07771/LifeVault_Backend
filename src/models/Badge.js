import mongoose from 'mongoose';
import { BADGE_RARITY } from '../config/constants.js';
import crypto from 'crypto';

const badgeSchema = new mongoose.Schema({
  // Basic Info
  name: {
    type: String,
    required: [true, 'Badge name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  shortCode: {
    type: String,
    unique: true,
    index: true
  },

  // Creator
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },

  // Visual
  imageUrl: {
    type: String,
    required: [true, 'Badge image is required']
  },
  thumbnailUrl: { type: String },
  animatedUrl: { type: String },
  backgroundColor: { type: String, default: '#000000' },

  // NFT Metadata
  nftMetadata: {
    isNft: { type: Boolean, default: false },
    collectionId: { type: String },
    maxSupply: { type: Number },
    currentSupply: { type: Number, default: 0 },
    royaltyPercentage: { type: Number, default: 0 },
    attributes: [{
      trait_type: { type: String },
      value: { type: mongoose.Schema.Types.Mixed },
      display_type: { type: String }
    }]
  },

  // Classification
  rarity: {
    type: String,
    enum: Object.values(BADGE_RARITY),
    default: BADGE_RARITY.COMMON
  },
  category: {
    type: String,
    enum: ['achievement', 'location', 'collection', 'event', 'milestone', 'special'],
    default: 'achievement'
  },
  tier: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },

  // Requirements to Earn
  requirements: {
    questId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quest' },
    campaignCompletion: { type: Boolean, default: false },
    questCount: { type: Number },
    specificLocations: [{ type: String }],
    customCondition: { type: String }
  },

  // Stats
  stats: {
    totalAwarded: { type: Number, default: 0 },
    uniqueHolders: { type: Number, default: 0 }
  },

  // On-Chain
  onChainBadgeId: { type: String },
  contractAddress: { type: String },
  metadataUri: { type: String },

  // Settings
  isActive: { type: Boolean, default: true },
  isTransferable: { type: Boolean, default: true },
  isBurnable: { type: Boolean, default: false },
  expiresAt: { type: Date },

  // Points Value
  pointValue: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Index
badgeSchema.index({ creatorId: 1 });
badgeSchema.index({ campaignId: 1 });
badgeSchema.index({ rarity: 1 });

// Generate short code
badgeSchema.pre('save', function (next) {
  if (!this.shortCode) {
    this.shortCode = 'B' + crypto.randomBytes(3).toString('hex').toUpperCase();
  }
  next();
});

// Method: Award badge to user
badgeSchema.methods.awardTo = async function (userId) {
  const User = mongoose.model('User');
  const user = await User.findById(userId);

  if (!user) throw new Error('User not found');

  // Check if already has badge
  if (user.badges?.some(b => b.badgeId.toString() === this._id.toString())) {
    throw new Error('User already has this badge');
  }

  // Check max supply
  if (this.nftMetadata?.maxSupply &&
    this.stats.totalAwarded >= this.nftMetadata.maxSupply) {
    throw new Error('Badge max supply reached');
  }

  // Add to user
  if (!user.badges) user.badges = [];
  user.badges.push({
    badgeId: this._id,
    awardedAt: new Date(),
    questCompletionId: null // Can be linked later
  });

  // Update stats
  this.stats.totalAwarded += 1;
  this.stats.uniqueHolders += 1;

  await Promise.all([user.save(), this.save()]);

  return { success: true, badge: this, user };
};

export default mongoose.model('Badge', badgeSchema);