const titleCase = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
);

export const canonicalizeTag = (tag) => {
  const raw = String(tag || '').trim();
  if (!raw) return null;

  const key = raw.toLowerCase();
  const map = new Map([
    ['sci fi', 'Science Fiction'],
    ['sci-fi', 'Science Fiction'],
    ['scifi', 'Science Fiction'],
    ['science fiction', 'Science Fiction'],
    ['sf', 'Science Fiction'],
    ['ya', 'Young Adult'],
    ['young-adult', 'Young Adult'],
    ['non fiction', 'Nonfiction'],
    ['non-fiction', 'Nonfiction'],
    ['biography & memoir', 'Biography'],
    ['memoir', 'Biography'],
    ['kids', "Children's"],
    ['children', "Children's"],
    ["children's fiction", "Children's"],
    ['short story', 'Short Stories'],
    ['short stories', 'Short Stories'],
    ['classic', 'Classic Literature'],
    ['classics', 'Classic Literature'],
    ['classic literature', 'Classic Literature'],
    ['lit', 'Literary Fiction'],
    ['literature', 'Literary Fiction'],
  ]);

  if (map.has(key)) {
    return map.get(key);
  }

  const cleaned = raw
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+&\s+/g, ' and ')
    .trim();

  const cased = titleCase(cleaned);
  return cased || null;
};

export const normalizeTags = (tags) => {
  const seen = new Set();
  const result = [];

  for (const entry of Array.isArray(tags) ? tags : [tags]) {
    const canonical = canonicalizeTag(entry);
    if (!canonical) continue;

    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }

  return result;
};

