import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Menu, Moon, Palette, Sun, X } from 'lucide-react';
import { UI_THEMES } from '../../utils/uiThemes';
import './Navbar.css';

const NAV_ITEMS = [
  { path: '/meet', label: 'Meet' },
  { path: '/threads', label: 'Threads' },
  { path: '/request-book', label: 'Read' },
  { path: '/merch', label: 'Studio' },
];

const THEME_SWATCH = {
  light: '#ffffff',
  sepia: '#E8DCC7',
  dark: '#1E2230',
};

const Navbar = ({ uiTheme, onThemeChange }) => {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const activeTheme = useMemo(() => UI_THEMES.find((theme) => theme.id === uiTheme) || UI_THEMES[0], [uiTheme]);

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  const cycleTheme = () => {
    const themeOrder = ['dark', 'sepia', 'light'];
    const currentIndex = Math.max(themeOrder.indexOf(uiTheme), 0);
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
    onThemeChange(nextTheme);
  };

  return (
    <>
      <header className="navbar" aria-label="Global">
        <div className="navbar-left">
          <Link to="/" className="navbar-brand-link" aria-label="After the Last Page home">
            <span className="navbar-title font-serif">After the Last Page</span>
          </Link>
        </div>

        <nav className="center-nav" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} className={`center-nav-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="navbar-right">
          <div className="right-controls">
            <button
              type="button"
              className="theme-icon-btn"
              onClick={cycleTheme}
              aria-label={`Switch theme. Current theme: ${activeTheme.label}`}
            >
              {uiTheme === 'dark' ? <Sun size={17} /> : uiTheme === 'sepia' ? <Palette size={17} /> : <Moon size={17} />}
            </button>
          </div>

          <button type="button" className="mobile-menu-trigger" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu">
            <Menu size={18} />
          </button>
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
          </div>
        </div>
      </aside>
    </>
  );
};

export default Navbar;
