import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Book } from '../models/Book.js';
import { parsePositiveIntStrict } from '../utils/gutenbergId.js';

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);
const readOption = (name) => {
  const index = args.findIndex((arg) => arg === name);
  if (index < 0 || index === args.length - 1) {
    return null;
  }
  return args[index + 1];
};

const parseIdList = (value) => {
  if (!value) return [];
  return value
    .split(',')
    .map((part) => parsePositiveIntStrict(part))
    .filter(Boolean);
};

const printUsage = () => {
  console.log('Usage: node backend/scripts/resetGutenbergChapters.mjs [--all | --ids <id1,id2,...>] [--dry-run]');
  console.log('Examples:');
  console.log('  node backend/scripts/resetGutenbergChapters.mjs --all');
  console.log('  node backend/scripts/resetGutenbergChapters.mjs --ids 1184,1342');
  console.log('  node backend/scripts/resetGutenbergChapters.mjs --all --dry-run');
};

const buildGutenbergQuery = (idList) => {
  if (idList.length > 0) {
    return Book.find({ gutenbergId: { $in: idList } });
  }

  return Book.find({
    gutenbergId: {
      $type: 'number',
      $gt: 0,
    },
  });
};

const run = async () => {
  const isDryRun = hasFlag('--dry-run');
  const includeAll = hasFlag('--all');
  const idList = parseIdList(readOption('--ids'));

  if (!includeAll && idList.length === 0) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await connectDB();

  const query = buildGutenbergQuery(idList);
  const matchingBooks = await query.select('_id');

  const matchingIds = matchingBooks.map((book) => book._id);
  const matchingCount = matchingIds.length;

  if (matchingCount === 0) {
    console.log('[RESET] No matching Gutenberg books found. Nothing to do.');
    return;
  }

  if (isDryRun) {
    console.log(`[RESET] Dry run: ${matchingCount} book(s) would be reset.`);
    return;
  }

  const result = await Book.updateMany({ _id: { $in: matchingIds } }, {
    $set: {
      chapters: [],
      textContent: '',
    },
  });

  console.log(`[RESET] Matched ${result.matchedCount} book(s), reset ${result.modifiedCount} book(s).`);
};

run()
  .catch((error) => {
    console.error('[RESET] Failed to reset Gutenberg chapters:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.connection.close();
    } catch {
      // Best effort cleanup.
    }
  });
