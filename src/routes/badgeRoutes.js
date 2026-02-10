// src/routes/badgeRoutes.js

import express from 'express';
import {
  createBadge,
  getBadges,
  getBadge,
  getMyBadges,
  getUserBadges,
  awardBadge,
  getCreatedBadges,
  updateBadge,
  deleteBadge,
  getBadgeLeaderboard
} from '../controllers/badgeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protected routes (User specific)
router.get('/user/my-badges', protect, getMyBadges);
router.get('/user/created', protect, getCreatedBadges);
router.get('/user/:userId', getUserBadges);

// Public routes
router.get('/', getBadges);
router.get('/leaderboard', getBadgeLeaderboard);
router.get('/:id', getBadge);

// Protected routes (Actions)
router.use(protect);

router.post('/', createBadge);

router.post('/:id/award', awardBadge);
router.put('/:id', updateBadge);
router.delete('/:id', deleteBadge);

export default router;