import {useState} from 'react';

import {api} from '../lib/api';
import {useStore} from '../state/store';
import {Modal} from '../components/Modal';

/**
 * The first-run quick start. Two pages, and the copy carries the user's own
 * hotkey and clip length rather than the defaults, so nothing on screen is
 * wrong for the person reading it.
 */
export function Tutorial({open, onClose}: {open: boolean; onClose: () => void}) {
  const {state, hotkey} = useStore();
  const [page, setPage] = useState(1);
  const duration = (state.config?.recording?.clip_duration as number | undefined) ?? 20;

  const finish = () => {
    // Stored on the daemon as well as locally: the native window's
    // localStorage does not survive a restart on every QtWebEngine build,
    // which made the tutorial reappear on every launch.
    localStorage.setItem('vice_tutorial_shown', '1');
    void api.setAppState({tutorial_seen: true}).catch(err => {
      console.debug('Recording that the tutorial was seen failed', err);
    });
    setPage(1);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={page === 1 ? 'Start clipping, then let Vice run' : 'Playlists sort the reel'}
      wide
      onClose={finish}
      footer={
        <>
          <span className="tut-dots" aria-hidden="true">
            <i data-active={page === 1 || undefined} />
            <i data-active={page === 2 || undefined} />
          </span>
          {page === 2 ? (
            <button type="button" className="btn btn-quiet" onClick={() => setPage(1)}>
              Back
            </button>
          ) : null}
          {page === 1 ? (
            <button type="button" className="btn" onClick={() => setPage(2)}>
              Next
            </button>
          ) : (
            <button type="button" className="btn" onClick={finish}>
              Got it
            </button>
          )}
        </>
      }>
      {page === 1 ? (
        <>
          <p>
            Vice keeps the buffer live in the background and opens this window only when you need
            it.
          </p>
          <div className="tut-steps">
            <Step badge={hotkey} title={`Save the last ${duration}s`}>
              Press {hotkey} after something worth keeping.
            </Step>
            <Step badge={`·${hotkey}·`} title={`Double-tap ${hotkey} for a session`}>
              Double-tap to start or stop a full recording. Tap once during a session to mark a
              highlight.
            </Step>
            <Step badge="Clip" title="Review, trim and share">
              Open any clip to rename it, trim the best moment, share a link, or press H to add
              highlights.
            </Step>
            <Step badge="BG" title="Close the window safely">
              Minimize or close this window and Vice keeps recording. Discord Rich Presence is on
              by default and lives in Settings.
            </Step>
          </div>
        </>
      ) : (
        <>
          <p>
            Every clip can live in any number of playlists, and they keep themselves in order.
          </p>
          <div className="tut-steps">
            <Step badge="Auto" title="Auto playlists">
              Clips are filed under the game you were playing when you saved them. Vice builds
              these on its own.
            </Step>
            <Step badge="New" title="Custom playlists">
              Create your own from the sidebar, pick an emoji and a colour, then drag clips onto
              it or right-click a clip to add it.
            </Step>
            <Step badge="Safe" title="Nothing goes stale">
              Playlists follow clips through renames and trims, and tidy up after deletions.
            </Step>
          </div>
        </>
      )}
    </Modal>
  );
}

function Step({
  badge,
  title,
  children,
}: {
  badge: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="tut-step">
      <span className="tut-badge mono">{badge}</span>
      <div>
        <b>{title}</b>
        <span>{children}</span>
      </div>
    </div>
  );
}
