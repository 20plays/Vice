import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';

import {api} from '../lib/api';
import {useEscape} from '../lib/escape';
import {useExitTransition} from '../lib/exit';
import {formatBytes} from '../lib/format';
import {DEFAULT_MARK_COLOR, MARK_COLORS} from '../lib/palette';
import {imageTitle, type Image} from '../lib/types';
import {IconClose} from './Icons';
import {InlineRename} from './InlineRename';
import {t} from '../lib/i18n';

/** Pen width in image pixels, so a stroke is the same weight on any monitor. */
const PEN_WIDTH = 6;

interface Stroke {
  color: string;
  /** Image-space points, in pairs. */
  points: {x: number; y: number}[];
}

export interface ImageViewerProps {
  image: Image | null;
  /** Every image in the grid behind, in order, which is what prev and next walk. */
  images: Image[];
  onSelect: (slug: string) => void;
  onClose: () => void;
  onRename: (image: Image, name: string) => void;
  onCopy: (image: Image) => void;
  onReveal: (image: Image) => void;
  onDelete: (image: Image) => void;
  notify: (title: string, detail?: string, tone?: 'accent' | 'error') => void;
}

/**
 * A picture, and a pen over it.
 *
 * The canvas sits at the file's natural resolution and is scaled down by CSS,
 * so a stroke drawn on a 3440 wide screenshot is saved at 3440 wide rather than
 * at whatever size the window happened to be. Strokes are kept as points and
 * redrawn from scratch on every change, which is what makes undo a pop rather
 * than a second layer of bookkeeping.
 */
