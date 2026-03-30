import React from 'react';
import { Check } from 'lucide-react';
import './SettingsPage.css';

const themeOptions = [
  { id: 'light', label: 'Light' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'dark', label: 'Dark' },
];

const SettingsPage = ({ uiTheme, onThemeChange }) => (
  <div className="settings-page animate-fade-in">
    <header className="settings-head">
      <h1 className="font-serif">Settings</h1>
      <p>Keep the interface calm and comfortable for long reading sessions.</p>
    </header>

    <section className="settings-card glass-panel" aria-label="Appearance">
      <div className="settings-kicker">Appearance</div>
      <div className="settings-row" role="group" aria-label="Theme">
        {themeOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`settings-option ${uiTheme === option.id ? 'is-active' : ''}`}
            onClick={() => onThemeChange(option.id)}
          >
            <span>{option.label}</span>
            {uiTheme === option.id && <Check size={16} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  </div>
);

export default SettingsPage;

