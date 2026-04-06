const STORAGE_KEY = 'selectedGenres';

const normalizeGenre = (value) => String(value || '').trim().toLowerCase();

export const readSelectedGenres = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(new Set(parsed.map(normalizeGenre).filter(Boolean)));
  } catch {
    return [];
  }
};

export const writeSelectedGenres = (genres) => {
  const normalized = Array.from(new Set((Array.isArray(genres) ? genres : []).map(normalizeGenre).filter(Boolean)));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent('genres:change', { detail: { selectedGenres: normalized } }));
  return normalized;
};