export function ImageViewer(props: ImageViewerProps) {
  const {images, onSelect, onClose} = props;

  const {mounted, closing} = useExitTransition(props.image !== null, 320);
  const last = useRef(props.image);
  if (props.image) last.current = props.image;
  const image = props.image ?? last.current;

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);

  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(DEFAULT_MARK_COLOR);
  const [pen, setPen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);

  const index = image ? images.findIndex(i => i.slug === image.slug) : -1;
  const open = props.image !== null;
  const dirty = strokes.length > 0;

  // A different picture is a different drawing. Nothing is carried across.
  useEffect(() => {
    setStrokes([]);
    drawing.current = null;
  }, [image?.slug]);

  const step = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = images[index + delta];
      if (next) onSelect(next.slug);
    },
    [images, index, onSelect],
  );

  // The canvas has to match the file, not the element, or every stroke lands
  // scaled and blurred at whatever the window size happened to be.
  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const w = img.naturalWidth || image?.width || 0;
    const h = img.naturalHeight || image?.height || 0;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }, [image?.width, image?.height]);

  useLayoutEffect(sizeCanvas, [sizeCanvas, image?.slug]);

  // Redraw everything, every time. At a handful of strokes this is cheaper
  // than tracking what changed, and it is what makes undo exact.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = PEN_WIDTH;
    for (const stroke of strokes) paintStroke(ctx, stroke);
  }, [strokes]);

  useEscape(open, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setStrokes(list => list.slice(0, -1));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, step]);

  if (!mounted || !image) return null;

  const pointAt = (event: React.PointerEvent): {x: number; y: number} | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const beginStroke = (event: React.PointerEvent) => {
    if (!pen || event.button !== 0) return;
    const at = pointAt(event);
    if (!at) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch (err) {
      // Capture is what keeps a drag that leaves the canvas attached. Losing
      // it costs the tail of one stroke; refusing to draw would cost the lot.
      console.debug('Capturing the pointer failed', err);
    }
    // The stroke is captured in a local, never read back off the ref inside
    // the updater. React can replay a queued updater, and by then pointerup
    // has set the ref to null, which appended a null stroke and took the
    // whole render down with it.
    const stroke: Stroke = {color, points: [at]};
    drawing.current = stroke;
    setStrokes(list => [...list, stroke]);
  };

  const extendStroke = (event: React.PointerEvent) => {
    const stroke = drawing.current;
    if (!stroke) return;
    const at = pointAt(event);
    if (!at) return;
    stroke.points.push(at);
    // The stroke object is mutated in place, so the array identity is what
    // tells React a repaint is due.
    setStrokes(list => [...list]);
  };

  const endStroke = () => {
    drawing.current = null;
  };

  const save = async () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !dirty) return;
    setSaving(true);
    try {
      const flat = document.createElement('canvas');
      flat.width = canvas.width;
      flat.height = canvas.height;
      const ctx = flat.getContext('2d');
      if (!ctx) throw new Error(t('images.errCanvas'));
      ctx.drawImage(img, 0, 0, flat.width, flat.height);
      ctx.drawImage(canvas, 0, 0);
      const png = await new Promise<Blob | null>(resolve => flat.toBlob(resolve, 'image/png'));
      if (!png) throw new Error(t('images.errCanvas'));
      await api.annotateImage(image.slug, png);
      setStrokes([]);
      props.notify(t('images.saved'), undefined, 'accent');
    } catch (err) {
      props.notify(t('images.errSave'), (err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const meta = [
    image.width ? `${image.width}x${image.height}` : '',
    image.size ? formatBytes(image.size) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="scrim viewer-scrim"
      data-closing={closing || undefined}
      onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="viewer-stack">
        <div
          className="modal viewer image-viewer"
          data-closing={closing || undefined}
          role="dialog"
          aria-modal="true"
          aria-label={imageTitle(image)}>
          <header className="viewer-head">
            <div className="viewer-heading">
              {renamingTitle ? (
                <InlineRename
                  className="viewer-rename"
                  label={t('card.nameLabel')}
                  initial={imageTitle(image)}
                  onCancel={() => setRenamingTitle(false)}
                  onSubmit={name => {
                    setRenamingTitle(false);
                    props.onRename(image, name);
                  }}
                />
              ) : (
                <h2 title={t('viewer.doubleClickRename')} onDoubleClick={() => setRenamingTitle(true)}>
                  {imageTitle(image)}
                </h2>
              )}
              <p className="mono">{meta}</p>
            </div>
            {images.length > 1 ? (
              <span className="viewer-count mono">
                {index + 1} / {images.length}
              </span>
            ) : null}
            <button
              type="button"
              className="viewer-nav"
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label={t('images.prev')}>
              <Chevron dir="left" />
            </button>
            <button
              type="button"
              className="viewer-nav"
              onClick={() => step(1)}
              disabled={index < 0 || index >= images.length - 1}
              aria-label={t('images.next')}>
              <Chevron dir="right" />
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label={t('common.close')}>
              <IconClose size={15} />
            </button>
          </header>

          <div className="image-stage">
            <div className="image-frame">
              <img
                ref={imgRef}
                className="image-full"
                src={image.image_url}
                alt={imageTitle(image)}
                draggable={false}
                onLoad={sizeCanvas}
              />
              <canvas
                ref={canvasRef}
                className="image-ink"
                data-pen={pen || undefined}
                onPointerDown={beginStroke}
                onPointerMove={extendStroke}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
              />
            </div>
          </div>

          <div className="viewer-bottom">
            <div className="image-tools">
              <button
                type="button"
                className="btn btn-quiet btn-sm"
                aria-pressed={pen}
                data-active={pen || undefined}
                onClick={() => setPen(on => !on)}>
                {pen ? t('images.penOn') : t('images.pen')}
              </button>

              <div className="image-swatches" role="group" aria-label={t('images.penColour')}>
                {MARK_COLORS.map(swatch => (
                  <button
                    key={swatch}
                    type="button"
                    className="hl-picker-dot"
                    data-active={swatch === color || undefined}
                    style={{background: swatch}}
                    title={swatch}
                    aria-label={t('viewer.useColour', {color: swatch})}
                    onClick={() => {
                      setColor(swatch);
                      setPen(true);
                    }}
                  />
                ))}
              </div>

              <button
                type="button"
                className="btn btn-quiet btn-sm"
                disabled={!dirty}
                onClick={() => setStrokes(list => list.slice(0, -1))}>
                {t('images.undo')}
              </button>
              <button type="button" className="btn btn-sm" disabled={!dirty || saving} onClick={() => void save()}>
                {saving ? t('images.saving') : t('images.saveDrawing')}
              </button>
            </div>

            <footer className="viewer-foot">
              <span className="viewer-shortcuts mono">{t('images.shortcuts')}</span>
              <div className="viewer-foot-btns">
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => props.onCopy(image)}>
                  {t('images.copy')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => props.onReveal(image)}>
                  {t('viewer.reveal')}
                </button>
                <button
                  type="button"
                  className="btn btn-quiet btn-danger btn-sm"
                  onClick={() => props.onDelete(image)}>
                  {t('viewer.delete')}
                </button>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const {points} = stroke;
  if (points.length === 0) return;
  ctx.strokeStyle = stroke.color;
  if (points.length === 1) {
    // A tap is a dot. Without this the pen does nothing until you move it.
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

const Chevron = ({dir}: {dir: 'left' | 'right'}) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true">
    <path d={dir === 'left' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
  </svg>
);
