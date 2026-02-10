import express from 'express';

import {
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
} from '../controllers/questController.js';

// Middleware (adjust paths/names if different in your project)
import { protect } from '../middleware/authMiddleware.js';
// import { authorize } from '../middleware/roleMiddleware.js';

const router = express.Router();

/**
 * =========================
 * PUBLIC ROUTES
 * =========================
 */

// Get all quests (filters, pagination)
router.get('/', getQuests);

// Get user quest history
router.get('/user/history', protect, getQuestHistory);

// Get nearby quests
router.get('/nearby', getNearbyQuests);

// Get quest leaderboard
router.get('/:id/leaderboard', getQuestLeaderboard);

// Get single quest
router.get('/:id', getQuest);

// Create a quest (Creator / Brand / Admin)
// router.post('/', protect, authorize('creator', 'brand', 'admin'), createQuest);
router.post('/', protect, createQuest);

// Update quest
router.put('/:id', protect, updateQuest);

// Activate quest
router.post('/:id/activate', protect, activateQuest);

// Pause quest
router.post('/:id/pause', protect, pauseQuest);

// Delete quest
router.delete('/:id', protect, deleteQuest);

// Start quest attempt
router.post('/:id/start', protect, startQuestAttempt);

// Submit quest completion
router.post('/:id/submit', protect, submitQuestCompletion);

export default router;
