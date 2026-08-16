import {useStore} from '../state/store';
import {formatDuration} from '../lib/format';
import type {ViewName} from '../lib/types';
import {
  IconAbout,
  IconClips,
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

export function SideNav() {
  const {state, dispatch} = useStore();
  const {view, currentPlaylistId, searchQuery, playlists, clips, config} = state;

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
                  aria-current={currentPlaylistId === playlist.id ? 'page' : undefined}
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
        {buffer ? (
          <>
            <span className="sidenav-foot-key">Buffer</span>
            <span className="sidenav-foot-value">{formatDuration(buffer, true)}</span>
          </>
        ) : null}
      </div>
    </nav>
  );
}
