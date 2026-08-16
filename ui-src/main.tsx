import {StrictMode, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './styles/base.css';

import {ACCENT_NAMES, DEFAULT_ACCENT, type AccentName} from './theme/accents';
import {VICE_THEMES, accentVars} from './theme/viceTheme';

const ACCENT_KEY = 'vice-theme';

function storedAccent(): AccentName {
  const saved = localStorage.getItem(ACCENT_KEY);
  return ACCENT_NAMES.includes(saved as AccentName) ? (saved as AccentName) : DEFAULT_ACCENT;
}

function App() {
  const [accent, setAccent] = useState<AccentName>(storedAccent);

  return (
    <Theme theme={VICE_THEMES[accent]} mode="dark">
      <div className="vice-ambient" style={accentVars(accent)} aria-hidden="true" />
      <div className="vice-app" style={accentVars(accent)}>
        <ThemeProof accent={accent} onPick={setAccent} />
      </div>
    </Theme>
  );
}

/** Temporary. Replaced by the real app shell in step 2. */
function ThemeProof({accent, onPick}: {accent: AccentName; onPick: (a: AccentName) => void}) {
  return (
    <div style={{padding: 'var(--spacing-6)', display: 'grid', gap: 'var(--spacing-4)'}}>
      <h1 style={{font: 'var(--text-heading-1)', margin: 0}}>Vice</h1>
      <p style={{color: 'var(--color-text-secondary)', margin: 0}}>
        Theme pipeline running. Accent: {accent}
      </p>
      <div style={{display: 'flex', gap: 'var(--spacing-2)'}}>
        {ACCENT_NAMES.map(name => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            aria-label={name}
            aria-pressed={name === accent}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: name === accent ? 'var(--color-accent)' : 'var(--color-background-surface)',
              border: '1px solid var(--color-border-emphasized)',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Fades rather than cuts, and removes the node so it can never trap clicks.
const boot = document.getElementById('boot');
if (boot) {
  boot.classList.add('boot-done');
  boot.addEventListener('transitionend', () => boot.remove(), {once: true});
}
