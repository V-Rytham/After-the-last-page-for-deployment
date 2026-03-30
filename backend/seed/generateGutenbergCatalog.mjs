import fs from 'node:fs/promises';

const GUTENBERG_TOP_URL = 'https://www.gutenberg.org/browse/scores/top';
const GUTENDEX_BOOK_URL = (id) => `https://gutendex.com/books/${encodeURIComponent(String(id))}`;

const CORE_BOOKS = [
  // Original starter set (plus 5 to reach the documented baseline of 15).
  1342, // Pride and Prejudice
  2701, // Moby-Dick; or, The Whale
  84, // Frankenstein
  345, // Dracula
  174, // The Picture of Dorian Gray
  35, // The Time Machine
  36, // The War of the Worlds
  11, // Alice's Adventures in Wonderland
  1661, // The Adventures of Sherlock Holmes
  215, // The Call of the Wild
  98, // A Tale of Two Cities
  1400, // Great Expectations
  1727, // The Odyssey
  6130, // The Iliad
  132, // The Art of War
];

const TARGET_TOTAL = 115;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithRetry = async (url, { attempts = 6, backoffMs = 650 } = {}) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          'user-agent': 'after-the-last-page/seed-catalog (github.com/openai/codex-cli)',
          accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get('retry-after'));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoffMs * (i + 2) * 3;
          await delay(Math.min(waitMs, 30000));
          throw new Error('HTTP 429');
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (error) {
      lastError = error;
      await delay(backoffMs * (i + 1));
    }
  }
  throw lastError || new Error('Fetch failed');
};

const uniq = (values) => [...new Set(values)];

const extractTopIds = (html) => {
  const ids = [];
  for (const match of html.matchAll(/\/ebooks\/(\d+)/g)) {
    ids.push(Number(match[1]));
  }
  return uniq(ids.filter((id) => Number.isFinite(id) && id > 0));
};

const titleCase = (value) => (
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
);

const canonicalizeTag = (tag) => {
  const raw = String(tag || '').trim();
  if (!raw) return null;

  const key = raw.toLowerCase();
  const map = new Map([
    ['sci fi', 'Science Fiction'],
    ['sci-fi', 'Science Fiction'],
    ['science fiction', 'Science Fiction'],
    ['sf', 'Science Fiction'],
    ['gothic', 'Gothic'],
    ['horror', 'Horror'],
    ['romance', 'Romance'],
    ['fantasy', 'Fantasy'],
    ['adventure', 'Adventure'],
    ['mystery', 'Mystery'],
    ['detective', 'Detective'],
    ['thriller', 'Thriller'],
    ['historical fiction', 'Historical Fiction'],
    ['history', 'History'],
    ['philosophy', 'Philosophy'],
    ['psychology', 'Psychology'],
    ['poetry', 'Poetry'],
    ['drama', 'Drama'],
    ['short stories', 'Short Stories'],
    ["children's", "Children's"],
    ['children', "Children's"],
    ['essays', 'Essays'],
    ['politics', 'Politics'],
    ['economics', 'Economics'],
    ['religion', 'Religion'],
    ['spirituality', 'Spirituality'],
    ['nature', 'Nature'],
    ['travel', 'Travel'],
    ['war', 'War'],
    ['humor', 'Humor'],
    ['mythology', 'Mythology'],
    ['classic', 'Classic Literature'],
    ['classics', 'Classic Literature'],
    ['classic literature', 'Classic Literature'],
    ['literary fiction', 'Literary Fiction'],
    ['nonfiction', 'Nonfiction'],
    ['non-fiction', 'Nonfiction'],
    ['science', 'Science'],
  ]);

  if (map.has(key)) {
    return map.get(key);
  }

  const cleaned = raw
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+&\s+/g, ' and ')
    .replace(/\b(sci)\s*[-]?\s*fi\b/gi, 'science fiction')
    .trim();

  const maybe = titleCase(cleaned);
  if (!maybe) return null;
  return maybe;
};

const tagFromSubjects = (subjects = [], shelves = []) => {
  const corpus = [...subjects, ...shelves].map((s) => String(s || '')).filter(Boolean);
  const tags = new Set();

  const add = (value) => {
    const canonical = canonicalizeTag(value);
    if (canonical) tags.add(canonical);
  };

  const addIfMatch = (pattern, tag) => {
    if (corpus.some((entry) => pattern.test(entry))) {
      add(tag);
    }
  };

  addIfMatch(/\bscience fiction\b/i, 'Science Fiction');
  addIfMatch(/\bfantasy\b/i, 'Fantasy');
  addIfMatch(/\bhorror\b/i, 'Horror');
  addIfMatch(/\bgothic\b/i, 'Gothic');
  addIfMatch(/\bmystery\b/i, 'Mystery');
  addIfMatch(/\bdetective\b/i, 'Detective');
  addIfMatch(/\bromance\b/i, 'Romance');
  addIfMatch(/\badventure\b/i, 'Adventure');
  addIfMatch(/\bhumou?r\b/i, 'Humor');
  addIfMatch(/\bpoetry\b/i, 'Poetry');
  addIfMatch(/\bdrama\b/i, 'Drama');
  addIfMatch(/\bshort stories\b/i, 'Short Stories');
  addIfMatch(/\bchildren\b/i, "Children's");
  addIfMatch(/\bmythology\b/i, 'Mythology');
  addIfMatch(/\bphilosophy\b/i, 'Philosophy');
  addIfMatch(/\bpsychology\b/i, 'Psychology');
  addIfMatch(/\breligion\b/i, 'Religion');
  addIfMatch(/\bspiritual/i, 'Spirituality');
  addIfMatch(/\bpolitic/i, 'Politics');
  addIfMatch(/\beconomic/i, 'Economics');
  addIfMatch(/\bhistory\b/i, 'History');
  addIfMatch(/\bhistorical fiction\b/i, 'Historical Fiction');
  addIfMatch(/\bnature\b/i, 'Nature');
  addIfMatch(/\btravel\b/i, 'Travel');
  addIfMatch(/\bwar\b/i, 'War');
  addIfMatch(/\bessays\b/i, 'Essays');

  // If we still don't have a genre-ish tag, fall back to broad buckets.
  if (!tags.size) {
    const hasFiction = corpus.some((entry) => /\bfiction\b/i.test(entry));
    add(hasFiction ? 'Literary Fiction' : 'Nonfiction');
  }

  // Add "Classic Literature" for most Gutenberg titles unless explicitly modern genre.
  add('Classic Literature');

  return [...tags];
};

