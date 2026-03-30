import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Heart,
  PenSquare,
  ScrollText,
  Send,
  Share2,
} from 'lucide-react';
import api from '../utils/api';
import { getStoredUser } from '../utils/auth';
import { getFallbackBookById } from '../utils/bookFallback';
import BookCoverArt from '../components/books/BookCoverArt';
import './BookThread.css';

const initialThreadForm = { title: '', chapterReference: '', content: '' };
const MAX_VISUAL_REPLY_DEPTH = 3;
const COLLAPSE_REPLY_DEPTH = 4;

const SORT_OPTIONS = [
  { id: 'new', label: 'Newest notes' },
  { id: 'hot', label: 'Recently stirred' },
  { id: 'top', label: 'Most echoed' },
];

const formatCalendarDate = (value) => new Date(value).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const formatRelativeTime = (value) => {
  const timestamp = new Date(value).getTime();
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < hour) {
    return `${Math.max(1, Math.round(diff / minute))}m ago`;
  }

  if (diff < day) {
    return `${Math.round(diff / hour)}h ago`;
  }

  if (diff < week) {
    return `${Math.round(diff / day)}d ago`;
  }

  return formatCalendarDate(value);
};

const countReplies = (comments = []) => comments.reduce(
  (sum, comment) => sum + 1 + countReplies(comment.replies || []),
  0,
);

const getChapterReferenceLabel = (value) => value?.trim() || 'Whole book';

const getHeartCount = (count = 0) => (count > 0 ? count : null);

const hasHeartFromActor = (likedBy, actorId) => (
  Boolean(actorId && Array.isArray(likedBy) && likedBy.some((value) => String(value) === String(actorId)))
);

const getExcerpt = (text = '', maxLength = 260) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
};

const getThreadCountLabel = (count) => (count === 1 ? '1 discussion piece' : `${count} discussion pieces`);
const getResponseCountLabel = (count) => (count === 1 ? '1 response' : `${count} responses`);
const getContributionCountLabel = (count) => (count === 1 ? '1 contribution' : `${count} contributions`);

const renderRichText = (text) => text
  .split(/\n{2,}/)
  .map((paragraph) => paragraph.trim())
  .filter(Boolean)
  .map((paragraph, index) => (
    <p key={`${paragraph.slice(0, 20)}-${index}`}>{paragraph}</p>
  ));

