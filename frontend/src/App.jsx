import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import SessionNavigationGuard from './components/session/SessionNavigationGuard';
import PrivateRoute from './components/auth/PrivateRoute';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import api from './utils/api';
import { clearAuthSession, getStoredToken, getStoredUser, saveAuthSession, updateStoredUser } from './utils/auth';
import { DEFAULT_UI_THEME, THEME_STORAGE_KEY, UI_THEMES } from './utils/uiThemes';
import { applyThemeTokens } from './styles/theme';
import FirstChapterExperience from './components/onboarding/FirstChapterExperience';
import './index.css';

const VALID_THEMES = UI_THEMES.map((theme) => theme.id);

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Library = lazy(() => import('./pages/Library'));
const BooksLibrary = lazy(() => import('./pages/BooksLibrary'));
const MeetingAccessHub = lazy(() => import('./pages/MeetingAccessHub'));
const ReadingRoom = lazy(() => import('./pages/ReadingRoom'));
const MeetingHub = lazy(() => import('./pages/MeetingHub'));
const BookThread = lazy(() => import('./pages/BookThread'));
const ThreadAccessHub = lazy(() => import('./pages/ThreadAccessHub'));
const WizardMerch = lazy(() => import('./pages/WizardMerch'));
const AuthPage = lazy(() => import('./pages/AuthPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BookQuiz = lazy(() => import('./pages/BookQuiz'));
const RequestBookPage = lazy(() => import('./pages/RequestBookPage'));
const GenreOnboardingPage = lazy(() => import('./pages/GenreOnboardingPage'));

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

const AppShell = ({ currentUser, onLogout, onUserUpdate, uiTheme, onThemeChange, onAuthSuccess }) => {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith('/read/');

  return (
    <div className="app-container">
      <SessionNavigationGuard />
      {!hideNavbar && (
        <Navbar currentUser={currentUser} onLogout={onLogout} uiTheme={uiTheme} onThemeChange={onThemeChange} />
      )}
      <main className="main-content">
        <Suspense fallback={<div className="content-container"><p className="text-muted">Loading…</p></div>}>
        <Routes>
          <Route path="/" element={<LandingPage currentUser={currentUser} />} />
          <Route path="/auth" element={<AuthPage currentUser={currentUser} onAuthSuccess={onAuthSuccess} />} />
          <Route path="/desk" element={<PrivateRoute><BooksLibrary currentUser={currentUser} /></PrivateRoute>} />
          <Route path="/library" element={<PrivateRoute><Library currentUser={currentUser} /></PrivateRoute>} />
          <Route path="/onboarding/genres" element={<PrivateRoute><GenreOnboardingPage onUserUpdate={onUserUpdate} /></PrivateRoute>} />
          <Route path="/books" element={<Navigate to="/desk" replace />} />
          <Route path="/request-book" element={<PrivateRoute><RequestBookPage /></PrivateRoute>} />
          <Route path="/read" element={<PrivateRoute><Navigate to="/request-book" replace /></PrivateRoute>} />
          <Route path="/meet" element={<MeetingAccessHub currentUser={currentUser} />} />
          <Route path="/threads" element={<ThreadAccessHub currentUser={currentUser} />} />
          <Route path="/profile" element={<PrivateRoute><ProfilePage currentUser={currentUser} onUserUpdate={onUserUpdate} /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute><SettingsPage uiTheme={uiTheme} onThemeChange={onThemeChange} currentUser={currentUser} onUserUpdate={onUserUpdate} /></PrivateRoute>} />
          <Route path="/read/gutenberg/:gutenbergId" element={<PrivateRoute><ReadingRoom uiTheme={uiTheme} onThemeChange={onThemeChange} /></PrivateRoute>} />
          <Route path="/read/:bookId" element={<PrivateRoute><ReadingRoom uiTheme={uiTheme} onThemeChange={onThemeChange} /></PrivateRoute>} />
          <Route path="/quiz/:bookId" element={<PrivateRoute><BookQuiz /></PrivateRoute>} />
          <Route path="/meet/:bookId" element={<PrivateRoute><MeetingHub /></PrivateRoute>} />
          <Route path="/thread/:bookId" element={<PrivateRoute><BookThread /></PrivateRoute>} />
          <Route path="/merch" element={<WizardMerch />} />
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
  const [authLoading, setAuthLoading] = useState(true);
  const [uiTheme, setUiTheme] = useState(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === 'midnight' || storedTheme === 'mocha') {
      return DEFAULT_UI_THEME;
    }

    return VALID_THEMES.includes(storedTheme) ? storedTheme : DEFAULT_UI_THEME;
  });

  useEffect(() => {
    // HashRouter should ignore pathname, but stray prefixes (e.g. "/$#/desk") confuse users and break
    // any code that reads `window.location.pathname`. Normalize once at startup.
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
      const token = getStoredToken();

      try {
        try {
          const { data } = await api.get('/auth/me');
          const user = saveAuthSession({ ...data, token: token || '' });
          setCurrentUser(user);
          return;
        } catch (error) {
          const status = Number(error?.statusCode || error?.response?.status || 0);
          if (!(status === 401 || status === 403)) {
            console.warn('[AUTH] Could not validate cookie session:', error);
          }
        }

        if (token) {
          try {
            const { data } = await api.get('/users/profile');
            const user = updateStoredUser(data) || data;
            setCurrentUser(user);
            return;
          } catch (error) {
            const status = Number(error?.statusCode || error?.response?.status || 0);
            if (status === 401 || status === 403) {
              console.error('[AUTH] Stored session is invalid, replacing with guest session:', error);
              clearAuthSession();
            } else {
              console.warn('[AUTH] Could not validate stored session, keeping existing user for now:', error);
              setCurrentUser(getStoredUser());
              return;
            }
          }
        }

        const data = await createAnonymousUserWithRetry();
        const user = saveAuthSession(data);
        setCurrentUser(user);
      } catch (error) {
        console.error('[AUTH] Failed to register anonymous user:', error);
        setCurrentUser(null);
      } finally {
        isFetchingUser = false;
        setAuthLoading(false);
      }
    };

    bootstrapUser();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, uiTheme);
    applyThemeTokens(uiTheme);
  }, [uiTheme]);

  const handleAuthSuccess = useCallback((user) => {
    setCurrentUser(user);
  }, []);

  const handleUserUpdate = useCallback((userPatch) => {
    const nextUser = updateStoredUser(userPatch) || userPatch;
    setCurrentUser((prev) => ({ ...(prev || {}), ...nextUser }));
  }, []);

  const handleLogout = async () => {
    clearAuthSession();

    try {
      await api.post('/auth/logout');
      const data = await createAnonymousUserWithRetry();
      const guestUser = saveAuthSession(data);
      setCurrentUser(guestUser);
    } catch (error) {
      console.error('[AUTH] Failed to create guest session after logout:', error);
      setCurrentUser(null);
    }
  };

  return (
    <AuthProvider value={{ currentUser, setCurrentUser, authLoading }}>
      <SocketProvider currentUser={currentUser}>
        <Router>
          <AppShell
          currentUser={currentUser}
          onLogout={handleLogout}
          onUserUpdate={handleUserUpdate}
          uiTheme={uiTheme}
          onThemeChange={setUiTheme}
          onAuthSuccess={handleAuthSuccess}
        />
        </Router>
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
