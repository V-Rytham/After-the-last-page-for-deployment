import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { getStoredToken } from '../../utils/auth';
import './SessionNavigationGuard.css';

const SENSITIVE_STATES = new Set(['SEARCHING', 'MATCHED', 'IN_CONVERSATION']);

const getCurrentHashRoute = () => (typeof window !== 'undefined' ? window.location.hash : '');

const isSameHashRoute = (a, b) => String(a || '') === String(b || '');

const parseHashRouteFromHref = (href) => {
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) {
      return null;
    }
    return url.hash || null;
  } catch {
    return null;
  }
};

export default function SessionNavigationGuard() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingHash, setPendingHash] = useState(null);
  const [sessionState, setSessionState] = useState('IDLE');
  const isSensitive = useMemo(() => SENSITIVE_STATES.has(String(sessionState || '').toUpperCase()), [sessionState]);
  const isMeetRoute = location.pathname.startsWith('/meet/');

  const lastSafeHashRef = useRef(getCurrentHashRoute());
  const allowNavigationRef = useRef(false);
  const cleanupInFlightRef = useRef(false);
  const pollTimerRef = useRef(null);
  const statusRequestInFlightRef = useRef(false);
  const pollingDelayRef = useRef(3000);

  const refreshStatus = useCallback(async () => {
    if (!getStoredToken()) {
      setSessionState('IDLE');
      pollingDelayRef.current = 3000;
      return 'IDLE';
    }

    if (statusRequestInFlightRef.current) {
      return sessionState;
    }

    statusRequestInFlightRef.current = true;
    try {
      const { data } = await api.get('/session/status');
      const state = String(data?.session?.state || 'IDLE').toUpperCase();
      setSessionState(state);
      pollingDelayRef.current = 3000;
      return state;
    } catch (error) {
      const status = Number(error?.statusCode || error?.response?.status || 0);
      if (status === 429) {
        pollingDelayRef.current = Math.min(pollingDelayRef.current * 2, 15000);
      } else {
        pollingDelayRef.current = 5000;
      }
      // If status can't be fetched, don't block navigation.
      setSessionState('IDLE');
      return 'IDLE';
    } finally {
      statusRequestInFlightRef.current = false;
    }
  }, [sessionState]);

  const cleanupSession = useCallback(async (reason = 'nav-guard') => {
    if (!getStoredToken()) {
      setSessionState('IDLE');
      return;
    }
    if (cleanupInFlightRef.current) {
      return;
    }
    cleanupInFlightRef.current = true;
    try {
      await api.post('/matchmaking/leave').catch(() => {});
      await api.post('/session/end', { reason }).catch(() => {});
      setSessionState('IDLE');
    } finally {
      cleanupInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshStatus();

    const handleHint = () => {
      refreshStatus();
    };

    window.addEventListener('atlp-session-hint', handleHint);
    return () => window.removeEventListener('atlp-session-hint', handleHint);
  }, [refreshStatus]);

  useEffect(() => {
    if (pollTimerRef.current) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (!isSensitive) {
      return undefined;
    }

    const runPoll = async () => {
      await refreshStatus();
      if (!pollTimerRef.current) {
        return;
      }
      pollTimerRef.current = window.setTimeout(runPoll, pollingDelayRef.current);
    };

    pollTimerRef.current = window.setTimeout(runPoll, pollingDelayRef.current);

    return () => {
      if (pollTimerRef.current) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isSensitive, refreshStatus]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleHashNavigation = () => {
      const nextHash = getCurrentHashRoute();

      if (allowNavigationRef.current) {
        allowNavigationRef.current = false;
        lastSafeHashRef.current = nextHash;
        setPendingHash(null);
        return;
      }

      if (!isSensitive || isMeetRoute) {
        lastSafeHashRef.current = nextHash;
        return;
      }

      const previousHash = lastSafeHashRef.current;
      if (previousHash && !isSameHashRoute(previousHash, nextHash)) {
        setPendingHash(nextHash);
        allowNavigationRef.current = true;
        window.location.hash = previousHash;
        setIsOpen(true);
      }
    };

    window.addEventListener('hashchange', handleHashNavigation);
    window.addEventListener('popstate', handleHashNavigation);
    return () => {
      window.removeEventListener('hashchange', handleHashNavigation);
      window.removeEventListener('popstate', handleHashNavigation);
    };
  }, [isMeetRoute, isSensitive]);

  useEffect(() => {
    const handleClickCapture = (event) => {
      if (!isSensitive || isMeetRoute) {
        return;
      }

      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!target) {
        return;
      }

      const href = target.getAttribute('href');
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return;
      }

      const nextHash = parseHashRouteFromHref(href);
      if (!nextHash) {
        return;
      }

      const currentHash = getCurrentHashRoute();
      if (isSameHashRoute(nextHash, currentHash)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingHash(nextHash);
      setIsOpen(true);
    };

    document.addEventListener('click', handleClickCapture, true);
    return () => document.removeEventListener('click', handleClickCapture, true);
  }, [isMeetRoute, isSensitive]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="session-guard-overlay" role="dialog" aria-modal="true" aria-label="Leave session confirmation">
      <div className="session-guard-card glass-panel">
        <h2 className="font-serif">Leave this session?</h2>
        <p>Leaving will end your current session and notify the other reader.</p>
        <div className="session-guard-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setIsOpen(false);
              setPendingHash(null);
            }}
          >
            Stay
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const next = pendingHash;
              setIsOpen(false);
              setPendingHash(null);
              cleanupSession('nav-guard-leave').finally(() => {
                if (next && next !== getCurrentHashRoute()) {
                  allowNavigationRef.current = true;
                  window.location.hash = next;
                }
              });
            }}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
