import mongoose from 'mongoose';
import { Book } from '../../../models/Book.js';
import { User } from '../../../models/User.js';
import { gutenbergCatalog } from '../../../seed/gutenbergCatalog.js';
import { fetchGutenbergMetadata } from '../../../utils/gutenbergReader.js';
import {
  aggregateBookSearch,
  readBookFromSource,
  SOURCE_NAMES,
  splitCompositeSourceId,
} from '../../../services/bookAggregationService.js';

export class BooksRepository {
  async listRecentBooks() {
    return Book.find({})
      .select('_id title author gutenbergId')
      .sort({ lastAccessedAt: -1, _id: -1 })
      .lean();
  }

  async findBookByObjectId(routeId, projection = null) {
    if (!mongoose.Types.ObjectId.isValid(routeId)) return null;
    return Book.findById(routeId).select(projection);
  }

  async findBookByGutenbergId(gutenbergId) {
    return Book.findOne({ gutenbergId }).select('_id title author gutenbergId').lean();
  }

  async upsertMetadata({ gutenbergId, title, author }) {
    return Book.findOneAndUpdate(
      { gutenbergId },
      {
        $set: {
          title,
          author,
          gutenbergId,
          lastAccessedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).select('_id title author gutenbergId');
  }

  getCatalogEntries() {
    return Array.isArray(gutenbergCatalog) ? gutenbergCatalog : [];
  }

  async fetchRemoteMetadata(gutenbergId, { timeoutMs }) {
    return fetchGutenbergMetadata(gutenbergId, { timeoutMs });
  }

  async runAggregatedSearch(query) {
    return aggregateBookSearch(query);
  }

  async readBySource(params) {
    return readBookFromSource(params);
  }

  parseCompositeSourceId(value) {
    return splitCompositeSourceId(value);
  }

  getSourceNames() {
    return SOURCE_NAMES;
  }

  async getUserPreferredGenres(userId) {
    const user = await User.findById(userId).select('preferredGenres').lean();
    return Array.isArray(user?.preferredGenres) ? user.preferredGenres : [];
  }
}
