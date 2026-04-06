import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MoveRight } from 'lucide-react';
import useOnboarding from '../../hooks/useOnboarding';
import './Onboarding.css';

export default function OnboardingCard() {
  const navigate = useNavigate();
  const { step, completed, nextStep } = useOnboarding();

  if (completed || step !== 0) return null;

  return (
    <aside className="onboarding-card onboarding-fade-in" aria-label="First Chapter Experience">
      <div>
        <div className="onboarding-card__title">Start your first journey 📖</div>
        <div className="onboarding-card__subtitle">Add a book to your shelf to begin tracking.</div>
      </div>
      <button
        type="button"
        className="onboarding-card__btn"
        onClick={() => {
          nextStep();
          navigate('/library');
        }}
      >
        Add your first book <MoveRight size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}

