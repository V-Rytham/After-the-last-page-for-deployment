import crypto from 'node:crypto';
import { findBookForAgent } from '../retrieval/bookRepository.js';
import { retrieveRelevantChunks } from '../retrieval/retrievalService.js';
import { generateAgentReply } from '../services/llmService.js';
import { buildBookFriendPrompt } from '../services/promptService.js';
import { appendMessage, createSession, endSession, getSession } from '../services/sessionStore.js';

const getMaxHistory = () => {
  const parsed = Number.parseInt(process.env.BOOKFRIEND_MAX_HISTORY || '12', 10);
  return Number.isFinite(parsed) ? parsed : 12;
};

const getRetrievalLimit = () => {
  const parsed = Number.parseInt(process.env.BOOKFRIEND_RETRIEVAL_LIMIT || '4', 10);
  return Number.isFinite(parsed) ? parsed : 4;
};

export const startAgentSession = async (req, res) => {
  try {
    const { user_id: userId, book_id: bookId } = req.body || {};

    if (!userId || !bookId) {
      return res.status(400).json({ message: 'user_id and book_id are required.' });
    }

    const book = await findBookForAgent(bookId);
    if (!book) {
      return res.status(404).json({ message: 'Book not found for this session.' });
    }

    const sessionId = crypto.randomUUID();
    createSession({ sessionId, userId, bookId, book });

    res.status(201).json({ session_id: sessionId });
  } catch (error) {
    res.status(500).json({ message: 'Failed to start BookFriend session.', error: error.message });
  }
};

export const sendAgentMessage = async (req, res) => {
  try {
    const { session_id: sessionId, message, chapter_progress: chapterProgress } = req.body || {};

    if (!sessionId || !message) {
      return res.status(400).json({ message: 'session_id and message are required.' });
    }

    const session = getSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Session not found or expired.' });
    }

    appendMessage({ sessionId, role: 'user', content: String(message) });

    const retrievedChunks = retrieveRelevantChunks({
      book: session.book,
      userMessage: message,
      chapterProgress,
      limit: getRetrievalLimit(),
    });

    const promptPayload = buildBookFriendPrompt({
      book: session.book,
      retrievedChunks,
      sessionMessages: session.messages,
      userMessage: message,
      maxHistory: getMaxHistory(),
    });
    console.log("Inside agenController.js calling generate AgenReply method");

    const response = await generateAgentReply(promptPayload);
    appendMessage({ sessionId, role: 'assistant', content: response });

    res.json({ response });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate BookFriend response.', error: error.message });
  }
};

export const endAgentSession = async (req, res) => {
  const { session_id: sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ message: 'session_id is required.' });
  }

  const deleted = endSession(sessionId);

  if (!deleted) {
    return res.status(404).json({ message: 'Session not found.' });
  }

  return res.json({ message: 'Session deleted.' });
};
