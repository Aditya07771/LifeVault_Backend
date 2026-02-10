// src/controllers/storyController.js

import Story from '../models/Story.js';
import StoryChapter from '../models/StoryChapter.js';
import User from '../models/User.js';
import Memory from '../models/Memory.js';
import ipfsService from '../services/ipfsService.js';
import encryptionService from '../services/encryptionService.js';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * @desc    Create a new story
 * @route   POST /api/stories
 * @access  Private
 */
export const createStory = async (req, res, next) => {
  try {
    const {
      title,
      description,
      recipients,
      isPublic,
      settings,
      coverImage,
      occasion,
      tags
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    // Generate encryption key for private stories
    let encryptionKey = null;
    if (!isPublic) {
      encryptionKey = crypto.randomBytes(32).toString('hex');
    }

    // Process recipients
    const processedRecipients = [];
    if (recipients && recipients.length > 0) {
      for (const recipient of recipients) {
        const recipientData = {
          name: recipient.name,
          email: recipient.email,
          phone: recipient.phone,
          currentChapter: 0
        };

        // If email provided, try to find existing user
        if (recipient.email) {
          const existingUser = await User.findOne({ email: recipient.email });
          if (existingUser) {
            recipientData.userId = existingUser._id;
          }
        }

        processedRecipients.push(recipientData);
      }
    }

    const story = await Story.create({
      title,
      description,
      creatorId: req.user._id,
      recipients: processedRecipients,
      isPublic: isPublic || false,
      settings: {
        allowSkipChapters: settings?.allowSkipChapters || false,
        showChapterTitles: settings?.showChapterTitles || true,
        notifyOnUnlock: settings?.notifyOnUnlock || true,
        theme: settings?.theme || 'memory',
        customTheme: settings?.customTheme || {}
      },
      coverImage,
      isEncrypted: !isPublic,
      encryptionKey,
      status: 'draft',
      occasion,
      tags: tags || []
    });

    // Update user's created stories
    await User.findByIdAndUpdate(req.user._id, {
      $push: { storiesCreated: story._id }
    });

    console.log('✅ Story created:', story._id);

    res.status(201).json({
      success: true,
      message: 'Story created successfully',
      data: {
        story: {
          ...story.toObject(),
          encryptionKey: undefined // Don't expose in response
        },
        shortCode: story.shortCode
      }
    });

  } catch (error) {
    console.error('Create story error:', error);
    next(error);
  }
};

/**
 * @desc    Add a chapter to a story
 * @route   POST /api/stories/:storyId/chapters
 * @access  Private (Owner only)
 */
export const addChapter = async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const {
      title,
      subtitle,
      content,
      unlockConditions,
      hint,
      theme,
      order
    } = req.body;

    // Find story and verify ownership
    const story = await Story.findOne({
      _id: storyId,
      creatorId: req.user._id
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or unauthorized'
      });
    }

    // Determine chapter number
    const chapterNumber = order || story.chapters.length + 1;

    // Process content
    let processedContent = { ...content };

    // If content includes media, upload to IPFS
    if (content.mediaData) {
      const ipfsResult = await ipfsService.pinBase64(
        content.mediaData,
        `chapter_${storyId}_${chapterNumber}`,
        { storyId, chapterNumber }
      );
      processedContent.mediaIpfsHash = ipfsResult.ipfsHash;
      processedContent.mediaUrl = ipfsResult.gatewayUrl;
      delete processedContent.mediaData;
    }

    // If linking to existing memory
    if (content.memoryId) {
      const memory = await Memory.findOne({
        _id: content.memoryId,
        userId: req.user._id
      });
      if (!memory) {
        return res.status(404).json({
          success: false,
          message: 'Memory not found'
        });
      }
      processedContent.mediaIpfsHash = memory.ipfsHash;
      processedContent.mediaUrl = memory.ipfsUrl;
    }

    // Encrypt content if story is encrypted
    if (story.isEncrypted && processedContent.text) {
      // Fetch encryption key
      const storyWithKey = await Story.findById(storyId).select('+encryptionKey');
      processedContent.encryptedData = encryptionService.encrypt(
        processedContent.text,
        storyWithKey.encryptionKey
      );
      delete processedContent.text;
    }

    // Process unlock conditions
    const processedConditions = { ...unlockConditions };

    // Hash QR code if provided
    if (unlockConditions?.qrCode?.enabled && unlockConditions.qrCode.code) {
      processedConditions.qrCode.codeHash = crypto
        .createHash('sha256')
        .update(unlockConditions.qrCode.code)
        .digest('hex');
      delete processedConditions.qrCode.code;
    }

    // Hash password if provided
    if (unlockConditions?.password?.enabled && unlockConditions.password.value) {
      const salt = await bcrypt.genSalt(10);
      processedConditions.password.hash = await bcrypt.hash(
        unlockConditions.password.value,
        salt
      );
      delete processedConditions.password.value;
    }

    // Create chapter
    const chapter = await StoryChapter.create({
      storyId,
      chapterNumber,
      title,
      subtitle,
      content: processedContent,
      unlockConditions: processedConditions,
      hint,
      theme,
      order: chapterNumber
    });

    // Update story
    story.chapters.push(chapter._id);
    story.totalChapters = story.chapters.length;
    await story.save();

    console.log('✅ Chapter added:', chapter._id);

    res.status(201).json({
      success: true,
      message: 'Chapter added successfully',
      data: {
        chapter: {
          ...chapter.toObject(),
          unlockConditions: {
            ...chapter.unlockConditions,
            qrCode: chapter.unlockConditions.qrCode ? {
              ...chapter.unlockConditions.qrCode,
              code: undefined
            } : undefined,
            password: chapter.unlockConditions.password ? {
              enabled: chapter.unlockConditions.password.enabled,
              hint: chapter.unlockConditions.password.hint
            } : undefined
          }
        }
      }
    });

  } catch (error) {
    console.error('Add chapter error:', error);
    next(error);
  }
};

