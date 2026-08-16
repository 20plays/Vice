import {StrictMode, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';

import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/home.css';

import {VICE_THEMES, accentVars} from './theme/viceTheme';
import {StoreProvider, useStore} from './state/store';
import {AppFrame} from './components/AppFrame';
import {Home} from './screens/Home';

function App() {
  const {state} = useStore();
  const {accent, ready, view} = state;

  // The boot cover is in index.html so it paints before this bundle parses.
  // It goes once there is real data behind it, not merely once React mounted.
  useEffect(() => {
    if (!ready) return;
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('boot-done');
    const remove = () => boot.remove();
    boot.addEventListener('transitionend', remove, {once: true});
    // A missed transitionend must not leave an invisible cover over the app.
    const failsafe = window.setTimeout(remove, 1200);
    return () => window.clearTimeout(failsafe);
  }, [ready]);

  return (
    <Theme theme={VICE_THEMES[accent]} mode="dark">
      <div className="vice-ambient" style={accentVars(accent)} aria-hidden="true" />
      <div className="vice-app" style={accentVars(accent)}>
        <AppFrame>
          <Screen view={view} />
        </AppFrame>
      </div>
    </Theme>
  );
}

/** The remaining screens land one per step. */
function Screen({view}: {view: string}) {
  if (view === 'home') return <Home />;

  const titles: Record<string, string> = {
    clips: 'All Clips',
    editor: 'Editor',
    settings: 'Settings',
    about: 'About',
  };
  return (
    <section className="screen-placeholder">
      <h1>{titles[view] ?? view}</h1>
      <p>This screen is next up in the rebuild.</p>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