const cleanSubjectPhrase = (value) => (
  String(value || '')
    .replace(/\s*--\s*Fiction\b/gi, '')
    .replace(/\s*--\s*Juvenile fiction\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
);

const deriveSynopsis = ({ title, subjects = [], bookshelves = [], download_count: downloadCount }, tags = []) => {
  const primary = tags[0] || 'Book';
  const phrases = uniq(subjects.map(cleanSubjectPhrase).filter(Boolean))
    .filter((phrase) => phrase.length >= 6 && phrase.length <= 60)
    .slice(0, 3);

  const about = phrases.length
    ? `about ${phrases.slice(0, 2).map((p) => p.toLowerCase()).join(' and ')}`
    : 'with enduring themes and vivid storytelling';

  const shelfHint = bookshelves.find((s) => /Category:/i.test(s)) || bookshelves[0] || '';
  const hint = shelfHint
    ? ` Drawn from ${shelfHint.replace(/^Category:\s*/i, '').trim()} shelves.`
    : '';

  const popularity = typeof downloadCount === 'number' && downloadCount > 20000
    ? ' A widely read public-domain favorite.'
    : ' A public-domain edition for calm reading.';

  return `${title} is a ${primary.toLowerCase()} classic ${about}.${hint}${popularity}`.trim();
};

const clampTags = (tags) => {
  const cleaned = tags
    .map((t) => canonicalizeTag(t))
    .filter(Boolean);
  const unique = uniq(cleaned);
  return unique.slice(0, 6);
};

const escapeJs = (value) => (
  String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
);

const toCatalogJs = (items) => {
  const lines = [];
  lines.push('export const gutenbergCatalog = [');
  for (const item of items) {
    lines.push('  {');
    lines.push(`    title: '${escapeJs(item.title)}',`);
    lines.push(`    author: '${escapeJs(item.author)}',`);
    lines.push(`    gutenbergId: ${item.gutenbergId},`);
    if (item.minReadHours) {
      lines.push(`    minReadHours: ${item.minReadHours},`);
    }
    if (item.series) {
      lines.push(`    series: '${escapeJs(item.series)}',`);
    }
    if (typeof item.seriesIndex === 'number') {
      lines.push(`    seriesIndex: ${item.seriesIndex},`);
    }
    lines.push(`    synopsis: '${escapeJs(item.synopsis)}',`);
    lines.push(`    tags: ${JSON.stringify(item.tags)},`);
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  return lines.join('\n');
};

const main = async () => {
  const topRes = await fetchWithRetry(GUTENBERG_TOP_URL);
  const topHtml = await topRes.text();
  const topIds = extractTopIds(topHtml);

  const selected = new Set();
  const candidates = uniq([...CORE_BOOKS, ...topIds]);
  if (candidates.length < TARGET_TOTAL) {
    throw new Error(`Only found ${candidates.length} candidate ids; need ${TARGET_TOTAL}.`);
  }

  const results = [];
  for (let i = 0; i < candidates.length; i += 1) {
    if (results.length >= TARGET_TOTAL) {
      break;
    }

    const id = candidates[i];
    process.stdout.write(`[CATALOG] ${results.length + 1}/${TARGET_TOTAL} #${id} ... `);
    try {
      // Play nice with Gutendex; avoid bursty traffic.
      await delay(450);
      const res = await fetchWithRetry(GUTENDEX_BOOK_URL(id));
      const book = await res.json();
      const title = String(book.title || '').trim();
      const author = String(book.authors?.[0]?.name || 'Unknown').trim();
      const tags = clampTags(tagFromSubjects(book.subjects, book.bookshelves));
      const synopsis = deriveSynopsis(book, tags);

      const minReadHours = 4;
      results.push({
        title,
        author,
        gutenbergId: id,
        synopsis,
        minReadHours,
        tags,
      });
      selected.add(id);
      process.stdout.write('ok\n');
    } catch (error) {
      process.stdout.write(`skip (${error?.message || error})\n`);
    }
  }

  if (results.length < TARGET_TOTAL) {
    throw new Error(`Only generated ${results.length} books; need ${TARGET_TOTAL}.`);
  }

  // Stable ordering: keep core books at the top, then sort the rest by title.
  const byId = new Map(results.map((item) => [item.gutenbergId, item]));
  const coreSet = new Set(CORE_BOOKS);
  const coreItems = CORE_BOOKS.map((id) => byId.get(id)).filter(Boolean);
  const restItems = results
    .filter((item) => !coreSet.has(item.gutenbergId))
    .sort((a, b) => a.title.localeCompare(b.title));

  const finalItems = [...coreItems, ...restItems];

  const outPath = new URL('./gutenbergCatalog.js', import.meta.url);
  await fs.writeFile(outPath, toCatalogJs(finalItems), 'utf8');
  console.log(`[CATALOG] Wrote ${finalItems.length} books to ${outPath.pathname}`);
};

await main();
