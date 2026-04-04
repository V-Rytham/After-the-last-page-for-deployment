import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  BookOpenText,
  Check,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Moon,
  PenLine,
  Settings,
  Sun,
  User,
  UserRound,
  UserPlus,
  UsersRound,
} from 'lucide-react';
import { UI_THEMES } from '../../utils/uiThemes';
import './Navbar.css';

const THEME_ICONS = {
  light: Sun,
  sepia: BookOpenText,
  dark: Moon,
};

const themeOptions = UI_THEMES.map((theme) => ({
  ...theme,
  icon: THEME_ICONS[theme.id] || Sun,
}));

const useCloseOnPointerDownOutside = (isOpen, wrapperRef, onClose) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!wrapperRef.current) {
        return;
      }

      if (!wrapperRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isOpen, onClose, wrapperRef]);
};

const useCloseOnEscape = (isOpen, onClose) => {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
};

const ThemeMenu = ({ uiTheme, onThemeChange, isOpen, onToggle, onClose, className = '' }) => {
  const wrapperRef = useRef(null);
  useCloseOnPointerDownOutside(isOpen, wrapperRef, onClose);

  const activeOption = useMemo(() => themeOptions.find((option) => option.id === uiTheme) || themeOptions[0], [uiTheme]);
  const ActiveIcon = activeOption.icon;

  return (
    <div className={`theme-menu ${className}`.trim()} ref={wrapperRef}>
      <button
        type="button"
        className="theme-trigger theme-trigger-icon"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <ActiveIcon size={16} strokeWidth={2.1} aria-hidden="true" />
        <span className="theme-trigger-label">{activeOption.label}</span>
        <span className="sr-only">Theme</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="theme-popover glass-panel" role="listbox" aria-label="Theme">
          {themeOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`theme-option ${uiTheme === option.id ? 'is-active' : ''}`}
              onClick={() => {
                onThemeChange(option.id);
                onClose();
              }}
              role="option"
              aria-selected={uiTheme === option.id}
            >
              <span className="theme-option-row">
                <option.icon size={18} strokeWidth={2.1} aria-hidden="true" />
                <span>{option.label}</span>
              </span>
              {uiTheme === option.id && <Check size={16} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const MoreMenu = ({ isOpen, isActive, onToggle, onClose }) => {
  const wrapperRef = useRef(null);
  useCloseOnPointerDownOutside(isOpen, wrapperRef, onClose);

  return (
    <div className="more-menu" ref={wrapperRef}>
      <button
        type="button"
        className={`more-trigger ${isActive ? 'active' : ''}`.trim()}
        onClick={() => {
          onToggle();
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <MoreHorizontal size={18} strokeWidth={2.1} aria-hidden="true" />
        <span className="sr-only">More</span>
      </button>

      {isOpen && (
        <div className="more-popover glass-panel" role="menu" aria-label="More">
          <Link to="/merch" className={`menu-item ${isActive ? 'is-active' : ''}`.trim()} role="menuitem" onClick={onClose}>
            <PenLine size={18} strokeWidth={2.1} aria-hidden="true" />
            <span>Studio</span>
          </Link>
        </div>
      )}
    </div>
  );
};

const ProfileMenu = ({ displayName, username, onLogout, isOpen, onToggle, onClose }) => {
  const wrapperRef = useRef(null);
  useCloseOnPointerDownOutside(isOpen, wrapperRef, onClose);
  useCloseOnEscape(isOpen, onClose);
  const initials = useMemo(() => {
    const base = (displayName || username || 'Reader').trim();
    return base ? base[0].toUpperCase() : 'R';
  }, [displayName, username]);

  return (
    <div className="profile-menu" ref={wrapperRef}>
      <button
        type="button"
        className="profile-avatar-btn"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <UserRound size={18} strokeWidth={2.1} aria-hidden="true" className="profile-avatar-icon" />
        <span className="sr-only">Open profile menu</span>
      </button>

      {isOpen && (
        <div className="profile-popover glass-panel" role="menu" aria-label="Profile">
          <div className="profile-popover-head">
            <strong>{displayName}</strong>
            {username && <span>@{username}</span>}
          </div>

          <Link to="/profile" className="menu-item" role="menuitem" onClick={onClose}>
            <User size={18} strokeWidth={2.1} aria-hidden="true" />
            <span>Profile</span>
          </Link>
          <Link to="/settings" className="menu-item" role="menuitem" onClick={onClose}>
            <Settings size={18} strokeWidth={2.1} aria-hidden="true" />
            <span>Settings</span>
          </Link>

          <div className="menu-divider" aria-hidden="true" />

          <button type="button" className="menu-item menu-item-danger" role="menuitem" onClick={onLogout}>
            <LogOut size={18} strokeWidth={2.1} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      )}
    </div>
  );
};

const Navbar = ({ currentUser, onLogout, uiTheme, onThemeChange }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const navLinksWrapperRef = useRef(null);
  const navLinkRefs = useRef(new Map());
  const [indicatorStyle, setIndicatorStyle] = useState({ x: 0, w: 0, o: 0 });

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const isMember = Boolean(currentUser && !currentUser.isAnonymous);
  const navIconProps = useMemo(() => ({ size: 16, strokeWidth: 2.1 }), []);

  const primaryNavLinks = useMemo(
    () => [
      ...(isMember ? [
        { path: '/library', icon: <BookOpen {...navIconProps} />, label: 'Library' }
      ] : []),
      { path: '/meet', icon: <UsersRound {...navIconProps} />, label: 'Meet' },
      { path: '/threads', icon: <MessageCircle {...navIconProps} />, label: 'Threads' },
    ],
    [isMember, navIconProps],
  );

  const studioNavLink = useMemo(
    () => ({ path: '/merch', icon: <PenLine {...navIconProps} />, label: 'Studio' }),
    [navIconProps],
  );

  const displayName = currentUser?.isAnonymous
    ? currentUser.anonymousId
    : currentUser?.name || currentUser?.username || currentUser?.email || 'Reader';
  const publicHandle = currentUser?.isAnonymous ? '' : (currentUser?.username || '');

  const handleLogout = () => {
    onLogout();
    setIsMenuOpen(false);
    setIsThemeOpen(false);
    setIsMoreOpen(false);
    setIsProfileOpen(false);
    navigate('/');
  };

  useLayoutEffect(() => {
    const wrapper = navLinksWrapperRef.current;
    if (!wrapper) {
      return undefined;
    }

    const compute = () => {
      const refs = navLinkRefs.current;
      const active = [...refs.entries()].find(([path]) => location.pathname.startsWith(path));
      const el = active ? active[1] : null;

      if (!el || !(el instanceof HTMLElement)) {
        setIndicatorStyle((prev) => (prev.o === 0 ? prev : { ...prev, o: 0 }));
        return;
      }

      const wrapperBox = wrapper.getBoundingClientRect();
      const elBox = el.getBoundingClientRect();
      const x = Math.max(0, elBox.left - wrapperBox.left);
      const w = Math.max(0, elBox.width);
      setIndicatorStyle({ x, w, o: 1 });
    };

    compute();

    const ro = new ResizeObserver(() => {
      compute();
    });
    ro.observe(wrapper);

    return () => ro.disconnect();
  }, [location.pathname]);

  return (
    <nav className="navbar navbar-capsule">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo" aria-label="After The Last Page">
          <BookOpen className="logo-icon" size={16} strokeWidth={2.1} />
          <div className="logo-copy">
            <span className="logo-text font-serif">After The Last Page</span>
            <span className="logo-tagline">Where books become conversations</span>
          </div>
        </Link>

        <div className="nav-links-group" aria-label="Primary">
          <div
            className="navbar-links"
            ref={navLinksWrapperRef}
            style={{
              '--indicator-x': `${indicatorStyle.x}px`,
              '--indicator-w': `${indicatorStyle.w}px`,
              '--indicator-o': indicatorStyle.o,
            }}
          >
            <span className="nav-indicator" aria-hidden="true" />
            {primaryNavLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`nav-link ${location.pathname.startsWith(link.path) ? 'active' : ''}`}
                aria-label={link.label}
                ref={(node) => {
                  if (node) {
                    navLinkRefs.current.set(link.path, node);
                  } else {
                    navLinkRefs.current.delete(link.path);
                  }
                }}
              >
                {link.icon}
                <span className="nav-link-label">{link.label}</span>
              </Link>
            ))}

            <Link
              key={studioNavLink.path}
              to={studioNavLink.path}
              className={`nav-link nav-link-secondary ${location.pathname.startsWith(studioNavLink.path) ? 'active' : ''}`}
              aria-label={studioNavLink.label}
              ref={(node) => {
                if (node) {
                  navLinkRefs.current.set(studioNavLink.path, node);
                } else {
                  navLinkRefs.current.delete(studioNavLink.path);
                }
              }}
            >
              {studioNavLink.icon}
              <span className="nav-link-label">{studioNavLink.label}</span>
            </Link>

            <MoreMenu
              isOpen={isMoreOpen}
              isActive={location.pathname.startsWith(studioNavLink.path)}
              onToggle={() => {
                setIsMoreOpen((open) => !open);
                setIsThemeOpen(false);
                setIsProfileOpen(false);
              }}
              onClose={() => setIsMoreOpen(false)}
            />
          </div>
        </div>

        <div className="navbar-user-capsule">
          <ThemeMenu
            uiTheme={uiTheme}
            onThemeChange={onThemeChange}
            isOpen={isThemeOpen}
            onToggle={() => {
              setIsThemeOpen((open) => !open);
              setIsProfileOpen(false);
              setIsMoreOpen(false);
            }}
            onClose={() => setIsThemeOpen(false)}
            className="is-primary"
          />

          {currentUser ? (
            <>
              {!currentUser.isAnonymous && (
                <ProfileMenu
                  displayName={displayName}
                  username={publicHandle}
                  onLogout={handleLogout}
                  isOpen={isProfileOpen}
                  onToggle={() => {
                    setIsProfileOpen((open) => !open);
                    setIsThemeOpen(false);
                    setIsMoreOpen(false);
                  }}
                  onClose={() => setIsProfileOpen(false)}
                />
              )}

              {currentUser.isAnonymous && (
                <>
                  <div className="auth-chip guest" aria-label="Guest session">
                    <span className="auth-chip-dot" aria-hidden="true" />
                    <span className="auth-chip-name">{displayName}</span>
                    <span className="auth-chip-role">Guest</span>
                  </div>

                  <Link to="/auth" className="auth-link auth-link-primary">
                    <UserPlus size={18} strokeWidth={2.1} />
                    <span>Sign in</span>
                  </Link>
                </>
              )}
            </>
          ) : (
            <Link to="/auth" className="auth-link auth-link-primary">
              <LogIn size={18} strokeWidth={2.1} />
              <span>Sign in</span>
            </Link>
          )}
        </div>

        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => {
            setIsMenuOpen((open) => !open);
            setIsThemeOpen(false);
            setIsMoreOpen(false);
            setIsProfileOpen(false);
          }}
          aria-expanded={isMenuOpen}
          aria-label="Open menu"
        >
          <Menu size={18} strokeWidth={2.1} aria-hidden="true" />
        </button>
      </div>


      {isMenuOpen && (
        <div className="mobile-menu glass-panel">
          <div className="mobile-menu-row">
            <span className="mobile-menu-label">Theme</span>
            <div className="mobile-theme-select">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`mobile-theme-option ${uiTheme === option.id ? 'active' : ''}`}
                  onClick={() => onThemeChange(option.id)}
                >
                  <option.icon size={16} strokeWidth={2.1} aria-hidden="true" />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {[...primaryNavLinks, studioNavLink].map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`mobile-nav-link ${location.pathname.startsWith(link.path) ? 'active' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          {currentUser?.isAnonymous && (
            <Link to="/auth" className="mobile-nav-link highlight" onClick={() => setIsMenuOpen(false)}>
              Sign in
            </Link>
          )}

          {!currentUser?.isAnonymous && currentUser && (
            <button type="button" className="mobile-nav-link button-reset" onClick={handleLogout}>
              Logout
            </button>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
