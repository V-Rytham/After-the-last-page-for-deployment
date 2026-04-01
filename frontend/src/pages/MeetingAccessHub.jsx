import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import './MeetingAccessHub.css';

const MeetingAccessHub = ({ currentUser }) => {
  const navigate = useNavigate();
  const isMember = Boolean(currentUser && !currentUser.isAnonymous);

  if (!isMember) {
    return (
      <div className="meeting-access-page is-gated animate-fade-in">
        <section className="meeting-access-gate" aria-label="Meet">
          <h1 className="font-serif">Private discussions for readers who reached the last page.</h1>
          <p>Sign in to access your completed books and join anonymous conversations.</p>

          <div className="meeting-access-gate-actions">
            <button type="button" className="btn-primary" onClick={() => navigate('/auth')}>
              Sign in to join conversations <ArrowRight size={16} />
            </button>
          </div>

          <div className="meeting-access-gate-footnote">
            <ShieldCheck size={16} />
            <span>Only finished books appear here.</span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="meeting-access-page animate-fade-in">
      <section className="meeting-access-empty glass-panel">
        <h2 className="font-serif">No meeting rooms listed.</h2>
        <p>Book listing has been removed from this screen.</p>
      </section>
    </div>
  );
};

export default MeetingAccessHub;
