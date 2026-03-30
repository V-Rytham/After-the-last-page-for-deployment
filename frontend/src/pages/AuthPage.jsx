import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, LoaderCircle, LogIn, Sparkles, UserPlus } from 'lucide-react';
import api from '../utils/api';
import { saveAuthSession } from '../utils/auth';
import './AuthPage.css';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const initialSignupState = {
  name: '',
  username: '',
  bio: '',
  email: '',
  password: '',
  confirmPassword: '',
};

const initialLoginState = {
  email: '',
  password: '',
};

const normalizeUsername = (value) => String(value || '').trim();

const getUsernameValidationMessage = (username) => {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    return '';
  }

  if (!USERNAME_RE.test(normalized)) {
    return 'Use 3-20 letters, numbers, or underscores.';
  }

  return '';
};

export default function AuthPage({ onAuthSuccess, currentUser }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [loginForm, setLoginForm] = useState(initialLoginState);
  const [signupForm, setSignupForm] = useState(initialSignupState);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [usernameState, setUsernameState] = useState({ status: 'idle', message: '' });

  const isGuest = currentUser?.isAnonymous;
  const redirectPath = location.state?.from || '/desk';
  const normalizedSignupUsername = normalizeUsername(signupForm.username);

  useEffect(() => {
    if (currentUser && !currentUser.isAnonymous) {
      navigate(redirectPath, { replace: true });
    }
  }, [currentUser, navigate, redirectPath]);

  useEffect(() => {
    let cancelled = false;

    const ping = async () => {
      try {
        await api.get('/health');
        if (!cancelled) {
          setServerOnline(true);
        }
      } catch {
        if (!cancelled) {
          setServerOnline(false);
        }
      }
    };

    ping();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'signup') {
      setUsernameState({ status: 'idle', message: '' });
      return undefined;
    }

    const validationMessage = getUsernameValidationMessage(signupForm.username);
    if (!normalizedSignupUsername) {
      setUsernameState({ status: 'idle', message: '' });
      return undefined;
    }

    if (validationMessage) {
      setUsernameState({ status: 'invalid', message: validationMessage });
      return undefined;
    }

    setUsernameState({ status: 'checking', message: 'Checking username…' });

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/users/username-availability', {
          params: { username: normalizedSignupUsername },
        });

        if (!cancelled) {
          setUsernameState({
            status: data.available ? 'available' : 'taken',
            message: data.message,
          });
        }
      } catch (requestError) {
        if (cancelled) {
          return;
        }

        setUsernameState({
          status: 'invalid',
          message: requestError.response?.data?.message || 'Could not validate that username right now.',
        });
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [mode, normalizedSignupUsername, signupForm.username]);

  const introCopy = useMemo(() => {
    if (isGuest) {
      return 'Save your identity, keep your reading history, and carry your presence into every room.';
    }
    return 'Create an account or sign in to keep your reading identity with you.';
  }, [isGuest]);

  const handleLoginChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSignupChange = (event) => {
    const { name, value } = event.target;
    setSignupForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const { data } = await api.post('/users/login', loginForm);
      const user = saveAuthSession(data);
      onAuthSuccess(user);
      navigate(redirectPath, { replace: true });
    } catch (requestError) {
      if (!requestError.response) {
        setServerOnline(false);
        setError('Cannot reach the ALP server. Start the backend with `node backend/index.js` (port 5000), then try again.');
      } else {
        setError(requestError.response?.data?.message || 'Unable to sign in right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    setError('');

    if (signupForm.password !== signupForm.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const usernameValidationMessage = getUsernameValidationMessage(signupForm.username);
    if (usernameValidationMessage) {
      setError(usernameValidationMessage);
      return;
    }

    if (usernameState.status === 'taken') {
      setError('Choose a different username before continuing.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        name: signupForm.name,
        username: normalizedSignupUsername,
        bio: signupForm.bio,
        email: signupForm.email,
        password: signupForm.password,
      };
      const { data } = await api.post('/users/signup', payload);
      const user = saveAuthSession(data);
      onAuthSuccess(user);
      navigate(redirectPath, { replace: true });
    } catch (requestError) {
      if (!requestError.response) {
        setServerOnline(false);
        setError('Cannot reach the ALP server. Start the backend with `node backend/index.js` (port 5000), then try again.');
      } else {
        setError(requestError.response?.data?.message || 'Unable to create your account right now.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page animate-fade-in">
      <div className="auth-shell">
        <section className="auth-copy glass-panel">
          <div className="auth-badge">
            <Sparkles size={16} />
            <span>Reader Access</span>
          </div>
          <h1 className="font-serif auth-title">Keep your reading world with you.</h1>
          <p className="auth-subtitle">{introCopy}</p>
          <div className="auth-points">
            <div className="auth-point">
              <span className="auth-point-dot" />
              <span>Claim a public username for threads and book conversations</span>
            </div>
            <div className="auth-point">
              <span className="auth-point-dot" />
              <span>Add a short bio so your profile feels lived in, not blank</span>
            </div>
            <div className="auth-point">
              <span className="auth-point-dot" />
              <span>Keep your progress and discussion presence across devices</span>
            </div>
          </div>
        </section>

        <section className="auth-card glass-panel">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(''); }}
            >
              <LogIn size={18} /> Login
            </button>
            <button
              className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => { setMode('signup'); setError(''); }}
            >
              <UserPlus size={18} /> Sign up
            </button>
          </div>

          {!serverOnline && !error && (
            <div className="auth-warning" role="status">
              The server is offline. Start the backend with <code>node backend/index.js</code> and refresh.
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label className="auth-label">
                <span>Email</span>
                <input name="email" type="email" value={loginForm.email} onChange={handleLoginChange} className="auth-input" required />
              </label>
              <label className="auth-label">
                <span>Password</span>
                <input name="password" type="password" value={loginForm.password} onChange={handleLoginChange} className="auth-input" required />
              </label>
              <button type="submit" className="btn-primary auth-submit" disabled={submitting}>
                {submitting ? 'Signing in...' : 'Login'} <ArrowRight size={18} />
              </button>
            </form>
          ) : (
            <form className="auth-form" onSubmit={handleSignup}>
              <div className="auth-form-grid auth-form-grid-split">
                <label className="auth-label">
                  <span>Name</span>
                  <input name="name" type="text" value={signupForm.name} onChange={handleSignupChange} className="auth-input" required />
                </label>
                <label className="auth-label">
                  <span>Username</span>
                  <input name="username" type="text" value={signupForm.username} onChange={handleSignupChange} className="auth-input" minLength={3} maxLength={20} autoCapitalize="none" autoCorrect="off" required />
                </label>
              </div>

              <div className={`auth-field-note ${usernameState.status}`} aria-live="polite">
                {usernameState.status === 'checking' && <LoaderCircle size={14} className="auth-note-icon auth-spin" />}
                {usernameState.status === 'available' && <CheckCircle2 size={14} className="auth-note-icon" />}
                <span>{usernameState.message || 'Your username will appear publicly on your profile and in discussion spaces.'}</span>
              </div>

              <label className="auth-label">
                <span>Bio <em>(optional)</em></span>
                <textarea name="bio" value={signupForm.bio} onChange={handleSignupChange} className="auth-input auth-textarea" maxLength={160} rows={3} placeholder="A short note about what you read or how you show up in discussion." />
              </label>
              <div className="auth-character-count">{signupForm.bio.length}/160</div>

              <label className="auth-label">
                <span>Email</span>
                <input name="email" type="email" value={signupForm.email} onChange={handleSignupChange} className="auth-input" required />
              </label>
              <div className="auth-form-grid auth-form-grid-split">
                <label className="auth-label">
                  <span>Password</span>
                  <input name="password" type="password" value={signupForm.password} onChange={handleSignupChange} className="auth-input" minLength={6} required />
                </label>
                <label className="auth-label">
                  <span>Confirm password</span>
                  <input name="confirmPassword" type="password" value={signupForm.confirmPassword} onChange={handleSignupChange} className="auth-input" minLength={6} required />
                </label>
              </div>
              <button type="submit" className="btn-primary auth-submit" disabled={submitting || usernameState.status === 'checking'}>
                {submitting ? 'Creating account...' : 'Create account'} <ArrowRight size={18} />
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
