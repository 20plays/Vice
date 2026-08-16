import type {ReactNode} from 'react';

import {IS_NATIVE, keepRunning, quitVice} from '../lib/env';
import {IconMinimize, IconPower} from './Icons';
import {SideNav} from './SideNav';
import {StatusIsland} from './StatusIsland';
import {Banners} from './Banners';

/** Matches --melt in shell.css. The arcs are drawn at this size. */
const MELT = 32;

/**
 * The window frame: navigation on the left, content on the right, and one
 * divider between them that curves outward at each end.
 *
 * Responsive contract: the full frame above 900px. At 900px and below the
 * navigation collapses to a rail and the melt is dropped, because there is no
 * longer a wide side for the curve to melt into.
 */
export function AppFrame({children}: {children: ReactNode}) {
  return (
    <div className="frame">
      <SideNav />
      <Melt />
      <div className="frame-content">
        <Banners />
        {children}
      </div>
      <StatusIsland />
      {IS_NATIVE ? <QuitRow /> : null}
    </div>
  );
}

/**
 * The divider. Two quarter arcs and a straight run between them.
 *
 * Each arc leaves the frame edge horizontally and arrives at the divider
 * vertically, so the tangents match at both ends and neither joint reads as a
 * corner. The stroke fades out as it approaches the edge, which is what makes
 * it melt rather than simply stop; the tint underneath does not fade, so there
 * is no seam where the navigation surface meets the straight run.
 */
function Melt() {
  return (
    <div className="melt-group" aria-hidden="true">
      <svg width="0" height="0" className="melt-defs">
        <defs>
          <linearGradient id="vice-melt-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".55" stopColor="#fff" stopOpacity=".05" />
            <stop offset="1" stopColor="#fff" stopOpacity=".10" />
          </linearGradient>
        </defs>
      </svg>

      <div className="melt melt-top">
        <MeltArc />
      </div>
      <div className="melt-line" />
      <div className="melt melt-bottom">
        <MeltArc />
      </div>
    </div>
  );
}

function MeltArc() {
  return (
    <svg width={MELT} height={MELT} viewBox={`0 0 ${MELT} ${MELT}`}>
      <path
        d={`M${MELT} 0 A${MELT} ${MELT} 0 0 0 0 ${MELT} L0 0 Z`}
        fill="var(--vice-nav-tint)"
      />
      <path
        d={`M${MELT} 0 A${MELT} ${MELT} 0 0 0 0 ${MELT}`}
        fill="none"
        stroke="url(#vice-melt-fade)"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Native only. Closing the window leaves the daemon recording, which is the
 * point, so the two outcomes are named rather than left to a close button.
 */
function QuitRow() {
  return (
    <div className="quit-row">
      <button type="button" className="quit-btn" onClick={keepRunning}>
        <IconMinimize size={14} />
        <span>Minimize</span>
      </button>
      <button
        type="button"
        className="quit-btn quit-btn-danger"
        onClick={() => {
          if (window.confirm('Stop Vice and quit? The recording daemon will shut down.')) {
            quitVice();
          }
        }}>
        <IconPower size={14} />
        <span>Quit</span>
      </button>
    </div>
  );
}
