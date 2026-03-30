import { recommendFromDatabase } from '../recommenderSystem/recommenderSystem.js';

const asStringArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (entry == null ? '' : String(entry)))
    .map((entry) => entry.trim())
    .filter(Boolean);
};

export const getRecommendations = async (req, res) => {
  try {
    const readBookIds = asStringArray(req.body?.readBookIds);
    const currentBookId = req.body?.currentBookId
      ? String(req.body.currentBookId)
      : (readBookIds[0] || '');

    const limitPerShelf = Number.isFinite(Number(req.body?.limitPerShelf))
      ? Math.max(1, Math.min(20, Number(req.body.limitPerShelf)))
      : 10;

    const recommendations = await recommendFromDatabase({
      currentBookId,
      readBookIds,
      limitPerShelf,
    });

    res.json({
      currentBookId: currentBookId || null,
      recommendations,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error generating recommendations', error: error.message });
  }
};

