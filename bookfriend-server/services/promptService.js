import { BOOKFRIEND_SYSTEM_PROMPT } from '../prompts/systemPrompt.js';

const buildRecentHistory = (messages, maxHistory) => {
  const safeMessages = Array.isArray(messages) ? messages : [];
  return safeMessages.slice(-maxHistory);
};

export const buildBookFriendPrompt = ({ book, retrievedChunks, sessionMessages, userMessage, maxHistory }) => {
  const bookMeta = {
    title: book?.title || 'Unknown title',
    author: book?.author || 'Unknown author',
    tags: book?.tags || [],
    synopsis: book?.synopsis || '',
    gutenbergId: book?.gutenbergId || null,
  };

  return {
    systemPrompt: BOOKFRIEND_SYSTEM_PROMPT,
    bookMeta,
    retrievedChunks,
    history: buildRecentHistory(sessionMessages, maxHistory),
    userMessage,
  };
};
