const getEmbeddingSize = () => {
  const parsed = Number.parseInt(process.env.BOOKFRIEND_EMBEDDING_DIM || '384', 10);
  return Number.isFinite(parsed) && parsed > 63 ? parsed : 384;
};

const hashToken = (token, size) => {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash) % size;
};

export const embedTokens = (tokens = []) => {
  const size = getEmbeddingSize();
  const vector = new Array(size).fill(0);

  for (const token of tokens) {
    const index = hashToken(token, size);
    vector[index] += 1;
  }

  return vector;
};

export const cosineSimilarity = (a = [], b = []) => {
  const limit = Math.min(a.length, b.length);
  if (!limit) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < limit; i += 1) {
    const va = a[i] || 0;
    const vb = b[i] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (!normA || !normB) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};
