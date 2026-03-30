# BookFriend Agent Integration

## New Service: `bookfriend-server/`

BookFriend runs as an independent Node/Express service so AI orchestration and retrieval logic stay outside the core app server.

```
bookfriend-server/
  config/db.js
  controllers/agentController.js
  models/Book.js
  prompts/systemPrompt.js
  retrieval/bookRepository.js
  retrieval/retrievalService.js
  routes/agentRoutes.js
  services/llmService.js
  services/promptService.js
  services/sessionStore.js
  utils/text.js
  server.js
```

## Session and Memory Policy

- Sessions are kept in an in-memory `Map` keyed by `session_id`.
- During chat, message history is stored temporarily as `{ role, content, timestamp }`.
- `POST /agent/end` immediately deletes the whole session from memory.
- No persistent conversation logging is implemented.

## Retrieval Strategy (RAG with local vector index)

Current retrieval is vector-based and local-first:

1. Load book metadata + chapters from MongoDB.
2. Convert chapter HTML into plain text chunks.
3. Build deterministic hashed embeddings for each chunk.
4. Store chunk vectors in an in-memory vector index cache per book.
5. Embed the user query with the same embedding function.
6. Rank chunks with cosine similarity and inject top chunks into the prompt payload.

This keeps infrastructure free (no hosted vector DB required) while preserving a pluggable retrieval layer.

## API (BookFriend server)

### `POST /agent/start`
Body:
```json
{ "user_id": "...", "book_id": "..." }
```
Response:
```json
{ "session_id": "..." }
```

### `POST /agent/message`
Body:
```json
{ "session_id": "...", "message": "...", "chapter_progress": 4 }
```
Response:
```json
{ "response": "..." }
```

### `POST /agent/end`
Body:
```json
{ "session_id": "..." }
```
Response:
```json
{ "message": "Session deleted." }
```

## Main server proxy API

The main backend now exposes authenticated proxy endpoints:

- `POST /api/agent/start`
- `POST /api/agent/message`
- `POST /api/agent/end`

The frontend only talks to these existing backend endpoints; the core server forwards requests to `BOOKFRIEND_SERVER_URL`.

## Meet flow update

In the Meet page:

- User starts matchmaking as usual.
- After 30 seconds with no match, UI offers **Talk to BookFriend**.
- Clicking it starts a text-only BookFriend chat.
- Ending chat calls `/api/agent/end` to delete memory immediately.

## Environment Variables

### Main server (`backend/.env`)
- `BOOKFRIEND_SERVER_URL` (default: `http://127.0.0.1:5050`)

### BookFriend server (`bookfriend-server/.env`)
- `PORT` (default: `5050`)
- `MONGODB_URI`
- `BOOKFRIEND_LLM_PROVIDER` (`mock`, `ollama`, `groq`, or `openai`)
- `BOOKFRIEND_GROQ_MODEL` (when Groq is used)
- `GROQ_API_KEY` (when Groq is used)
- `BOOKFRIEND_OPENAI_MODEL` (when OpenAI is used)
- `OPENAI_API_KEY` (when OpenAI is used)
- `BOOKFRIEND_OLLAMA_URL` (when Ollama is used)
- `BOOKFRIEND_OLLAMA_MODEL` (when Ollama is used)
- `BOOKFRIEND_MAX_HISTORY`
- `BOOKFRIEND_RETRIEVAL_LIMIT`
- `BOOKFRIEND_EMBEDDING_DIM`

## Local run

```bash
npm install
npm --prefix server install
npm --prefix bookfriend-server install
npm run dev:all
```

Or run each service separately with:

```bash
npm run server
npm run bookfriend
npm run dev -- --host
```
