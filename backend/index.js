import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { connectDB, getLastDbError, isDbConnected } from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import bookRoutes from './routes/bookRoutes.js';
import threadRoutes from './routes/threadRoutes.js';
import recommenderRoutes from './routes/recommenderRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import registerSocketEvents from './socket/socketHandler.js';
import { Book } from './models/Book.js';
import { defaultBooks } from './seed/defaultBooks.js';
import accessRoutes from './routes/accessRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import { buildSessionRoutes } from './routes/sessionRoutes.js';
import { buildMatchmakingRoutes } from './routes/matchmakingRoutes.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { rateLimit } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import { isProd } from './utils/runtime.js';
import { RealtimeSessionManager } from './services/realtimeSessionManager.js';
import { requestTracing } from './middleware/requestLogging.js';
import { gutenbergIngestionService } from './services/gutenbergIngestionService.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', isProd() ? 1 : 0);

const httpServer = createServer(app);

process.on('unhandledRejection', (reason) => {
  console.error('[SERVER] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught exception:', error);
  process.exit(1);
});

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      const allowList = new Set([
        process.env.CLIENT_URL,
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ].filter(Boolean));

      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowList.has(origin)) {
        callback(null, true);
        return;
      }

      try {
        const parsed = new URL(origin);
        const hostname = parsed.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isPrivateLan = hostname.startsWith('192.168.')
          || hostname.startsWith('10.')
          || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname);

        if ((isLocalhost || isPrivateLan) && parsed.port === '5173') {
          callback(null, true);
          return;
        }
      } catch {
        // Fallthrough to reject.
      }

      callback(new Error(`Socket origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST']
  }
});

const buildCorsOriginValidator = () => {
  const allowList = new Set([
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ].filter(Boolean));

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowList.has(origin)) {
      callback(null, true);
      return;
    }

    if (!isProd()) {
      try {
        const parsed = new URL(origin);
        const hostname = parsed.hostname;
        const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isPrivateLan = hostname.startsWith('192.168.')
          || hostname.startsWith('10.')
          || /^172\\.(1[6-9]|2\\d|3[0-1])\\./.test(hostname);

        if ((isLocalhost || isPrivateLan) && parsed.port === '5173') {
          callback(null, true);
          return;
        }
      } catch {
        // ignore parse errors
      }
    }

    callback(new Error('Origin not allowed by CORS.'));
  };
};

app.use(cors({
  origin: buildCorsOriginValidator(),
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Book-Action-Id', 'X-Book-Action-Name'],
  exposedHeaders: ['Retry-After', 'X-Request-Id'],
  maxAge: 600,
}));
app.use(securityHeaders);
app.use(requestTracing);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));

// Baseline abuse protection for all endpoints.
app.use(rateLimit({ windowMs: 15 * 60_000, max: 100 }));
// Tighten common abuse targets.
app.use('/api/users/login', rateLimit({ windowMs: 60_000, max: 20 }));
app.use('/api/users/signup', rateLimit({ windowMs: 60_000, max: 15 }));
app.use('/api/users/anonymous', rateLimit({ windowMs: 60_000, max: 40 }));
app.use('/api/quiz', rateLimit({ windowMs: 60_000, max: 60 }));
app.use('/api/access', rateLimit({ windowMs: 60_000, max: 90 }));

const sessionManager = new RealtimeSessionManager(io);
// Register Socket Events
registerSocketEvents(io, sessionManager);

// Routes
app.use('/api/users', userRoutes);
app.use('/api/books', bookRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/recommender', recommenderRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/session', buildSessionRoutes(sessionManager));
app.use('/api/matchmaking', buildMatchmakingRoutes(sessionManager));

app.get('/api/health', (req, res) => {
  const connected = isDbConnected();
  res.status(connected ? 200 : 503).json({
    status: connected ? 'ok' : 'degraded',
    message: connected ? 'Nexus Core Online' : 'Nexus Core running without database connectivity',
    database: {
      connected,
      error: connected ? null : (getLastDbError()?.message || 'Database unavailable'),
    },
  });
});

app.get('/api/warmup', async (req, res) => {
  try {
    await Book.findOne({}).select('_id').lean();
    res.json({ status: 'ok', warmed: true, retryAfter: 0 });
  } catch (error) {
    console.error('[WARMUP] Warmup probe failed:', error?.message || error, { requestId: req.requestId });
    res.status(503).json({ status: 'loading', warmed: false, retryAfter: 2 });
  }
});

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

httpServer.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[SERVER] Port ${PORT} is already in use. Is the server already running?`);
    process.exit(1);
  }

  console.error('[SERVER] Fatal error:', error);
  process.exit(1);
});

const seedBooksIfEmpty = async () => {
  if (process.env.DISABLE_STARTUP_SEED === 'true') {
    return;
  }

  if (!defaultBooks.length) {
    return;
  }

  try {
    const existingIds = await Book.distinct('gutenbergId');

    const existingGutenbergIds = new Set(
      existingIds.filter((id) => Number.isFinite(id) && id > 0)
    );
    const missingBooks = defaultBooks.filter((book) => {
      const gutenbergId = Number(book.gutenbergId);
      return Number.isFinite(gutenbergId) && !existingGutenbergIds.has(gutenbergId);
    });

    if (!missingBooks.length) {
      return;
    }

    await Book.insertMany(missingBooks, { ordered: false });
    console.log(`[SEED] Inserted ${missingBooks.length} missing starter books.`);

  } catch (error) {
    console.error('[SEED] Failed to seed books:', error);
  }
};

try {
  await connectDB();
  await seedBooksIfEmpty();
  await gutenbergIngestionService.enqueuePendingBooks();
} catch (error) {
  console.warn('[SERVER] Starting in degraded mode without database:', error?.message || error);
}

httpServer.listen(PORT, () => {
  if (isProd()) {
    const jwtSecret = String(process.env.JWT_SECRET || '').trim();
    if (!jwtSecret || jwtSecret === 'change_me_in_production') {
      console.error('[SERVER] Refusing to start in production with an unsafe JWT_SECRET.');
      process.exit(1);
    }
  }

  console.log(`[SERVER] Nexus core listening on port ${PORT}`);
});
