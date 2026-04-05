import React, { useMemo, useState } from 'react';
import { Check, LoaderCircle, Upload, UserRound, X } from 'lucide-react';
import api from '../utils/api';
import { UI_THEMES } from '../utils/uiThemes';
import './SettingsPage.css';

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read this file.'));
  reader.readAsDataURL(file);
});

const SettingsPage = ({ uiTheme, onThemeChange, currentUser, onUserUpdate }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [imageFailed, setImageFailed] = useState(false);

  const displayName = useMemo(
    () => currentUser?.name || currentUser?.username || currentUser?.email || 'Reader',
    [currentUser],
  );

  const initials = useMemo(() => {
    const parts = displayName.split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() || '').join('') || 'R';
  }, [displayName]);

  const profileImageUrl = currentUser?.profileImageUrl || '';

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const profileImageData = await readFileAsDataUrl(file);
      const { data } = await api.put('/users/profile/image', { profileImageData });
      onUserUpdate?.(data);
      setImageFailed(false);
      setMessage('Profile image updated.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not upload image right now.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setMessage('');

    try {
      const { data } = await api.delete('/users/profile/image');
      onUserUpdate?.(data);
      setImageFailed(false);
      setMessage('Profile image removed.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not remove image right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-page animate-fade-in">
      <header className="settings-head">
        <h1 className="font-serif">Settings</h1>
        <p>Fine-tune theme and profile identity across the app.</p>
      </header>

      <section className="settings-card glass-panel" aria-label="Theme">
        <div className="settings-kicker">Theme</div>
        <div className="settings-theme-row" role="group" aria-label="Theme switcher">
          {UI_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`settings-theme-option ${uiTheme === theme.id ? 'is-active' : ''}`}
              onClick={() => onThemeChange(theme.id)}
            >
              <span className={`settings-theme-dot theme-${theme.id}`} aria-hidden="true" />
              <span>{theme.label}</span>
              {uiTheme === theme.id ? <Check size={15} aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card glass-panel" aria-label="Profile image">
        <div className="settings-kicker">Profile image</div>
        <div className="settings-profile-row">
          <div className="settings-avatar" aria-hidden="true">
            {profileImageUrl && !imageFailed ? (
              <img src={profileImageUrl} alt="" onError={() => setImageFailed(true)} loading="lazy" />
            ) : (
              <span>{initials}</span>
            )}
          </div>

          <div className="settings-profile-actions">
            <label className={`settings-upload-btn ${busy ? 'is-disabled' : ''}`}>
              {busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}
              <span>{profileImageUrl ? 'Change image' : 'Upload image'}</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={busy} />
            </label>

            <button type="button" className="settings-danger-btn" onClick={handleRemove} disabled={busy || !profileImageUrl}>
              <X size={16} /> Remove
            </button>
            <div className="settings-profile-note"><UserRound size={15} /> Supports JPG, PNG, WEBP, GIF up to 5MB.</div>
          </div>
        </div>
      </section>

      {message ? <p className="settings-message">{message}</p> : null}
    </div>
  );
};

export default SettingsPage;
