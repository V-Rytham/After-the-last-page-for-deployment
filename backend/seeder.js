
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { Book } from './models/Book.js';
import { defaultBooks } from './seed/defaultBooks.js';
import { convertTextToChapters, fetchGutenbergText, getGutenbergBookPageUrl, getGutenbergCoverUrl, stripGutenbergBoilerplate } from './utils/gutenberg.js';

dotenv.config();

const seedData = async () => {
  try {
    await connectDB();

    await Book.deleteMany();
    const inserted = await Book.insertMany(defaultBooks);

    for (const book of inserted) {
      if (!book.gutenbergId) {
        continue;
      }

      try {
        const rawText = await fetchGutenbergText(book.gutenbergId);
        const mainText = stripGutenbergBoilerplate(rawText);
        const chapters = convertTextToChapters(mainText, { fallbackTitle: 'Chapter' });

        book.textContent = mainText;
        book.chapters = chapters;
        book.sourceUrl = getGutenbergBookPageUrl(book.gutenbergId);
        book.coverImage = getGutenbergCoverUrl(book.gutenbergId, 'medium');
        book.rights = 'Public domain (Project Gutenberg)';
        book.sourceProvider = 'Project Gutenberg';
        await book.save();

        console.log(`[SEED] Ingested ${book.title} (${chapters.length} chapters)`);
      } catch (error) {
        console.error(`[SEED] Failed to ingest Gutenberg book ${book.title} (${book.gutenbergId}):`, error?.message || error);
      }
    }

    console.log('[SEED] Data Imported!');
    process.exit();
  } catch (error) {
    console.error(`[SEED Error]: ${error}`);
    process.exit(1);
  }
};

seedData();
