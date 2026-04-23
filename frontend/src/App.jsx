import React, { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/layout/Navbar';
import SessionNavigationGuard from './components/session/SessionNavigationGuard';
import { SocketProvider } from './context/SocketContext';
import { getStoredUser, saveAuthSession } from './utils/auth';
import { getOrCreateIdentity } from './utils/identity';
import { DEFAULT_UI_THEME, THEME_STORAGE_KEY, UI_THEMES } from './utils/uiThemes';
import { applyThemeTokens } from './styles/theme';
import './index.css';
import OnboardingModal from './components/OnboardingModal';

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

const AppShell = ({ currentUser, uiTheme, onThemeChange }) => {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith('/read/');

  return (
    <div className="app-container">
      <SessionNavigationGuard />
      {!hideNavbar && (
        <Navbar currentUser={currentUser} uiTheme={uiTheme} onThemeChange={onThemeChange} />
      )}
      <main className={`main-content ${hideNavbar ? 'no-navbar' : 'with-navbar'}`}>
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
        <OnboardingModal />
      </main>
    </div>
  );
};

const App = () => {
  const [currentUser] = useState(() => {
    const existing = getStoredUser();
    if (existing) return existing;
    const identity = getOrCreateIdentity();
    return identity ? saveAuthSession(identity) : null;
  });
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
