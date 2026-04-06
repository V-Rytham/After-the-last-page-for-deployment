import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { updateStoredUser } from '../utils/auth';
import { GENRE_OPTIONS } from '../utils/libraryApi';
import './GenreOnboardingPage.css';

const GenreOnboardingPage = ({ onUserUpdate }) => {
  const navigate = useNavigate();
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggleGenre = (genre) => {
    setSelected((prev) => (
      prev.includes(genre)
        ? prev.filter((item) => item !== genre)
        : [...prev, genre]
    ));
  };

  const submit = async (skip = false) => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/users/preferences/genres', {
        skip,
        preferredGenres: skip ? [] : selected,
      });
      window.dispatchEvent(new Event('library:refresh'));
      const updated = updateStoredUser(data) || data;
      onUserUpdate?.(updated);
      navigate('/library', { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save your preferences right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="genre-onboarding-page animate-fade-in">
      <section className="genre-onboarding-card glass-panel">
        <h1 className="font-serif">Personalize your library</h1>
        <p>Pick a few genres and we&apos;ll build a shelf for you. You can edit this anytime in Profile.</p>

        <div className="genre-chip-cloud" role="listbox" aria-label="Preferred genres" aria-multiselectable="true">
          {GENRE_OPTIONS.map((genre) => {
            const active = selectedSet.has(genre);
            return (
              <button
                key={genre}
                type="button"
                className={`genre-chip ${active ? 'active' : ''}`}
                onClick={() => toggleGenre(genre)}
                aria-pressed={active}
              >
                {genre}
              </button>
            );
          })}
        </div>

        {error ? <div className="genre-onboarding-error">{error}</div> : null}

        <div className="genre-onboarding-actions">
          <button type="button" className="btn-secondary" onClick={() => submit(true)} disabled={saving}>
            Skip
          </button>
          <button type="button" className="btn-primary" onClick={() => submit(false)} disabled={saving || selected.length === 0}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </section>
    </main>
  );
};

export default GenreOnboardingPage;
