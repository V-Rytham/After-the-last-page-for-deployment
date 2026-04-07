import React from 'react';
import { Link } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import { motion } from 'framer-motion';

const MotionLink = motion(Link);

const HeroSection = ({ primaryHref = '/auth', secondaryHref = '/meet', primaryLabel = 'Start Reading' }) => (
  <section className="home2-hero" aria-label="Homepage hero">
    <div className="home2-hero-inner">
      <motion.h1
        className="home2-hero-title home2-hero-title-shimmer font-serif"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.78, ease: 'easeOut', delay: 0 }}
      >
        Where the story ends, the conversation begins.
      </motion.h1>
      <motion.p
        className="home2-hero-subtitle"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.72, ease: 'easeOut', delay: 0.12 }}
      >
        Your sanctuary for immersive reading, finding kindred spirits, and exploring the worlds beyond the final chapter.
      </motion.p>
      <motion.div
        className="home2-hero-actions"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.64, ease: 'easeOut', delay: 0.24 }}
      >
        <MotionLink
          to={primaryHref}
          className="home2-btn home2-btn-primary"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {primaryLabel} <MoveRight size={15} />
        </MotionLink>
        <MotionLink
          to={secondaryHref}
          className="home2-btn home2-btn-secondary"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          Discover Readers
        </MotionLink>
      </motion.div>
    </div>
  </section>
);

export default HeroSection;
