import React from 'react';
import { Link, NavLink } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', to: '/desk' },
  { label: 'Library', to: '/library' },
  { label: 'Journal', to: '/threads' },
];

const DeskHeader = ({ currentUser }) => {
  const initial = (currentUser?.displayName || currentUser?.username || currentUser?.email || 'R').slice(0, 1).toUpperCase();

  return (
    <header className="desk-editorial-header" aria-label="Your desk header">
      <h1>Your Desk.</h1>
      <div className="desk-editorial-header__right">
        <nav aria-label="Desk navigation">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `desk-editorial-nav__link ${isActive ? 'is-active' : ''}`.trim()}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/profile" className="desk-editorial-avatar" aria-label="Go to profile">
          <span>{initial}</span>
        </Link>
      </div>
    </header>
  );
};

export default DeskHeader;
