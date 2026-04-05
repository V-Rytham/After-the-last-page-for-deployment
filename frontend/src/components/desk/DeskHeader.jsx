import React from 'react';
import { Link } from 'react-router-dom';

const DeskHeader = ({ currentUser }) => {
  const initial = (currentUser?.displayName || currentUser?.username || currentUser?.email || 'R').slice(0, 1).toUpperCase();

  return (
    <header className="desk-editorial-header" aria-label="Your desk header">
      <h1>Your Desk.</h1>
      <div className="desk-editorial-header__right">
        <Link to="/profile" className="desk-editorial-avatar" aria-label="Go to profile">
          <span>{initial}</span>
        </Link>
      </div>
    </header>
  );
};

export default DeskHeader;
