export const stripHtml = (value = '') => value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export const tokenize = (value = '') => stripHtml(value)
  .toLowerCase()
  .split(/[^a-z0-9]+/i)
  .filter(Boolean);
