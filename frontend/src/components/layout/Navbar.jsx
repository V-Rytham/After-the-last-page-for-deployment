import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Moon, Sun, X } from 'lucide-react';
import { UI_THEMES } from '../../utils/uiThemes';
import './Navbar.css';

const NAV_ITEMS = [
  { path: '/desk', label: 'Your Desk' },
  { path: '/library', label: 'Library' },
  { path: '/meet', label: 'Meet' },
  { path: '/threads', label: 'Threads' },
  { path: '/merch', label: 'Studio' },
];

const THEME_SWATCH = {
  light: '#ffffff',
  sepia: '#E8DCC7',
  dark: '#121212',
};

const ProfileAvatar = ({ user, className = '', onClick }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const profileImageUrl = user?.profileImageUrl || '';
  const displayName = user?.name || user?.username || user?.email || user?.anonymousId || 'Reader';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'R';

  useEffect(() => {
    setImageFailed(false);
  }, [profileImageUrl]);

  return (
    <button type="button" className={`nav-avatar-btn ${className}`.trim()} onClick={onClick} aria-label="Open navigation menu">
      {profileImageUrl && !imageFailed ? (
        <img
          src={profileImageUrl}
          alt={`${displayName} profile`}
          className="nav-avatar-image"
          onError={() => setImageFailed(true)}
          loading="lazy"
        />
      ) : (
        <span className="nav-avatar-fallback" aria-hidden="true">{initials}</span>
      )}
    </button>
  );
};

const Navbar = ({ currentUser, onLogout, uiTheme, onThemeChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeTheme = useMemo(() => UI_THEMES.find((theme) => theme.id === uiTheme) || UI_THEMES[0], [uiTheme]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const handleSignOut = () => {
    onLogout?.();
    setDrawerOpen(false);
    navigate('/');
  };

  return (
    <>
      <nav className="navbar-redesign" aria-label="Global">
        <div className="navbar-left">
          <Link to="/" className="navbar-brand-link" aria-label="After the Last Page home">
            <span className="navbar-title font-serif">After the Last Page</span>
            <span className="navbar-subtitle">WHERE BOOKS BECOME CONVERSATIONS</span>
          </Link>
        </div>

        <div className="navbar-center" role="tablist" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} className={`navbar-pill ${active ? 'is-active' : ''}`} role="tab" aria-selected={active}>
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="navbar-right">
          <button
            type="button"
            className="theme-icon-btn"
            onClick={() => onThemeChange(uiTheme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch theme. Current theme: ${activeTheme.label}`}
          >
            {uiTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <ProfileAvatar user={currentUser} onClick={() => setDrawerOpen(true)} />
        </div>
      </nav>

      <aside className={`mobile-drawer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="mobile-drawer-panel" role="dialog" aria-modal="true" aria-label="Navigation drawer">
          <header className="drawer-header">
            <span className="drawer-brand font-serif">After the Last Page</span>
            <button type="button" className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
          </header>

          <div className="drawer-avatar-wrap">
            <ProfileAvatar user={currentUser} className="drawer-avatar" onClick={() => setDrawerOpen(false)} />
          </div>

          <nav className="drawer-nav" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname.startsWith(item.path);
              return (
                <Link key={item.path} to={item.path} className={`drawer-nav-row ${active ? 'is-active' : ''}`}>
                  <span>{item.label}</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>

          <div className="drawer-bottom">
            <div className="drawer-theme-group" role="group" aria-label="Theme">
              {UI_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`drawer-theme-swatch ${uiTheme === theme.id ? 'is-active' : ''}`}
                  onClick={() => onThemeChange(theme.id)}
                  aria-label={`Switch to ${theme.label} theme`}
                >
                  <span className="drawer-theme-dot" style={{ background: THEME_SWATCH[theme.id] }} aria-hidden="true" />
                  <span>{theme.label}</span>
                </button>
              ))}
            </div>

            <Link to="/settings" className="drawer-action-row">Profile Settings</Link>
            <button type="button" className="drawer-action-row is-danger" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
