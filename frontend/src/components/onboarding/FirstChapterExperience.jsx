import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useOnboarding from '../../hooks/useOnboarding';
import OnboardingCard from './OnboardingCard';

export default function FirstChapterExperience() {
  const location = useLocation();
  const { step, completed, completeOnboarding } = useOnboarding();

  useEffect(() => {
    if (!completed && step >= 4) {
      completeOnboarding();
    }
  }, [completeOnboarding, completed, step]);

  if (completed) return null;

  if (location.pathname.startsWith('/auth')) return null;

  return <OnboardingCard />;
}

