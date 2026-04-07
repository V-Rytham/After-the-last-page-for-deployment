import { runGlobalSearch } from '../services/searchService.js';
import { log } from '../utils/logger.js';

export const getSearch = async (req, res) => {
  try {
    log('Incoming search query:', req.query);
    const q = String(req.query?.q || '').trim();
    if (!q) {
      return res.json({ books: [] });
    }

    const books = await runGlobalSearch({ q });
    return res.json({ books });
  } catch (error) {
    console.error('[SEARCH] Failed:', error?.message || error);
    return res.status(500).json({ error: 'Search failed.' });
  }
};
