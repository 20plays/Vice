import {useState} from 'react';

import {useStore} from '../state/store';
import {api} from '../lib/api';
import {formatDuration} from '../lib/format';
import type {ViewName} from '../lib/types';
import {
  IconAbout,
  IconClips,
  IconDownload,
  IconHelp,
  IconEditor,
  IconHome,
  IconMark,
  IconPlaylist,
  IconSearch,
  IconSettings,
} from './Icons';

const NAV: {view: ViewName; label: string; Icon: typeof IconHome}[] = [
  {view: 'home', label: 'Home', Icon: IconHome},
  {view: 'clips', label: 'All Clips', Icon: IconClips},
  {view: 'editor', label: 'Editor', Icon: IconEditor},
  {view: 'settings', label: 'Settings', Icon: IconSettings},
  {view: 'about', label: 'About', Icon: IconAbout},
];

export function SideNav({
  onShowTutorial,
  onShowUpdate,
}: {
  onShowTutorial: () => void;
  onShowUpdate: () => void;
}) {
  const {state, dispatch, notify} = useStore();
  const {view, currentPlaylistId, searchQuery, playlists, clips, config} = state;
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const buffer = config?.recording?.buffer_duration as number | undefined;

  return (
    <nav className="sidenav" aria-label="Main">
      <div className="sidenav-brand">
        <IconMark size={19} className="sidenav-mark" />
        <span>Vice</span>
      </div>

      <div className="sidenav-search">
        <IconSearch size={15} />
        <input
          type="search"
          value={searchQuery}
          placeholder="Search clips"
          aria-label="Search clips"
          onChange={e => {
            dispatch({type: 'setSearch', query: e.target.value});
            if (e.target.value && view !== 'clips') dispatch({type: 'setView', view: 'clips'});
          }}
        />
      </div>

      <ul className="sidenav-list">
        {NAV.map(({view: target, label, Icon}) => {
          const active = view === target && !(target === 'clips' && currentPlaylistId);
          return (
            <li key={target}>
              <button
                type="button"
                className="nav-item"
                aria-current={active ? 'page' : undefined}
                onClick={() =>
                  dispatch({
                    type: 'setView',
                    view: target,
                    playlistId: target === 'clips' ? null : undefined,
                  })
                }>
                <Icon size={17} />
                <span>{label}</span>
                {target === 'clips' && clips.length > 0 ? (
                  <span className="nav-count">{clips.length}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      {playlists.length > 0 ? (
        <>
          <p className="sidenav-heading">Playlists</p>
          <ul className="sidenav-list sidenav-playlists">
            {playlists.map(playlist => (
              <li key={playlist.id}>
                <button
                  type="button"
                  className="nav-item"
                  data-drop-over={dropTarget === playlist.id || undefined}
                  aria-current={currentPlaylistId === playlist.id ? 'page' : undefined}
                  onDragOver={e => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    setDropTarget(playlist.id);
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => {
                    e.preventDefault();
                    setDropTarget(null);
                    const slug = e.dataTransfer.getData('text/plain');
                    if (!slug) return;
                    void api
                      .addClipToPlaylist(playlist.id, slug)
                      .then(result => {
                        if (result.ok === false) {
                          throw new Error(result.error || 'Could not add the clip');
                        }
                        notify({
                          kind: 'info',
                          title: `Added to ${playlist.name}`,
                          tone: 'accent',
                          holdMs: 3000,
                        });
                      })
                      .catch((err: Error) =>
                        notify({
                          kind: 'error',
                          title: 'Could not add the clip',
                          detail: err.message,
                          tone: 'error',
                          holdMs: 7000,
                        }),
                      );
                  }}
                  onClick={() =>
                    dispatch({type: 'setView', view: 'clips', playlistId: playlist.id})
                  }>
                  <span className="playlist-mark" aria-hidden="true">
                    {playlist.emoji || <IconPlaylist size={14} />}
                  </span>
                  <span className="nav-label">{playlist.name}</span>
                  <span className="nav-count">{playlist.clip_slugs?.length ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="sidenav-foot">
        {state.update?.version ? (
          <button
            type="button"
            className="update-chip"
            onClick={onShowUpdate}
            title={`Vice ${state.update.version} is available`}>
            <IconDownload size={12} />
            <span>Update</span>
          </button>
        ) : null}
        <div className="sidenav-foot-row">
          {buffer ? (
            <>
              <span className="sidenav-foot-key">Buffer</span>
              <span className="sidenav-foot-value">{formatDuration(buffer, true)}</span>
            </>
          ) : null}
          <button
            type="button"
            className="sidenav-help"
            onClick={onShowTutorial}
            title="Quick start"
            aria-label="Quick start">
            <IconHelp size={14} />
          </button>
        </div>
      </div>
    </nav>
  );
}