/**
 * @desc    Get story (with progress for recipient)
 * @route   GET /api/stories/:id
 * @access  Private (Creator or Recipient)
 */
export const getStory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const story = await Story.findById(id)
      .populate('creatorId', 'name avatar')
      .populate('chapters');

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Check access
    const isCreator = story.creatorId._id.toString() === req.user._id.toString();
    const isRecipient = story.recipients.some(
      r => r.userId?.toString() === req.user._id.toString() ||
           r.email === req.user.email
    );

    if (!story.isPublic && !isCreator && !isRecipient) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this story'
      });
    }

    // Get progress for recipient
    let progress = null;
    if (isRecipient && !isCreator) {
      progress = await story.getProgressForUser(req.user._id);
    }

    res.json({
      success: true,
      data: {
        story: {
          ...story.toObject(),
          encryptionKey: undefined
        },
        progress,
        isCreator,
        isRecipient
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get story by short code
 * @route   GET /api/stories/code/:shortCode
 * @access  Public (but content may be locked)
 */
export const getStoryByCode = async (req, res, next) => {
  try {
    const { shortCode } = req.params;

    const story = await Story.findOne({ shortCode })
      .populate('creatorId', 'name avatar')
      .select('-encryptionKey');

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Basic info for public view
    res.json({
      success: true,
      data: {
        id: story._id,
        title: story.title,
        description: story.description,
        coverImage: story.coverImage,
        totalChapters: story.totalChapters,
        creator: story.creatorId,
        occasion: story.occasion,
        isPublic: story.isPublic,
        status: story.status
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Attempt to unlock a chapter
 * @route   POST /api/stories/:storyId/chapters/:chapterNumber/unlock
 * @access  Private (Recipient only)
 */
export const unlockChapter = async (req, res, next) => {
  try {
    const { storyId, chapterNumber } = req.params;
    const { latitude, longitude, qrCode, password } = req.body;

    // Find story
    const story = await Story.findById(storyId).select('+encryptionKey');
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found'
      });
    }

    // Verify recipient
    const isRecipient = story.recipients.some(
      r => r.userId?.toString() === req.user._id.toString() ||
           r.email === req.user.email
    );

    if (!story.isPublic && !isRecipient) {
      return res.status(403).json({
        success: false,
        message: 'You are not a recipient of this story'
      });
    }

    // Find chapter
    const chapter = await StoryChapter.findOne({
      storyId,
      chapterNumber: parseInt(chapterNumber)
    }).select('+unlockConditions.qrCode.code +unlockConditions.password.hash');

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: 'Chapter not found'
      });
    }

    // Check if already unlocked
    const alreadyUnlocked = chapter.unlockedBy.some(
      u => u.userId.toString() === req.user._id.toString()
    );

    if (alreadyUnlocked) {
      // Return content directly
      const content = await getChapterContent(chapter, story);
      return res.json({
        success: true,
        message: 'Chapter already unlocked',
        data: { chapter, content }
      });
    }

    // Check unlock conditions
    const unlockResult = await chapter.checkUnlockConditions(req.user._id, {
      latitude,
      longitude,
      qrCode,
      password
    });

    chapter.stats.unlockAttempts += 1;
    await chapter.save();

    if (!unlockResult.unlocked) {
      return res.status(400).json({
        success: false,
        message: unlockResult.reason,
        data: {
          checks: unlockResult.checks
        }
      });
    }

    // Chapter unlocked!
    await chapter.recordUnlock(req.user._id, unlockResult.checks.map(c => c.type).join(','));

    // Update recipient's progress
    const recipientIndex = story.recipients.findIndex(
      r => r.userId?.toString() === req.user._id.toString() ||
           r.email === req.user.email
    );
    if (recipientIndex !== -1) {
      story.recipients[recipientIndex].currentChapter = parseInt(chapterNumber);
      await story.save();
    }

    // Get decrypted content
    const content = await getChapterContent(chapter, story);

    console.log('✅ Chapter unlocked:', chapterNumber);

    res.json({
      success: true,
      message: 'Chapter unlocked!',
      data: {
        chapter: {
          ...chapter.toObject(),
          unlockConditions: undefined
        },
        content
      }
    });

  } catch (error) {
    console.error('Unlock chapter error:', error);
    next(error);
  }
};

/**
 * @desc    Get user's created stories
 * @route   GET /api/stories/my-stories
 * @access  Private
 */
export const getMyStories = async (req, res, next) => {
  try {
    const stories = await Story.find({ creatorId: req.user._id })
      .populate('chapters', 'chapterNumber title')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: stories
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get stories received by user
 * @route   GET /api/stories/received
 * @access  Private
 */
export const getReceivedStories = async (req, res, next) => {
  try {
    const stories = await Story.find({
      $or: [
        { 'recipients.userId': req.user._id },
        { 'recipients.email': req.user.email }
      ]
    })
      .populate('creatorId', 'name avatar')
      .sort({ createdAt: -1 });

    // Add progress for each story
    const storiesWithProgress = await Promise.all(
      stories.map(async (story) => {
        const progress = await story.getProgressForUser(req.user._id);
        return {
          ...story.toObject(),
          progress
        };
      })
    );

    res.json({
      success: true,
      data: storiesWithProgress
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update story
 * @route   PUT /api/stories/:id
 * @access  Private (Owner only)
 */
export const updateStory = async (req, res, next) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or unauthorized'
      });
    }

    const allowedUpdates = [
      'title', 'description', 'settings', 'coverImage',
      'backgroundMusic', 'tags', 'occasion'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        story[field] = req.body[field];
      }
    });

    await story.save();

    res.json({
      success: true,
      message: 'Story updated successfully',
      data: story
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Activate story (make it live)
 * @route   PATCH /api/stories/:id/activate
 * @access  Private (Owner only)
 */
export const activateStory = async (req, res, next) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or unauthorized'
      });
    }

    if (story.chapters.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate story without chapters'
      });
    }

    story.status = 'active';
    story.activatedAt = new Date();
    await story.save();

    // TODO: Send notifications to recipients

    res.json({
      success: true,
      message: 'Story activated',
      data: story
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add recipient to story
 * @route   POST /api/stories/:id/recipients
 * @access  Private (Owner only)
 */
export const addRecipient = async (req, res, next) => {
  try {
    const { email, name, phone } = req.body;

    const story = await Story.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or unauthorized'
      });
    }

    // Check if already a recipient
    const exists = story.recipients.some(r => r.email === email);
    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'This person is already a recipient'
      });
    }

    // Find user if exists
    const user = await User.findOne({ email });

    story.recipients.push({
      userId: user?._id,
      email,
      name,
      phone,
      inviteSentAt: new Date(),
      currentChapter: 0
    });

    await story.save();

    // Add to user's received stories if user exists
    if (user) {
      await User.findByIdAndUpdate(user._id, {
        $push: {
          storiesReceived: {
            storyId: story._id,
            receivedAt: new Date()
          }
        }
      });
    }

    res.json({
      success: true,
      message: 'Recipient added successfully'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete story
 * @route   DELETE /api/stories/:id
 * @access  Private (Owner only)
 */
export const deleteStory = async (req, res, next) => {
  try {
    const story = await Story.findOne({
      _id: req.params.id,
      creatorId: req.user._id
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or unauthorized'
      });
    }

    // Delete all chapters
    await StoryChapter.deleteMany({ storyId: story._id });

    // Remove from user's created stories
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { storiesCreated: story._id }
    });

    await story.deleteOne();

    res.json({
      success: true,
      message: 'Story deleted successfully'
    });

  } catch (error) {
    next(error);
  }
};

// Helper function to get decrypted chapter content
async function getChapterContent(chapter, story) {
  const content = { ...chapter.content };

  // Decrypt text if encrypted
  if (content.encryptedData && story.encryptionKey) {
    content.text = encryptionService.decrypt(
      content.encryptedData,
      story.encryptionKey
    );
    delete content.encryptedData;
  }

  return content;
}

export default {
  createStory,
  addChapter,
  getStory,
  getStoryByCode,
  unlockChapter,
  getMyStories,
  getReceivedStories,
  updateStory,
  activateStory,
  addRecipient,
  deleteStory
};