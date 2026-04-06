import React from 'react';
import { Link } from 'react-router-dom';
import { MoveRight } from 'lucide-react';

const HeroSection = ({ primaryHref = '/auth', secondaryHref = '/meet', primaryLabel = 'Start Reading' }) => (
  <section className="home2-hero" aria-label="Homepage hero">
    <div className="home2-hero-inner">
      <h1 className="home2-hero-title font-serif">Where the story ends, the conversation begins.</h1>
      <p className="home2-hero-subtitle">
        Your sanctuary for immersive reading, finding kindred spirits, and exploring the worlds beyond the final chapter.
      </p>
      <div className="home2-hero-actions">
        <Link to={primaryHref} className="home2-btn home2-btn-primary">
          {primaryLabel} <MoveRight size={15} />
        </Link>
        <Link to={secondaryHref} className="home2-btn home2-btn-secondary">Discover Readers</Link>
      </div>
    </div>
  </section>
);

export default HeroSection;
