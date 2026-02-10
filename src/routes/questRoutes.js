// src/routes/questRoutes.js

import express from 'express';
import {
  createQuest,
  getQuests,
  getNearbyQuests,
  getQuest,
  attemptQuest,
  getMyCompletions,
  getMyQuests,
  updateQuestStatus,
  updateQuest,
  deleteQuest,
  getQuestStats
} from '../controllers/questController.js';
import { protect, optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (with optional auth for user-specific data)
router.get('/', optionalAuth, getQuests);
router.get('/nearby', getNearbyQuests);
router.get('/:id', optionalAuth, getQuest);

// Protected routes
router.use(protect);

router.post('/', createQuest);
router.get('/user/my-completions', getMyCompletions);
router.get('/user/my-quests', getMyQuests);

router.post('/:id/attempt', attemptQuest);
router.patch('/:id/status', updateQuestStatus);
router.put('/:id', updateQuest);
router.delete('/:id', deleteQuest);
router.get('/:id/stats', getQuestStats);

export default router;