// src/routes/storyRoutes.js

import express from 'express';
import {
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
} from '../controllers/storyController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route for viewing story by code
router.get('/code/:shortCode', getStoryByCode);

// Protected routes
router.use(protect);

// CRUD operations
router.post('/', createStory);
router.get('/my-stories', getMyStories);
router.get('/received', getReceivedStories);
router.get('/:id', getStory);
router.put('/:id', updateStory);
router.delete('/:id', deleteStory);

// Story management
router.patch('/:id/activate', activateStory);
router.post('/:id/recipients', addRecipient);

// Chapter operations
router.post('/:storyId/chapters', addChapter);
router.post('/:storyId/chapters/:chapterNumber/unlock', unlockChapter);

export default router;