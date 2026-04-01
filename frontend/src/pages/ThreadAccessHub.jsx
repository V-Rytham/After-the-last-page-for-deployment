import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import './ThreadAccessHub.css';

const ThreadAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  return (
    <div className="thread-access-page animate-fade-in">
      <section className="thread-access-hero">
        <div className="thread-access-hero-row">
          <div className="thread-access-copy">
            <h1 className="font-serif">Step into the reader-only thread.</h1>
            <p>Where finished books become conversations.</p>
          </div>
        </div>
      </section>

      <section className="thread-access-grid">
        <div className="thread-access-loading glass-panel">
          <LockKeyhole size={18} />
          <p>Book listing has been removed from this screen.</p>
          {!isMember ? (
            <button className="btn-primary sm thread-access-button" onClick={() => navigate('/auth')}>
              Sign in
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default ThreadAccessHub;
