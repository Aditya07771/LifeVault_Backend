import mongoose from 'mongoose';

const storyChapterSchema = new mongoose.Schema({
  // Reference to parent story
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story',
    required: true,
    index: true
  },

  // Chapter Info
  chapterNumber: {
    type: Number,
    required: true
  },
  title: {
    type: String,
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  subtitle: { type: String },

  // Content (Encrypted)
  content: {
    type: { 
      type: String, 
      enum: ['text', 'photo', 'video', 'audio', 'memory', 'message'] 
    },
    
    // For text/message
    text: { type: String },
    
    // For media
    mediaUrl: { type: String },
    mediaIpfsHash: { type: String },
    thumbnailUrl: { type: String },
    
    // For linking to existing memory
    memoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Memory' },
    
    // Caption/Note
    caption: { type: String },
    
    // Encrypted content blob (for private stories)
    encryptedData: { type: String }
  },

  // Unlock Conditions
  unlockConditions: {
    // Location-based
    location: {
      enabled: { type: Boolean, default: false },
      name: { type: String },
      coordinates: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      radiusMeters: { type: Number, default: 50 }
    },

    // Time-based
    time: {
      enabled: { type: Boolean, default: false },
      unlockAt: { type: Date }, // Specific date/time
      unlockAfterPrevious: { type: Number }, // Hours after previous chapter
      specificTime: { type: String }, // HH:MM (e.g., "21:00" for 9 PM)
      specificDate: { type: String } // MM-DD (e.g., "02-14" for Valentine's)
    },

    // QR Code
    qrCode: {
      enabled: { type: Boolean, default: false },
      code: { type: String, select: false },
      codeHash: { type: String },
      hint: { type: String }
    },

    // Password/Secret
    password: {
      enabled: { type: Boolean, default: false },
      hash: { type: String, select: false },
      hint: { type: String }
    },

    // Previous chapter requirement
    requirePreviousChapter: { type: Boolean, default: true },

    // Custom condition (for advanced quests)
    customCondition: {
      enabled: { type: Boolean, default: false },
      type: { type: String },
      value: { type: mongoose.Schema.Types.Mixed }
    }
  },

  // Hint for finding/unlocking this chapter
  hint: {
    text: { type: String },
    imageUrl: { type: String }
  },

  // Background/Theme for this chapter
  theme: {
    backgroundColor: { type: String },
    textColor: { type: String },
    backgroundImage: { type: String },
    animation: { type: String }
  },

  // Stats
  stats: {
    viewCount: { type: Number, default: 0 },
    unlockAttempts: { type: Number, default: 0 },
    averageTimeToUnlock: { type: Number, default: 0 } // seconds
  },

  // Unlock History
  unlockedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    unlockedAt: { type: Date },
    method: { type: String }
  }],

  // Order
  order: { type: Number }
}, {
  timestamps: true
});

// Compound index
storyChapterSchema.index({ storyId: 1, chapterNumber: 1 });
storyChapterSchema.index({ 'unlockConditions.location.coordinates': '2dsphere' });

// Method: Check if chapter can be unlocked
storyChapterSchema.methods.checkUnlockConditions = async function(userId, submittedData = {}) {
  const conditions = this.unlockConditions;
  const results = { unlocked: true, checks: [], reason: null };

  // Check previous chapter requirement
  if (conditions.requirePreviousChapter && this.chapterNumber > 1) {
    const StoryChapter = mongoose.model('StoryChapter');
    const previousChapter = await StoryChapter.findOne({
      storyId: this.storyId,
      chapterNumber: this.chapterNumber - 1,
      'unlockedBy.userId': userId
    });
    
    if (!previousChapter) {
      results.unlocked = false;
      results.checks.push({ type: 'previousChapter', passed: false });
      results.reason = 'Complete the previous chapter first';
      return results;
    }
    results.checks.push({ type: 'previousChapter', passed: true });
  }

  // Check location
  if (conditions.location?.enabled) {
    const { latitude, longitude } = submittedData;
    if (!latitude || !longitude) {
      results.unlocked = false;
      results.checks.push({ type: 'location', passed: false });
      results.reason = `Go to: ${conditions.location.name || 'the secret location'}`;
      return results;
    }
    
    // Calculate distance (simplified, use geolocationService for accurate)
    const [targetLng, targetLat] = conditions.location.coordinates.coordinates;
    const distance = calculateDistance(latitude, longitude, targetLat, targetLng);
    
    if (distance > conditions.location.radiusMeters) {
      results.unlocked = false;
      results.checks.push({ type: 'location', passed: false, distance });
      results.reason = `You're ${Math.round(distance)}m away. Get closer!`;
      return results;
    }
    results.checks.push({ type: 'location', passed: true });
  }

  // Check time
  if (conditions.time?.enabled) {
    const now = new Date();
    
    if (conditions.time.unlockAt && now < new Date(conditions.time.unlockAt)) {
      results.unlocked = false;
      results.checks.push({ type: 'time', passed: false });
      results.reason = `This chapter unlocks on ${new Date(conditions.time.unlockAt).toLocaleString()}`;
      return results;
    }
    
    if (conditions.time.specificTime) {
      const [hours, minutes] = conditions.time.specificTime.split(':');
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      
      if (currentHours !== parseInt(hours) || Math.abs(currentMinutes - parseInt(minutes)) > 5) {
        results.unlocked = false;
        results.checks.push({ type: 'time', passed: false });
        results.reason = `Come back at ${conditions.time.specificTime}`;
        return results;
      }
    }
    results.checks.push({ type: 'time', passed: true });
  }

  // Check QR code
  if (conditions.qrCode?.enabled) {
    if (!submittedData.qrCode) {
      results.unlocked = false;
      results.checks.push({ type: 'qrCode', passed: false });
      results.reason = conditions.qrCode.hint || 'Scan the QR code to unlock';
      return results;
    }
    
    const crypto = await import('crypto');
    const submittedHash = crypto.createHash('sha256').update(submittedData.qrCode).digest('hex');
    
    if (submittedHash !== conditions.qrCode.codeHash) {
      results.unlocked = false;
      results.checks.push({ type: 'qrCode', passed: false });
      results.reason = 'Wrong QR code';
      return results;
    }
    results.checks.push({ type: 'qrCode', passed: true });
  }

  // Check password
  if (conditions.password?.enabled) {
    if (!submittedData.password) {
      results.unlocked = false;
      results.checks.push({ type: 'password', passed: false });
      results.reason = conditions.password.hint || 'Enter the secret password';
      return results;
    }
    
    const bcrypt = await import('bcryptjs');
    const isMatch = await bcrypt.compare(submittedData.password, conditions.password.hash);
    
    if (!isMatch) {
      results.unlocked = false;
      results.checks.push({ type: 'password', passed: false });
      results.reason = 'Incorrect password';
      return results;
    }
    results.checks.push({ type: 'password', passed: true });
  }

  return results;
};

// Method: Record unlock
storyChapterSchema.methods.recordUnlock = async function(userId, method) {
  this.unlockedBy.push({
    userId,
    unlockedAt: new Date(),
    method
  });
  this.stats.viewCount += 1;
  return this.save();
};

// Helper function for distance calculation
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

export default mongoose.model('StoryChapter', storyChapterSchema);