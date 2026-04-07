import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { revealScale } from './motionPresets';

const MotionLink = motion(Link);

const EmotionalSection = () => (
  <motion.section
    className="home2-emotional"
    aria-label="Reading reflection"
    variants={revealScale}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.35 }}
  >
    <div className="home2-emotional-copy">
      <h2 className="font-serif">What happens after you finish a book?</h2>
      <p>
        The final page closes, but the emotion stays with you. Keep that momentum going in thoughtful spaces built for readers who actually made it to the end.
      </p>
      <MotionLink
        to="/meet"
        className="home2-btn home2-btn-primary"
        whileHover={{ scale: 1.03, boxShadow: '0 12px 28px rgba(0, 0, 0, 0.16)' }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        Join the conversation
      </MotionLink>
    </div>
  </motion.section>
);

export default EmotionalSection;
