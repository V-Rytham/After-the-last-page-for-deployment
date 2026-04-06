import { runGlobalSearch } from '../services/searchService.js';

export const getSearch = async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    if (!q) {
      return res.json({ books: [] });
    }

    const books = await runGlobalSearch({ q });
    return res.json({ books });
  } catch (error) {
    console.error('[SEARCH] Failed:', error?.message || error);
    return res.status(500).json({ message: 'Search failed.' });
  }
};

