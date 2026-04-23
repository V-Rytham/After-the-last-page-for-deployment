import React from 'react';
import { motion } from 'framer-motion';
import HeroSection from '../components/homepage/HeroSection';
import ExperienceCard from '../components/homepage/ExperienceCard';
import EmotionalSection from '../components/homepage/EmotionalSection';
import { cardStagger } from '../components/homepage/motionPresets';
import './LandingPage.css';

const MotionSection = motion.section;

const EXPERIENCE_ITEMS = [
  {
    key: 'immersive',
    title: 'Immersive Reading',
    description: 'Quiet pages, focused flow.',
    tone: 'one',
  },
  {
    key: 'minds',
    title: 'Meet Minds',
    description: 'Readers who reached the end.',
    tone: 'two',
  },
  {
    key: 'threads',
    title: 'Book Threads',
    description: 'Thoughtful, spoiler-safe depth.',
    tone: 'three',
  },
  {
    key: 'merch',
    title: 'AI Merchandise',
    description: 'Artifacts from stories you loved.',
    tone: 'four',
  },
];

export default function LandingPage() {
  return (
    <div className="home2-page animate-fade-in">
      <div className="layout-shell home2-shell">
        <section className="layout-content">
          <HeroSection primaryHref="/meet" secondaryHref="/threads" primaryLabel="Start Exploring" />

          <MotionSection
            className="home2-experience"
            aria-label="Experience"
            variants={cardStagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.28 }}
          >
            {EXPERIENCE_ITEMS.map((item, index) => (
              <ExperienceCard
                key={item.key}
                title={item.title}
                description={item.description}
                tone={item.tone}
                index={index}
              />
            ))}
          </MotionSection>

          <EmotionalSection />
        </section>
      </div>
    </div>
  );
}
