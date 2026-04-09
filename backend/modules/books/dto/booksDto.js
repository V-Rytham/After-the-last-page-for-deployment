const asTrimmedString = (value) => String(value ?? '').trim();

const asOptionalPositiveInt = (value, fallback = null) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : fallback;
};

export const buildReaderOptionsDto = ({ query, backendTimeoutMs, defaultProcessingBudgetMs }) => ({
  cursor: asOptionalPositiveInt(query?.cursor, 0),
  maxChapters: asOptionalPositiveInt(query?.maxChapters, null),
  processingBudgetMs: asOptionalPositiveInt(query?.processingBudgetMs, defaultProcessingBudgetMs),
  timeoutMs: backendTimeoutMs,
});

export const buildSearchBooksDto = ({ query }) => ({
  q: asTrimmedString(query?.q).toLowerCase(),
});

export const buildReadBookBySourceDto = ({ query }) => {
  const source = asTrimmedString(query?.source).toLowerCase();
  const id = asTrimmedString(query?.id);
  return { source, id };
};

export const validateRequired = (value, message) => {
  if (!value) {
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }
};
