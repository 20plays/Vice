import {useMemo, useState} from 'react';

import {useStore} from '../state/store';
import {usePlayback} from '../state/playback';
import {api} from '../lib/api';
import {copyToClipboard} from '../lib/clipboard';
import {formatDuration} from '../lib/format';
import {ClipCard} from '../components/ClipCard';
import {Tile, ActionTile} from '../components/Tile';
import {Modal} from '../components/Modal';
import {IconClips, IconPlaylist, IconSettings} from '../components/Icons';

const ROW_LIMIT = 8;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const {state, dispatch, hotkey, saveConfig, notify} = useStore();
  const {clips, playlists, config, tunnelUrl, recentNew, status} = state;

  const [busy, setBusy] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [wfMicPrompt, setWfMicPrompt] = useState(false);

  const clipDuration = (config?.recording?.clip_duration as number | undefined) ?? 20;
  const captureAudio = config?.recording?.capture_audio !== false;
  const captureMic = Boolean(config?.recording?.capture_microphone);
  const tunnelOn = Boolean(config?.sharing?.cloudflare_tunnel);

  const recent = useMemo(() => clips.slice(0, ROW_LIMIT), [clips]);
  const mostViewed = useMemo(
    () =>
      clips
        .filter(c => (c.views ?? 0) > 0)
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, ROW_LIMIT),
    [clips],
  );

  /**
   * wf-recorder cannot mix a microphone in without being told how, so asking
   * first is the only way to avoid silently recording the wrong thing.
   */
  const micNeedsWfChoice =
    !captureMic &&
    captureAudio &&
    (config?.recording?.wf_microphone_strategy ?? 'prompt') === 'prompt' &&
    ((config?.recording?.backend as string) === 'wf-recorder' || status.backend === 'wf-recorder');

  const toggle = async (
    key: string,
    patch: Record<string, Record<string, unknown>>,
    onOk: (result: {restart_required?: boolean; applied?: boolean; warning?: string}) => void,
    failure: string,
  ) => {
    setBusy(key);
    try {
      const result = await saveConfig(patch);
      if (result.applied === false && result.warning) {
        notify({kind: 'error', title: 'Saved, but not applied', detail: result.warning, tone: 'error', holdMs: 8000});
      } else {
        onOk(result);
      }
      if (result.restart_required) setRestartNeeded(true);
    } catch (err) {
      notify({kind: 'error', title: failure, detail: (err as Error).message, tone: 'error', holdMs: 7000});
    } finally {
      setBusy(null);
    }
  };

  const setMic = (enabled: boolean, strategy?: string) =>
    toggle(
      'mic',
      {recording: {capture_microphone: enabled, ...(strategy ? {wf_microphone_strategy: strategy} : {})}},
      () =>
        notify({
          kind: 'info',
          title: enabled ? 'Microphone on' : 'Microphone off',
          detail: enabled ? 'Included in new clips' : 'Removed from new clips',
          tone: 'accent',
          holdMs: 3000,
        }),
      'Could not change the microphone setting',
    );

  const copyTunnel = async () => {
    if (!tunnelUrl) {
      notify({kind: 'error', title: 'Enable the public link first', tone: 'error', holdMs: 4000});
      return;
    }
    if (await copyToClipboard(tunnelUrl)) {
      notify({kind: 'info', title: 'Public link copied', tone: 'accent', holdMs: 3000});
    } else {
      setManualCopy(tunnelUrl);
    }
  };

  return (
    <div className="home">
      <header className="home-hero">
        <h1>{greeting()}</h1>
        <p>
          The last <b>{formatDuration(clipDuration, true)}</b> of your gameplay are always in the
          buffer. Press <kbd>{hotkey}</kbd> to keep them. Double-tap to start a session.
        </p>
      </header>

      <section className="tiles" aria-label="Quick settings">
        <div className="tile-row tile-row-2">
          <Tile
            label="Microphone"
            detail={captureMic ? 'On' : 'Off'}
            on={captureMic}
            busy={busy === 'mic'}
            icon={<MicIcon />}
            onToggle={() => {
              if (micNeedsWfChoice) setWfMicPrompt(true);
              else void setMic(!captureMic);
            }}
          />
          <Tile
            label="Desktop audio"
            detail={captureAudio ? 'On' : 'Off'}
            on={captureAudio}
            busy={busy === 'audio'}
            icon={<SpeakerIcon />}
            onToggle={() =>
              void toggle(
                'audio',
                {recording: {capture_audio: !captureAudio}},
                () =>
                  notify({
                    kind: 'info',
                    title: !captureAudio ? 'Desktop audio on' : 'Desktop audio off',
                    tone: 'accent',
                    holdMs: 3000,
                  }),
                'Could not change desktop audio',
              )
            }
          />
        </div>

        <div className="tile-row tile-row-2">
          <Tile
            label="Public link"
            detail={tunnelOn ? (tunnelUrl ? 'Active' : 'Starting') : 'Off'}
            on={tunnelOn}
            busy={busy === 'tunnel'}
            icon={<GlobeIcon />}
            onToggle={() =>
              void toggle(
                'tunnel',
                {sharing: {cloudflare_tunnel: !tunnelOn}},
                () =>
                  notify({
                    kind: 'info',
                    title: !tunnelOn ? 'Public link starting' : 'Public link stopped',
                    tone: 'accent',
                    holdMs: 3500,
                  }),
                'Could not change the public link',
              )
            }
          />
          <button
            type="button"
            className="tile tile-readout"
            onClick={copyTunnel}
            aria-label="Copy the public link">
            <span className="tile-badge" aria-hidden="true">
              <GlobeIcon />
            </span>
            <span className="tile-text">
              <b>
                {tunnelUrl
                  ? 'Copy public link'
                  : tunnelOn
                    ? 'Public link starting'
                    : 'No public link'}
              </b>
              <span className="tile-mono">
                {tunnelUrl ??
                  (tunnelOn
                    ? 'Waiting for cloudflared'
                    : 'Share links stay on your network')}
              </span>
            </span>
          </button>
        </div>

        <div className="tile-row tile-row-3">
          <ActionTile
            label="Save clip now"
            icon={<ClipIcon />}
            onClick={() => {
              void api.triggerClip().catch((err: Error) =>
                notify({kind: 'error', title: 'Could not save a clip', detail: err.message, tone: 'error', holdMs: 7000}),
              );
            }}
          />
          <ActionTile
            label="All clips"
            icon={<IconClips size={19} />}
            onClick={() => dispatch({type: 'setView', view: 'clips', playlistId: null})}
          />
          <ActionTile
            label="Settings"
            icon={<IconSettings size={19} />}
            onClick={() => dispatch({type: 'setView', view: 'settings'})}
          />
        </div>
      </section>

      <ClipRow
        title="Recent clips"
        action={{label: 'See all', onClick: () => dispatch({type: 'setView', view: 'clips', playlistId: null})}}
        clips={recent}
        recentNew={recentNew}
        empty={`No clips yet. Press ${hotkey} to start your reel.`}
      />

      {playlists.length > 0 ? (
        <section className="home-section">
          <div className="home-section-head">
            <h2>Playlists</h2>
          </div>
          <div className="playlist-row">
            {playlists.map(playlist => (
              <button
                key={playlist.id}
                type="button"
                className="playlist-chip"
                style={
                  playlist.color1
                    ? ({'--chip': playlist.color1} as React.CSSProperties)
                    : undefined
                }
                onClick={() => dispatch({type: 'setView', view: 'clips', playlistId: playlist.id})}>
                <span className="playlist-chip-mark" aria-hidden="true">
                  {playlist.emoji || <IconPlaylist size={15} />}
                </span>
                <span className="playlist-chip-text">
                  <b>{playlist.name}</b>
                  <span>
                    {playlist.clip_slugs.length} clip{playlist.clip_slugs.length === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {mostViewed.length > 0 ? (
        <ClipRow title="Most viewed" clips={mostViewed} recentNew={recentNew} />
      ) : null}

      <Modal
        open={wfMicPrompt}
        title="How should the microphone be mixed in?"
        onClose={() => setWfMicPrompt(false)}>
        <p>
          wf-recorder records one audio source at a time. Choose what happens when both the desktop
          and the microphone are on.
        </p>
        <div className="choice-list">
          <button
            type="button"
            className="choice"
            onClick={() => {
              setWfMicPrompt(false);
              void setMic(true, 'mix');
            }}>
            <b>Mix them together</b>
            <span>One track containing the desktop and the microphone.</span>
          </button>
          <button
            type="button"
            className="choice"
            onClick={() => {
              setWfMicPrompt(false);
              void setMic(true, 'mic_only');
            }}>
            <b>Microphone only</b>
            <span>Desktop audio is dropped while the microphone is on.</span>
          </button>
        </div>
      </Modal>

      <Modal
        open={manualCopy !== null}
        title="Copy this link"
        onClose={() => setManualCopy(null)}>
        <p>The clipboard was not available, so here is the link to copy by hand.</p>
        <textarea className="manual-copy" readOnly value={manualCopy ?? ''} rows={3} />
      </Modal>

      <Modal
        open={restartNeeded}
        title="Restart Vice to finish"
        onClose={() => setRestartNeeded(false)}
        footer={
          <button type="button" className="btn" onClick={() => setRestartNeeded(false)}>
            Got it
          </button>
        }>
        <p>That setting is saved, but it only takes effect once the daemon restarts.</p>
      </Modal>
    </div>
  );
}

function ClipRow({
  title,
  clips,
  recentNew,
  action,
  empty,
}: {
  title: string;
  clips: import('../lib/types').Clip[];
  recentNew: string[];
  action?: {label: string; onClick: () => void};
  empty?: string;
}) {
  const {openViewer} = usePlayback();
  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>{title}</h2>
        {action ? (
          <button type="button" className="section-link" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {clips.length === 0 && empty ? (
        <p className="home-empty">{empty}</p>
      ) : (
        <div className="clip-row">
          {clips.map(clip => (
            <ClipCard
              key={clip.slug}
              clip={clip}
              isNew={recentNew.includes(clip.slug)}
              actions={{onOpen: c => openViewer(c.slug)}}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const MicIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
  </svg>
);

const SpeakerIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M17 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const GlobeIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
  </svg>
);

const ClipIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" {...stroke} aria-hidden="true">
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M9 3v6h6" />
  </svg>
);
