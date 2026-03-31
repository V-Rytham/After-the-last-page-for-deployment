export const parsePositiveIntStrict = (value) => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) {
      return null;
    }

    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  if (!value || value.trim() !== value || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

export const parseRouteGutenbergIdStrict = (value) => {
  if (typeof value !== 'string' || !value || value.trim() !== value) {
    return null;
  }

  const match = value.match(/^g?(\d+)$/i);
  if (!match) {
    return null;
  }

  return parsePositiveIntStrict(match[1]);
};
