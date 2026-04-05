import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight, Moon, Sun, X } from 'lucide-react';
import { UI_THEMES } from '../../utils/uiThemes';
import './Navbar.css';

const NAV_ITEMS = [
  { path: '/desk', label: 'Desk' },
  { path: '/library', label: 'Library' },
  { path: '/meet', label: 'Meet' },
  { path: '/threads', label: 'Threads' },
  { path: '/merch', label: 'Studio' },
];

const THEME_SWATCH = {
  light: '#ffffff',
  sepia: '#E8DCC7',
  dark: '#1E2230',
};

const ProfileAvatar = ({ user, className = '', onClick, label = 'Open profile' }) => {
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const profileImageUrl = user?.profileImageUrl || '';
  const displayName = user?.name || user?.username || user?.email || user?.anonymousId || 'Reader';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'R';

  const imageFailed = Boolean(profileImageUrl) && failedImageUrl === profileImageUrl;

  const avatarContent = profileImageUrl && !imageFailed ? (
    <img
      src={profileImageUrl}
      alt={`${displayName} profile`}
      className="nav-avatar-image"
      onError={() => setFailedImageUrl(profileImageUrl)}
      loading="lazy"
    />
  ) : (
    <span className="nav-avatar-fallback" aria-hidden="true">{initials}</span>
  );

  return (
    <button type="button" className={`nav-avatar-btn ${className}`.trim()} onClick={onClick} aria-label={label}>
      {avatarContent}
    </button>
  );
};

const Navbar = ({ currentUser, onLogout, uiTheme, onThemeChange }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  const activeTheme = useMemo(() => UI_THEMES.find((theme) => theme.id === uiTheme) || UI_THEMES[0], [uiTheme]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [profileMenuOpen]);

  const handleSignOut = () => {
    onLogout?.();
    setDrawerOpen(false);
    setProfileMenuOpen(false);
    navigate('/auth');
  };

  const handleViewProfile = () => {
    setProfileMenuOpen(false);
    navigate('/profile');
  };

  return (
    <>
      <header className="navbar-redesign" aria-label="Global">
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

          <div className="profile-menu-wrap" ref={profileMenuRef}>
            <ProfileAvatar
              user={currentUser}
              label="Open profile menu"
              onClick={() => setProfileMenuOpen((open) => !open)}
            />
            {profileMenuOpen ? (
              <div className="profile-dropdown" role="menu" aria-label="Profile menu">
                <button type="button" className="profile-dropdown-item" role="menuitem" onClick={handleViewProfile}>View profile</button>
                <button type="button" className="profile-dropdown-item is-danger" role="menuitem" onClick={handleSignOut}>Sign out</button>
              </div>
            ) : null}
          </div>

          <ProfileAvatar user={currentUser} className="mobile-menu-avatar" onClick={() => setDrawerOpen(true)} label="Open navigation menu" />
        </div>
      </header>

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
                <Link key={item.path} to={item.path} className={`drawer-nav-row ${active ? 'is-active' : ''}`} onClick={() => setDrawerOpen(false)}>
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

            <Link to="/settings" className="drawer-action-row" onClick={() => setDrawerOpen(false)}>Profile Settings</Link>
            <button type="button" className="drawer-action-row is-danger" onClick={handleSignOut}>Sign Out</button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
