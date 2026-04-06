import React from 'react';
import { Link } from 'react-router-dom';

const ThreadsCard = ({ preview }) => (
  <article className="home2-card home2-stack-card">
    <p className="home2-kicker">Active Threads</p>
    {preview ? (
      <>
        <h3 className="font-serif">{preview.title || 'Reader discussion'}</h3>
        <p className="home2-muted">{preview.content || 'New thread activity is happening now.'}</p>
      </>
    ) : (
      <p className="home2-muted">No active threads yet. New discussions appear as readers start posting about books.</p>
    )}
    <Link to="/threads" className="home2-text-link">Open Threads</Link>
  </article>
);

export default ThreadsCard;
