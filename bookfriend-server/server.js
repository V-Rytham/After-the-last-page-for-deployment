import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { connectDB, getLastDbError, isDbConnected } from './config/db.js';
import { loadBookFriendEnv, resolveLlmProvider } from './config/env.js';
import agentRoutes from './routes/agentRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadBookFriendEnv();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' ? 1 : 0);

process.on('unhandledRejection', (reason) => {
  console.error('[BOOKFRIEND] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[BOOKFRIEND] Uncaught exception:', error);
  process.exit(1);
});

const isProd = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const corsOrigin = (origin, callback) => {
  const allowList = new Set([
    process.env.CLIENT_URL,
    process.env.BACKEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ].filter(Boolean));

  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowList.has(origin)) {
    callback(null, true);
    return;
  }

  if (!isProd()) {
    callback(null, true);
    return;
  }

  callback(new Error('Origin not allowed by CORS.'));
};

app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

// Minimal in-memory rate limit.
const rateStore = new Map();
app.use((req, res, next) => {
  const key = String(req.ip || 'unknown');
  const now = Date.now();
  const windowMs = 60_000;
  const max = 180;
  const entry = rateStore.get(key);

  if (!entry || now - entry.start > windowMs) {
    rateStore.set(key, { start: now, count: 1 });
    next();
    return;
  }

  entry.count += 1;
  if (entry.count > max) {
    res.status(429).json({ message: 'Too many requests. Please try again shortly.' });
    return;
  }

  next();
});

app.get('/health', (req, res) => {
  const { provider } = resolveLlmProvider();

  const modelByProvider = {
    groq: process.env.BOOKFRIEND_GROQ_MODEL || 'llama-3.1-8b-instant',
    mock: 'mock',
  };

  const dbConnected = isDbConnected();

  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    service: 'bookfriend-agent-server',
    llm_provider: provider,
    llm_model: modelByProvider[provider] || null,
    database: {
      connected: dbConnected,
      error: dbConnected ? null : (getLastDbError()?.message || 'Database unavailable'),
    },
  });
});

app.use('/agent', agentRoutes);

const port = process.env.PORT || 5050;

// Centralized error handling (keep responses safe in production).
app.use((err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Malformed JSON payload.' });
    return;
  }

  const status = Number(err?.statusCode || err?.status || 500);
  const safeStatus = Number.isFinite(status) && status >= 400 && status <= 599 ? status : 500;
  const body = { message: safeStatus >= 500 ? 'Server error.' : (err?.message || 'Request failed.') };
  if (!isProd() && err) {
    body.error = err?.message || String(err);
  }
  res.status(safeStatus).json(body);
});

try {
  await connectDB();
} catch (error) {
  console.warn('[BOOKFRIEND] Starting in degraded mode without database:', error.message);
}

const { provider } = resolveLlmProvider();

app.listen(port, () => {
  console.log(`[BOOKFRIEND] Agent server listening on ${port}`);
  console.log(`[BOOKFRIEND] LLM provider: ${provider}`);
});


