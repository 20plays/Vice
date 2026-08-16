import {useRef, useState} from 'react';

import {formatBytes, formatDuration} from '../lib/format';
import {clipTitle, type Clip} from '../lib/types';
import {H264_SUPPORTED} from '../lib/env';

/**
 * A clip in the grid. Hovering plays a muted preview, loaded lazily so a
 * library of hundreds does not fetch every file on render.
 *
 * An unreadable clip reports a placeholder 1920x1080 and a zero duration, so
 * neither is worth showing. It says what is actually wrong instead, and the
 * file is left alone on disk (#154).
 */
export function ClipCard({
  clip,
  isNew,
  onOpen,
}: {
  clip: Clip;
  isNew?: boolean;
  onOpen?: (clip: Clip) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const broken = clip.unreadable;
  const canPreview = H264_SUPPORTED && !broken && !previewFailed && Boolean(clip.thumb_url);

  const startPreview = () => {
    const video = videoRef.current;
    if (!video || !canPreview) return;
    if (!video.src) video.src = clip.video_url;
    void video.play().catch(() => setPreviewFailed(true));
  };

  const stopPreview = () => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = 0;
  };

  const meta = [
    clip.created_at
      ? new Date(clip.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    !broken && clip.width ? `${clip.width}x${clip.height}` : '',
    clip.size ? formatBytes(clip.size) : '',
    clip.views ? `${clip.views} view${clip.views === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="clip-card" data-broken={broken || undefined}>
      <button
        type="button"
        className="clip-thumb"
        onClick={() => onOpen?.(clip)}
        onPointerEnter={startPreview}
        onPointerLeave={stopPreview}
        aria-label={`Open ${clipTitle(clip)}`}>
        {clip.thumb_url ? (
          <img src={clip.thumb_url} loading="lazy" alt="" draggable={false} />
        ) : (
          <span className="clip-thumb-empty" aria-hidden="true" />
        )}
        {canPreview ? (
          <video
            ref={videoRef}
            className="clip-preview"
            muted
            loop
            playsInline
            preload="none"
            onError={() => setPreviewFailed(true)}
          />
        ) : null}

        <span className="clip-badges">
          {broken ? (
            <span className="clip-badge clip-badge-broken" title={clip.unreadable_reason}>
              Unreadable
            </span>
          ) : null}
          {isNew ? <span className="clip-badge clip-badge-new">New</span> : null}
        </span>

        {clip.duration && !broken ? (
          <span className="clip-duration">{formatDuration(Math.round(clip.duration), true)}</span>
        ) : null}
      </button>

      <div className="clip-body">
        <h3 className="clip-name" title={clipTitle(clip)}>
          {clipTitle(clip)}
        </h3>
        <p className="clip-meta">{broken ? clip.unreadable_reason || 'ffmpeg could not read this file' : meta}</p>
        {clip.game ? <span className="clip-game">{clip.game}</span> : null}
      </div>
    </article>
  );
}
