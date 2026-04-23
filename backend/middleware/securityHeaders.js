const getCsp = () => {
  const defaultConnect = ["'self'", 'https:', 'wss:'];
  if (process.env.NODE_ENV !== 'production') {
    defaultConnect.push('http://localhost:5173', 'ws://localhost:5173', 'http://127.0.0.1:5173', 'ws://127.0.0.1:5173');
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "font-src 'self' data: https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173 http://127.0.0.1:5173",
    `connect-src ${defaultConnect.join(' ')}`,
    "frame-ancestors 'none'",
  ].join('; ');
};

export const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', getCsp());
  // Meet voice/video requires camera + microphone on our own origin.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
};
