import dotenv from 'dotenv';
import { connectDB } from '../config/db.js';
import { Book } from '../models/Book.js';
import { normalizeTags } from '../utils/tags.js';

dotenv.config();

const main = async () => {
  await connectDB();

  const books = await Book.find({}).select('title tags').exec();
  let updated = 0;

  for (const book of books) {
    const before = Array.isArray(book.tags) ? book.tags : [];
    const after = normalizeTags(before);

    const beforeKey = before.map((t) => String(t || '')).join('|');
    const afterKey = after.join('|');

    if (beforeKey !== afterKey) {
      book.tags = after;
      await book.save();
      updated += 1;
      console.log(`[TAGS] Normalized: ${book.title}`);
    }
  }

  console.log(`[TAGS] Done. Updated ${updated}/${books.length} books.`);
  process.exit(0);
};

main().catch((error) => {
  console.error('[TAGS] Failed:', error);
  process.exit(1);
});

