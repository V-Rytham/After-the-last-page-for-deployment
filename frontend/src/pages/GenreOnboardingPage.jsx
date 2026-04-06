import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { updateStoredUser } from '../utils/auth';
import GenreSelector from '../components/profile/GenreSelector';
import { writeSelectedGenres } from '../utils/genrePreferences';
import './GenreOnboardingPage.css';

const normalizeGenre = (value) => String(value || '').trim().toLowerCase();

export default function GenreOnboardingPage({ onUserUpdate }) {
  const navigate = useNavigate();
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const normalized = Array.from(new Set(selectedGenres.map(normalizeGenre).filter(Boolean)));
    if (normalized.length === 0) return;

    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/users/preferences/genres', { preferredGenres: normalized });
      const updated = updateStoredUser(data) || data;
      onUserUpdate?.(updated);
      writeSelectedGenres(normalized);
      navigate('/library', { replace: true });
    } catch (requestError) {
      setError(requestError?.uiMessage || requestError.response?.data?.message || 'Could not save your preferences right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="genre-onboarding-page animate-fade-in">
      <section className="genre-onboarding-card glass-panel">
        <h1 className="font-serif">Personalize your library</h1>
        <p>Pick a few genres and your library will curate instantly. You can edit this anytime in Profile.</p>

        <div className="genre-chip-cloud" role="listbox" aria-label="Preferred genres" aria-multiselectable="true">
          <GenreSelector selectedGenres={selectedGenres} onChange={setSelectedGenres} disabled={saving} />
        </div>

        {error ? <div className="genre-onboarding-error">{error}</div> : null}

        <div className="genre-onboarding-actions">
          <button type="button" className="btn-primary" onClick={submit} disabled={saving || selectedGenres.length === 0}>
            {saving ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </section>
    </main>
  );
}

