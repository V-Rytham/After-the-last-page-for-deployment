export const isProd = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

export const buildSafeErrorBody = (message, error) => {
  const body = { message };
  if (!isProd() && error) {
    body.error = error?.message || String(error);
  }
  return body;
};

