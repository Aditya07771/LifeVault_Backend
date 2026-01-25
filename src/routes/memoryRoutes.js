import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createMemory,
  getMemories,
  getMemory,
  deleteMemory,
  getMemoryFile,
  verifyMemory,
  getStats
} from '../controllers/memoryController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Stats route (must be before :id routes)
router.get('/stats', getStats);

// CRUD routes
router.route('/')
  .get(getMemories)
  .post(createMemory);

router.route('/:id')
  .get(getMemory)
  .delete(deleteMemory);

// File and verification routes
router.get('/:id/file', getMemoryFile);
router.get('/:id/verify', verifyMemory);

export default router;
