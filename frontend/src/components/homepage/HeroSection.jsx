import React from 'react';
import { Link } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import { motion } from 'framer-motion';

const MotionLink = motion(Link);

const HeroSection = ({ primaryHref = '/auth', secondaryHref = '/meet', primaryLabel = 'Start Reading' }) => (
  <section className="home2-hero" aria-label="Homepage hero">
    <div className="home2-hero-inner">
      <motion.h1
        className="home2-hero-title font-serif"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.14 }}
      >
        Where the story ends, the conversation begins.
      </motion.h1>
      <motion.p
        className="home2-hero-subtitle"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.76, ease: 'easeOut', delay: 0.34 }}
      >
        Your sanctuary for immersive reading, finding kindred spirits, and exploring the worlds beyond the final chapter.
      </motion.p>
      <motion.div
        className="home2-hero-actions"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut', delay: 0.52 }}
      >
        <MotionLink
          to={primaryHref}
          className="home2-btn home2-btn-primary"
          whileHover={{ scale: 1.03, boxShadow: '0 12px 28px rgba(0, 0, 0, 0.16)' }}
          whileTap={{ scale: 0.99 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {primaryLabel} <MoveRight size={15} />
        </MotionLink>
        <MotionLink
          to={secondaryHref}
          className="home2-btn home2-btn-secondary"
          whileHover={{ scale: 1.03, boxShadow: '0 10px 24px rgba(0, 0, 0, 0.12)' }}
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
