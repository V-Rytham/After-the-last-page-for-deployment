const toPositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : fallback;
};

export const appConfig = {
  books: {
    backendTimeoutMs: toPositiveInt(process.env.BOOK_BACKEND_TIMEOUT_MS, 70_000),
    searchCacheTtlMs: toPositiveInt(process.env.BOOK_SEARCH_CACHE_TTL_MS, 5 * 60 * 1000),
    metadataCacheTtlMs: toPositiveInt(process.env.BOOK_METADATA_CACHE_TTL_MS, 5 * 60 * 1000),
    searchThrottleMs: toPositiveInt(process.env.BOOK_SEARCH_THROTTLE_MS, 450),
    reader: {
      defaultCursor: 0,
      defaultProcessingBudgetMs: toPositiveInt(process.env.BOOK_READER_PROCESSING_BUDGET_MS, 40_000),
    },
  },
};
