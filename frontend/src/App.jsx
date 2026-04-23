import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import SessionNavigationGuard from './components/session/SessionNavigationGuard';
import { SocketProvider } from './context/SocketContext';
import api from './utils/api';
import { getStoredUser, saveAuthSession } from './utils/auth';
import { DEFAULT_UI_THEME, THEME_STORAGE_KEY, UI_THEMES } from './utils/uiThemes';
import { applyThemeTokens } from './styles/theme';
import FirstChapterExperience from './components/onboarding/FirstChapterExperience';
import './index.css';

const VALID_THEMES = UI_THEMES.map((theme) => theme.id);

const LandingPage = lazy(() => import('./pages/LandingPage'));
const MeetingAccessHub = lazy(() => import('./pages/MeetingAccessHub'));
const ReadingRoom = lazy(() => import('./pages/ReadingRoom'));
const MeetingHub = lazy(() => import('./pages/MeetingHub'));
const BookThread = lazy(() => import('./pages/BookThread'));
const ThreadAccessHub = lazy(() => import('./pages/ThreadAccessHub'));
const WizardMerch = lazy(() => import('./pages/WizardMerch'));
const BookQuiz = lazy(() => import('./pages/BookQuiz'));
const RequestBookPage = lazy(() => import('./pages/RequestBookPage'));

let isFetchingUser = false;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const shouldRetry = (error) => {
  const status = Number(error?.statusCode || error?.response?.status || 0);
  if (status === 429) return true;
  if (status >= 500) return true;
  return !status;
};

const getRetryDelayMs = (error, attempt) => {
  const retryAfterHeader = error?.response?.headers?.['retry-after'];
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.round(retryAfter * 1000);
  }

  const baseMs = 600;
  return Math.min(8000, baseMs * (2 ** attempt));
};

const retry = async (fn, retries = 3, attempt = 0) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0 || !shouldRetry(error)) {
      throw error;
    }

    await sleep(getRetryDelayMs(error, attempt));
    return retry(fn, retries - 1, attempt + 1);
  }
};

const createAnonymousUserWithRetry = async () => {
  const { data } = await retry(() => api.post('/users/anonymous'), 3);
  return data;
};

const AppShell = ({ currentUser, uiTheme, onThemeChange }) => {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith('/read/');

  return (
    <div className="app-container">
      <SessionNavigationGuard />
      {!hideNavbar && (
        <Navbar currentUser={currentUser} uiTheme={uiTheme} onThemeChange={onThemeChange} />
      )}
      <main className="main-content">
        <Suspense fallback={<div className="content-container"><p className="text-muted">Loading…</p></div>}>
          <Routes>
            <Route path="/" element={<LandingPage currentUser={currentUser} />} />
            <Route path="/meet" element={<MeetingAccessHub currentUser={currentUser} />} />
            <Route path="/threads" element={<ThreadAccessHub currentUser={currentUser} />} />
            <Route path="/request-book" element={<RequestBookPage />} />
            <Route path="/read" element={<Navigate to="/request-book" replace />} />
            <Route path="/read/gutenberg/:gutenbergId" element={<ReadingRoom uiTheme={uiTheme} onThemeChange={onThemeChange} />} />
            <Route path="/read/:bookId" element={<ReadingRoom uiTheme={uiTheme} onThemeChange={onThemeChange} />} />
            <Route path="/quiz/:bookId" element={<BookQuiz />} />
            <Route path="/meet/:bookId" element={<MeetingHub />} />
            <Route path="/thread/:bookId" element={<BookThread />} />
            <Route path="/merch" element={<WizardMerch />} />
            <Route path="/desk" element={<Navigate to="/" replace />} />
            <Route path="/library" element={<Navigate to="/" replace />} />
            <Route path="/profile" element={<Navigate to="/" replace />} />
            <Route path="/auth" element={<Navigate to="/" replace />} />
            <Route path="/settings" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <FirstChapterExperience />
      </main>
    </div>
  );
};

const App = () => {
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const bootstrapStartedRef = useRef(false);
  const [uiTheme, setUiTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'midnight' || storedTheme === 'mocha') {
      return DEFAULT_UI_THEME;
    }

    return VALID_THEMES.includes(storedTheme) ? storedTheme : DEFAULT_UI_THEME;
  });

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        if (window.location.hash.startsWith('#/') && window.location.pathname !== '/') {
          window.history.replaceState(null, '', `/${window.location.hash}`);
          return;
        }

        if (!window.location.hash && window.location.pathname && window.location.pathname !== '/') {
          const search = window.location.search || '';
          const nextHash = `#${window.location.pathname}${search}`;
          window.history.replaceState(null, '', `/${nextHash}`);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (bootstrapStartedRef.current) {
      return;
    }

    bootstrapStartedRef.current = true;

    const bootstrapUser = async () => {
      if (isFetchingUser) {
        return;
      }

      isFetchingUser = true;

      try {
        const data = await createAnonymousUserWithRetry();
        const user = saveAuthSession(data);
        setCurrentUser(user);
      } catch (error) {
        console.error('[APP] Failed to bootstrap session:', error);
        setCurrentUser(null);
      } finally {
        isFetchingUser = false;
      }
    };

    bootstrapUser();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, uiTheme);
    applyThemeTokens(uiTheme);
  }, [uiTheme]);

  return (
    <SocketProvider currentUser={currentUser}>
      <Router>
        <AppShell
          currentUser={currentUser}
          uiTheme={uiTheme}
          onThemeChange={setUiTheme}
        />
      </Router>
    </SocketProvider>
  );
};

export default App;
