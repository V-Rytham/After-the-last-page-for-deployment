import React from 'react';
import { motion } from 'framer-motion';

const MotionArticle = motion.article;

const ExperienceCard = ({ title, description, tone, index = 0 }) => (
  <MotionArticle
    className={`home2-exp-card home2-exp-${tone}`}
    variants={{
      hidden: { opacity: 0, y: 20 },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.52, ease: 'easeOut', delay: index * 0.1 },
      },
    }}
    whileHover={{ y: -4, boxShadow: '0 14px 30px rgba(0, 0, 0, 0.12)' }}
    transition={{ duration: 0.2, ease: 'easeOut' }}
  >
    <div>
      <h3 className="font-serif">{title}</h3>
      <p>{description}</p>
    </div>
  </MotionArticle>
);

export default ExperienceCard;
