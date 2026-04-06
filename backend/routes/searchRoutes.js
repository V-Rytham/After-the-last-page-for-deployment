import express from 'express';
import { getSearch } from '../controllers/searchController.js';

const router = express.Router();

// GET /api/search?q=...
router.get('/', getSearch);

export default router;

