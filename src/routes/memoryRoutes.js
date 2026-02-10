import express from 'express';
import { 
  createMemory,
  getMemories,
  getMemory,
  deleteMemory,
  verifyMemory,
  getStats,
  relayMemory          // ← NEW IMPORT
} from '../controllers/memoryController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protect);

router.get('/stats', getStats);

router.post('/relay', relayMemory);   // ← NEW ROUTE

router.route('/')
  .get(getMemories)
  .post(createMemory);

router.route('/:id')
  .get(getMemory)
  .delete(deleteMemory);

router.get('/:id/verify', verifyMemory);

export default router;