import mongoose from 'mongoose';
import crypto from 'crypto';

const storySchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: [true, 'Story title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: { type: String, trim: true },
  
  // Short code for sharing
  shortCode: {
    type: String,
    unique: true,
    index: true
  },

  // Creator
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Recipients
  recipients: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    email: { type: String },
    phone: { type: String },
    name: { type: String },
    inviteSentAt: { type: Date },
    acceptedAt: { type: Date },
    currentChapter: { type: Number, default: 0 }
  }],
  isPublic: { type: Boolean, default: false },

  // Chapters (stored as references)
  chapters: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StoryChapter'
  }],
  totalChapters: { type: Number, default: 0 },

  // Story Settings
  settings: {
    allowSkipChapters: { type: Boolean, default: false },
    showChapterTitles: { type: Boolean, default: true },
    notifyOnUnlock: { type: Boolean, default: true },
    theme: {
      type: String,
      enum: ['romantic', 'adventure', 'mystery', 'celebration', 'memory', 'custom'],
      default: 'memory'
    },
    customTheme: {
      primaryColor: { type: String },
      secondaryColor: { type: String },
      fontFamily: { type: String }
    }
  },

  // Cover & Media
  coverImage: { type: String },
  backgroundMusic: { type: String },
  
  // Encryption
  isEncrypted: { type: Boolean, default: true },
  encryptionKey: { type: String, select: false }, // Derived from password or user key

  // Status
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
    default: 'draft'
  },
  activatedAt: { type: Date },
  completedAt: { type: Date },

  // Statistics
  stats: {
    totalViews: { type: Number, default: 0 },
    completions: { type: Number, default: 0 },
    averageCompletionTime: { type: Number, default: 0 } // hours
  },

  // Optional: Link to quest/campaign
  linkedCampaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  },

  // Tags
  tags: [{ type: String }],
  occasion: {
    type: String,
    enum: ['birthday', 'anniversary', 'proposal', 'graduation', 'travel', 'friendship', 'family', 'other']
  }
}, {
  timestamps: true
});

// Generate short code
storySchema.pre('save', function(next) {
  if (!this.shortCode) {
    this.shortCode = 'S' + crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// Method: Get progress for a recipient
storySchema.methods.getProgressForUser = async function(userId) {
  const recipient = this.recipients.find(r => r.userId?.toString() === userId.toString());
  
  if (!recipient) {
    return { error: 'User is not a recipient of this story' };
  }
  
  await this.populate('chapters');
  
  const unlockedChapters = [];
  const lockedChapters = [];
  
  for (const chapter of this.chapters) {
    const canUnlock = await chapter.checkUnlockConditions(userId);
    if (canUnlock.unlocked) {
      unlockedChapters.push(chapter);
    } else {
      lockedChapters.push({ chapter, reason: canUnlock.reason });
    }
  }
  
  return {
    totalChapters: this.chapters.length,
    unlockedCount: unlockedChapters.length,
    progress: (unlockedChapters.length / this.chapters.length) * 100,
    currentChapter: recipient.currentChapter,
    unlockedChapters,
    nextLocked: lockedChapters[0] || null
  };
};

export default mongoose.model('Story', storySchema);