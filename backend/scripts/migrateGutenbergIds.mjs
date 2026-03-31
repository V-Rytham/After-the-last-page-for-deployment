import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Book } from '../models/Book.js';
import { parsePositiveIntStrict } from '../utils/gutenbergId.js';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const deleteInvalid = args.includes('--delete-invalid');

const toStrictNumericGutenbergId = (value) => {
  if (typeof value === 'number') {
    return parsePositiveIntStrict(value);
  }

  if (typeof value === 'string') {
    return parsePositiveIntStrict(value);
  }

  return null;
};

const run = async () => {
  await connectDB();

  const books = await Book.find({}).select('_id gutenbergId title').lean();
  let fixed = 0;
  let removed = 0;
  let invalid = 0;

  for (const book of books) {
    const normalized = toStrictNumericGutenbergId(book?.gutenbergId);
    if (normalized != null && typeof book.gutenbergId === 'number' && book.gutenbergId === normalized) {
      continue;
    }

    if (normalized != null) {
      fixed += 1;
      if (!isDryRun) {
        await Book.updateOne(
          { _id: book._id },
          { $set: { gutenbergId: normalized } },
        );
      }
      continue;
    }

    invalid += 1;
    if (deleteInvalid) {
      removed += 1;
      if (!isDryRun) {
        await Book.deleteOne({ _id: book._id });
      }
    }
  }

  console.log(`[MIGRATE_GUTENBERG_ID] scanned=${books.length} fixed=${fixed} invalid=${invalid} removed=${removed} dryRun=${isDryRun}`);
  if (invalid > 0 && !deleteInvalid) {
    console.log('[MIGRATE_GUTENBERG_ID] Invalid records remain. Re-run with --delete-invalid to remove them.');
  }
};

run()
  .catch((error) => {
    console.error('[MIGRATE_GUTENBERG_ID] Failed:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // best effort
    }
  });