const ReplyTree = ({
  comments,
  depth = 0,
  threadId,
  actorId,
  replyingTo,
  replyDrafts,
  pendingReplyKey,
  collapsedBranches,
  onToggleReply,
  onToggleBranch,
  onReplyDraftChange,
  onSubmitReply,
  onLikeComment,
}) => (
  <>
    {comments.map((comment) => {
      const replyKey = `comment-${comment._id}`;
      const isReplying = replyingTo === replyKey;
      const replyCount = countReplies(comment.replies || []);
      const visualDepth = Math.min(depth, MAX_VISUAL_REPLY_DEPTH);
      const hasReplies = (comment.replies || []).length > 0;
      const canCollapseBranch = depth >= COLLAPSE_REPLY_DEPTH && hasReplies;
      const isBranchCollapsed = canCollapseBranch ? collapsedBranches[comment._id] !== false : false;
      const heartCount = getHeartCount(comment.likes || 0);
      const isHearted = hasHeartFromActor(comment.likedBy, actorId);

      return (
        <article
          key={comment._id}
          className={`reply-node ${depth > 0 ? 'is-nested' : ''} ${depth > MAX_VISUAL_REPLY_DEPTH ? 'depth-capped' : ''}`}
          style={{ '--reply-depth': visualDepth }}
        >
          <div className="reply-main">
            <div className="reply-meta">
              <span className="reply-author">{comment.authorAnonId}</span>
              <span className="reply-dot" aria-hidden="true">/</span>
              <time dateTime={comment.createdAt} className="reply-time">
                {formatRelativeTime(comment.createdAt)}
              </time>
              {heartCount && (
                <>
                  <span className="reply-dot" aria-hidden="true">/</span>
                  <span className="reply-resonance resonance-pill" aria-label={`${heartCount} hearts`}>
                    <Heart size={14} aria-hidden="true" />
                    <span>{heartCount}</span>
                  </span>
                </>
              )}
            </div>

            <div className="reply-content">
              {renderRichText(comment.content)}
            </div>

            <div className="reply-actions">
              <button type="button" className="reply-action" onClick={() => onToggleReply(isReplying ? null : replyKey)}>
                Respond
              </button>
              <button
                type="button"
                className={`reply-action like-button ${isHearted ? 'is-liked' : ''}`}
                onClick={() => onLikeComment(threadId, comment._id)}
                aria-pressed={isHearted}
                title={isHearted ? 'Remove heart' : 'Send a heart'}
              >
                <Heart size={16} aria-hidden="true" fill={isHearted ? 'currentColor' : 'none'} />
                {comment.likes > 0 && <span className="like-count">{comment.likes}</span>}
              </button>
              {replyCount > 0 && <span className="reply-action-meta">{getResponseCountLabel(replyCount)} continue below</span>}
              {canCollapseBranch && (
                <button type="button" className="branch-toggle" onClick={() => onToggleBranch(comment._id)}>
                  {isBranchCollapsed ? `Open ${getResponseCountLabel(replyCount).toLowerCase()}` : 'Fold deeper exchange'}
                </button>
              )}
            </div>

            {isReplying && (
              <form
                className="inline-reply-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitReply(threadId, comment._id);
                }}
              >
                <div className="writing-surface-copy">
                  <span className="writing-label">Response</span>
                  <p>Write as though you are adding a margin note for everyone still seated at the table.</p>
                </div>
                <textarea
                  className="thread-textarea compact"
                  rows={4}
                  value={replyDrafts[replyKey] || ''}
                  onChange={(event) => onReplyDraftChange(replyKey, event.target.value)}
                  placeholder={`Reply to ${comment.authorAnonId} with a considered reading...`}
                />
                <div className="inline-reply-actions">
                  <button type="button" className="text-button" onClick={() => onToggleReply(null)}>
                    Close
                  </button>
                  <button type="submit" className="thread-cta" disabled={pendingReplyKey === replyKey}>
                    <Send size={15} />
                    {pendingReplyKey === replyKey ? 'Placing response...' : 'Place response'}
                  </button>
                </div>
              </form>
            )}

            {hasReplies && !isBranchCollapsed && (
              <div className="reply-children">
                <ReplyTree
                  comments={comment.replies}
                  depth={depth + 1}
                  threadId={threadId}
                  actorId={actorId}
                  replyingTo={replyingTo}
                  replyDrafts={replyDrafts}
                  pendingReplyKey={pendingReplyKey}
                  collapsedBranches={collapsedBranches}
                  onToggleReply={onToggleReply}
                  onToggleBranch={onToggleBranch}
                  onReplyDraftChange={onReplyDraftChange}
                  onSubmitReply={onSubmitReply}
                  onLikeComment={onLikeComment}
                />
              </div>
            )}
          </div>
        </article>
      );
    })}
  </>
);

