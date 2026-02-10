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

// Public routes
router.get('/', getBadges);
router.get('/leaderboard', getBadgeLeaderboard);
router.get('/:id', getBadge);
router.get('/user/:userId', getUserBadges);

// Protected routes
router.use(protect);

router.post('/', createBadge);
router.get('/user/my-badges', getMyBadges);
router.get('/user/created', getCreatedBadges);

router.post('/:id/award', awardBadge);
router.put('/:id', updateBadge);
router.delete('/:id', deleteBadge);

export default router;