export default function BookThread() {
  const { bookId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const actorId = useMemo(() => {
    const stored = getStoredUser();
    return stored?._id ? String(stored._id) : null;
  }, []);
  const [book, setBook] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('new');
  const [showComposer, setShowComposer] = useState(false);
  const [threadForm, setThreadForm] = useState(initialThreadForm);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyDrafts, setReplyDrafts] = useState({});
  const [submittingThread, setSubmittingThread] = useState(false);
  const [pendingReplyKey, setPendingReplyKey] = useState(null);
  const [collapsedBranches, setCollapsedBranches] = useState({});
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');

      const [bookResult, threadsResult] = await Promise.allSettled([
        api.get(`/books/${bookId}`),
        api.get(`/threads/${bookId}?sort=${activeTab}`),
      ]);

      if (bookResult.status === 'fulfilled') {
        setBook(bookResult.value.data);
      } else {
        console.error('Failed to fetch book, using local fallback:', bookResult.reason);
        setBook(getFallbackBookById(bookId));
      }

      if (threadsResult.status === 'fulfilled') {
        setThreads(threadsResult.value.data);
      } else {
        const status = threadsResult.reason?.response?.status;
        if (status === 401 || status === 403) {
          navigate(`/quiz/${encodeURIComponent(bookId)}`, { replace: true, state: { from: `/thread/${bookId}` } });
          return;
        }

        console.error('Failed to fetch thread data:', threadsResult.reason);
        setThreads([]);
        setError('The discussion room is unavailable right now.');
      }

      setLoading(false);
    };

    fetchData();
  }, [bookId, activeTab, navigate]);

  useEffect(() => {
    if (location.state?.notice) {
      setFeedback(location.state.notice);
    }
  }, [location.state]);

  useEffect(() => {
    const hashThreadId = location.hash.replace('#', '');
    if (!hashThreadId) {
      return;
    }

    const matchingThread = threads.find((thread) => thread._id === hashThreadId);
    if (matchingThread) {
      setSelectedThreadId(hashThreadId);
    }
  }, [location.hash, threads]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread._id === selectedThreadId) || null,
    [threads, selectedThreadId],
  );

  const selectedThreadReplyCount = countReplies(selectedThread?.comments || []);
  const selectedThreadHearts = getHeartCount(selectedThread?.likes || 0);
  const selectedThreadIsHearted = hasHeartFromActor(selectedThread?.likedBy, actorId);

  const setThreadInState = (updatedThread) => {
    setThreads((prev) => prev.map((thread) => (thread._id === updatedThread._id ? updatedThread : thread)));
  };

  const updateHash = (threadId) => {
    const nextUrl = threadId ? `${window.location.pathname}#${threadId}` : window.location.pathname;
    window.history.replaceState(null, '', nextUrl);
  };

  const handleOpenThread = (threadId) => {
    setSelectedThreadId(threadId);
    setShowComposer(false);
    setReplyingTo(null);
    setCollapsedBranches({});
    setFeedback('');
    setError('');
    updateHash(threadId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCloseThread = () => {
    setSelectedThreadId(null);
    setReplyingTo(null);
    setCollapsedBranches({});
    setFeedback('');
    setError('');
    updateHash('');
  };

  const handleThreadFieldChange = (event) => {
    const { name, value } = event.target;
    setThreadForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleReplyDraftChange = (key, value) => {
    setReplyDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleBranch = (commentId) => {
    setCollapsedBranches((prev) => ({
      ...prev,
      [commentId]: prev[commentId] === false,
    }));
  };

  const handleCreateThread = async (event) => {
    event.preventDefault();
    setError('');
    setFeedback('');
    setSubmittingThread(true);

    try {
      const { data } = await api.post('/threads', {
        bookId: book._id || book.id,
        title: threadForm.title,
        chapterReference: threadForm.chapterReference,
        content: threadForm.content,
      });

      setThreads((prev) => [data, ...prev]);
      setThreadForm(initialThreadForm);
      setShowComposer(false);
      setSelectedThreadId(data._id);
      setFeedback('Your discussion note has been placed into the room.');
      updateHash(data._id);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to publish this discussion right now.');
    } finally {
      setSubmittingThread(false);
    }
  };

  const handleSubmitReply = async (threadId, parentId = null) => {
    const replyKey = parentId ? `comment-${parentId}` : `thread-${threadId}`;
    const content = replyDrafts[replyKey]?.trim();

    if (!content) {
      return;
    }

    setError('');
    setFeedback('');
    setPendingReplyKey(replyKey);

    try {
      const { data } = await api.post(`/threads/${threadId}/comments`, {
        content,
        parentId,
      });

      setThreadInState(data);
      setReplyDrafts((prev) => ({ ...prev, [replyKey]: '' }));
      setReplyingTo(null);
      setFeedback(parentId ? 'Your response has been added.' : 'Your note has joined the discussion.');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to post your response right now.');
    } finally {
      setPendingReplyKey(null);
    }
  };

  const handleLikeThread = async (threadId) => {
    try {
      const { data } = await api.post(`/threads/${threadId}/like`);
      setThreadInState(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to heart this thread right now.');
    }
  };

  const handleLikeComment = async (threadId, commentId) => {
    try {
      const { data } = await api.post(`/threads/${threadId}/comments/${commentId}/like`);
      setThreadInState(data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to heart this response right now.');
    }
  };

  const handleShareThread = async (threadId) => {
    const shareUrl = `${window.location.origin}/thread/${bookId}#${threadId}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setFeedback('A direct link to this discussion has been copied.');
    } catch {
      setFeedback('Copy failed. You can copy the page URL manually.');
    }
  };

  if (loading) {
    return <div className="p-10 text-center mt-20">Preparing the discussion room...</div>;
  }

  if (!book) {
    return <div className="p-10 text-center mt-20">Book not found in the archives.</div>;
  }

  return (
    <div className={`thread-page animate-fade-in ${selectedThread ? 'focus-mode' : 'list-mode'}`}>
      <div className="thread-shell">
        {!selectedThread ? (
          <>
            <header className="salon-header">
                <div className="salon-book-anchor">
                  <div className="salon-book-cover" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
                  <BookCoverArt
                    book={book}
                    imgClassName="salon-book-image"
                    fallbackClassName="salon-book-fallback"
                    showSpine
                    showPattern={false}
                    spineClassName="salon-book-spine"
                  />
                  </div>

                <div className="salon-copy">
                  <div className="salon-kicker-row">
                    <span className="salon-kicker">A literary salon for one book</span>
                    <span className="salon-divider" aria-hidden="true" />
                    <span className="salon-room-label">{book.author}</span>
                  </div>
                  <h1 className="thread-title font-serif">{book.title}</h1>
                  <p className="salon-subtitle">
                    A slow room for readers who have reached the end and want to sit with what the book opened:
                    its tensions, symbols, arguments, and aftertaste.
                  </p>
                  <div className="salon-meta">
                    <span>{getThreadCountLabel(threads.length)}</span>
                    <span className="reply-dot" aria-hidden="true">/</span>
                    <span>Single-column reading view</span>
                    <span className="reply-dot" aria-hidden="true">/</span>
                    <span>Chapter anchors when needed</span>
                  </div>
                </div>
              </div>

              <div className="salon-preface">
                <div className="salon-preface-rule" aria-hidden="true" />
                <p>
                  Browse the room as you would a stack of short essays. Each thread begins with an opening thought,
                  and each response is meant to extend the reading rather than chase attention.
                </p>
              </div>

              <div className="nexus-toolbar" role="toolbar" aria-label="Discussion controls">
                <div className="feed-filters" aria-label="Sort discussions">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`filter-btn ${activeTab === option.id ? 'active' : ''}`}
                      onClick={() => setActiveTab(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <button type="button" className="thread-cta" onClick={() => setShowComposer((prev) => !prev)}>
                  <PenSquare size={16} />
                  {showComposer ? 'Close writing desk' : 'Open writing desk'}
                </button>
              </div>
            </header>

            {showComposer && (
              <form className="composer-surface" onSubmit={handleCreateThread}>
                <div className="composer-copy">
                  <span className="writing-label">New discussion</span>
                  <h2 className="font-serif">Introduce an idea the room can return to.</h2>
                  <p>
                    Write as if you are placing a short opening essay on the table: specific, rooted in the book,
                    and generous enough for other readers to enter.
                  </p>
                </div>

                <label className="writing-field">
                  <span>Thread title</span>
                  <input
                    name="title"
                    value={threadForm.title}
                    onChange={handleThreadFieldChange}
                    className="thread-input"
                    placeholder="Name the question, image, conflict, or feeling you want to open"
                    maxLength={100}
                    required
                  />
                </label>

                <label className="writing-field">
                  <span>Book anchor</span>
                  <input
                    name="chapterReference"
                    value={threadForm.chapterReference}
                    onChange={handleThreadFieldChange}
                    className="thread-input"
                    placeholder="Optional: Chapter 7, final pages, opening scene..."
                    maxLength={80}
                  />
                </label>

                <label className="writing-field">
                  <span>Opening discussion</span>
                  <textarea
                    name="content"
                    value={threadForm.content}
                    onChange={handleThreadFieldChange}
                    className="thread-textarea"
                    rows={9}
                    placeholder="Set out your reading, the passages or moments you are drawing from, and the conversation you hope this room will have."
                    required
                  />
                </label>

                <div className="composer-actions">
                  <span className="composer-count">{threadForm.content.length}/1000</span>
                  <button type="submit" className="thread-cta" disabled={submittingThread}>
                    {submittingThread ? 'Placing note...' : 'Place discussion in room'}
                  </button>
                </div>
              </form>
            )}

            {(error || feedback) && (
              <div className={`thread-banner ${error ? 'error' : 'success'}`}>
                {error || feedback}
              </div>
            )}

            <section className="thread-journal-header" aria-labelledby="thread-list-heading">
              <div>
                <span className="writing-label">Open conversations</span>
                <h2 id="thread-list-heading" className="font-serif">Threads read like entries in a shared journal.</h2>
              </div>
              <p>
                Titles, chapter anchors, and opening paragraphs do the work of orientation. Counts stay quiet and secondary.
              </p>
            </section>

            <section className="thread-list-surface" aria-live="polite">
              {threads.length > 0 ? threads.map((thread) => {
                const responseCount = countReplies(thread.comments || []);
                const heartCount = getHeartCount(thread.likes || 0);

                return (
                  <article key={thread._id} className="thread-list-item">
                    <button type="button" className="thread-list-button" onClick={() => handleOpenThread(thread._id)}>
                      <div className="thread-list-main">
                        <div className="thread-entry-context">
                          <span className="thread-entry-reference">{getChapterReferenceLabel(thread.chapterReference)}</span>
                          <span className="reply-dot" aria-hidden="true">/</span>
                          <span>{thread.authorAnonId}</span>
                          <span className="reply-dot" aria-hidden="true">/</span>
                          <span>{formatRelativeTime(thread.updatedAt || thread.createdAt)}</span>
                        </div>
                        <h3 className="thread-list-title font-serif">{thread.title}</h3>
                        <p className="thread-list-preview">{getExcerpt(thread.content)}</p>
                        <div className="thread-list-footer">
                          <span>{getResponseCountLabel(responseCount)}</span>
                          {heartCount && (
                            <>
                              <span className="reply-dot" aria-hidden="true">/</span>
                              <span className="reply-resonance resonance-pill" aria-label={`${heartCount} hearts`}>
                                <Heart size={14} aria-hidden="true" />
                                <span>{heartCount}</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </article>
                );
              }) : (
                <div className="empty-state">
                  <ScrollText size={22} />
                  <h3 className="font-serif">No discussion pieces yet.</h3>
                  <p>Open the first conversation about {book.title} and set the tone for the room.</p>
                </div>
              )}
            </section>
          </>
        ) : (
          <>
            <header className="thread-focus-header">
              <button type="button" className="back-link button-reset" onClick={handleCloseThread}>
                <ArrowLeft size={16} /> Back to the room
              </button>
            </header>

            {(error || feedback) && (
              <div className={`thread-banner ${error ? 'error' : 'success'}`}>
                {error || feedback}
              </div>
            )}

            <section className="thread-book-context">
              <div className="thread-book-mini-cover" style={{ '--book-accent': book.coverColor || '#6f614d' }}>
                <BookCoverArt
                  book={book}
                  imgClassName="thread-book-mini-image"
                  fallbackClassName="thread-book-mini-fallback"
                  showSpine
                  showPattern={false}
                  spineClassName="thread-book-mini-spine"
                />
              </div>

              <div className="thread-book-copy">
                <span className="salon-kicker">BookThread</span>
                <h2 className="font-serif">{book.title}</h2>
                <div className="thread-book-meta">
                  <BookOpen size={15} />
                  <span>{book.author}</span>
                  <span className="reply-dot" aria-hidden="true">/</span>
                  <span>{getChapterReferenceLabel(selectedThread.chapterReference)}</span>
                </div>
              </div>

              <div className="thread-book-aside">
                <span className="writing-label">Room note</span>
                <p>The book stays in view so every response remains answerable to the text.</p>
              </div>
            </section>

            <article className="thread-focus-post" id={selectedThread._id}>
              <div className="thread-focus-meta">
                <span className="thread-focus-author">{selectedThread.authorAnonId}</span>
                <span className="reply-dot" aria-hidden="true">/</span>
                <time dateTime={selectedThread.createdAt}>{formatCalendarDate(selectedThread.createdAt)}</time>
                <span className="reply-dot" aria-hidden="true">/</span>
                <span>{getResponseCountLabel(selectedThreadReplyCount)}</span>
                {selectedThreadHearts && (
                  <>
                    <span className="reply-dot" aria-hidden="true">/</span>
                    <span className="reply-resonance resonance-pill" aria-label={`${selectedThreadHearts} hearts`}>
                      <Heart size={14} aria-hidden="true" />
                      <span>{selectedThreadHearts}</span>
                    </span>
                  </>
                )}
              </div>

              <h1 className="thread-focus-title font-serif">{selectedThread.title}</h1>

              <div className="thread-focus-content">
                {renderRichText(selectedThread.content)}
              </div>

              <div className="thread-focus-actions">
                <button
                  type="button"
                  className={`reply-action like-button ${selectedThreadIsHearted ? 'is-liked' : ''}`}
                  onClick={() => handleLikeThread(selectedThread._id)}
                  aria-pressed={selectedThreadIsHearted}
                  title={selectedThreadIsHearted ? 'Remove heart' : 'Send a heart'}
                >
                  <Heart size={16} aria-hidden="true" fill={selectedThreadIsHearted ? 'currentColor' : 'none'} />
                  {selectedThread.likes > 0 && <span className="like-count">{selectedThread.likes}</span>}
                </button>
                <button
                  type="button"
                  className="reply-action"
                  onClick={() => setReplyingTo((current) => (
                    current === `thread-${selectedThread._id}` ? null : `thread-${selectedThread._id}`
                  ))}
                >
                  Add response
                </button>
                <button type="button" className="reply-action" onClick={() => handleShareThread(selectedThread._id)}>
                  <Share2 size={15} /> Share link
                </button>
              </div>
            </article>

            {replyingTo === `thread-${selectedThread._id}` && (
              <form
                className="inline-reply-form top-level"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSubmitReply(selectedThread._id);
                }}
              >
                <div className="writing-surface-copy">
                  <span className="writing-label">Your response</span>
                  <h2 className="font-serif">Write a contribution, not a reaction.</h2>
                  <p>Bring in a passage, an interpretation, or a feeling that belongs at the table with other readers.</p>
                </div>
                <textarea
                  className="thread-textarea compact"
                  rows={6}
                  value={replyDrafts[`thread-${selectedThread._id}`] || ''}
                  onChange={(event) => handleReplyDraftChange(`thread-${selectedThread._id}`, event.target.value)}
                  placeholder="Add your perspective to the discussion..."
                />
                <div className="inline-reply-actions">
                  <button type="button" className="text-button" onClick={() => setReplyingTo(null)}>
                    Close
                  </button>
                  <button
                    type="submit"
                    className="thread-cta"
                    disabled={pendingReplyKey === `thread-${selectedThread._id}`}
                  >
                    <Send size={15} />
                    {pendingReplyKey === `thread-${selectedThread._id}` ? 'Placing response...' : 'Place response'}
                  </button>
                </div>
              </form>
            )}

            <section className="thread-replies">
              <div className="thread-replies-heading">
                <div>
                  <span className="writing-label">Responses</span>
                  <h2 className="font-serif">Readers answer with their own considered readings.</h2>
                </div>
                <span>{getContributionCountLabel(selectedThreadReplyCount)} in this exchange</span>
              </div>

              {(selectedThread.comments || []).length > 0 ? (
                <ReplyTree
                  comments={selectedThread.comments}
                  threadId={selectedThread._id}
                  actorId={actorId}
                  replyingTo={replyingTo}
                  replyDrafts={replyDrafts}
                  pendingReplyKey={pendingReplyKey}
                  collapsedBranches={collapsedBranches}
                  onToggleReply={setReplyingTo}
                  onToggleBranch={handleToggleBranch}
                  onReplyDraftChange={handleReplyDraftChange}
                  onSubmitReply={handleSubmitReply}
                  onLikeComment={handleLikeComment}
                />
              ) : (
                <div className="empty-replies">
                  <ScrollText size={22} />
                  <h3 className="font-serif">No responses yet.</h3>
                  <p>Be the first reader to answer this idea with care.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
