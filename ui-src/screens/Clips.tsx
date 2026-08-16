import {useState} from 'react';

import {useStore} from '../state/store';
import {api} from '../lib/api';
import {copyToClipboard} from '../lib/clipboard';
import {clipTitle, type Clip} from '../lib/types';
import {ClipCard, type ClipActions} from '../components/ClipCard';
import {ContextMenu} from '../components/ContextMenu';
import {PlaylistModal, type PlaylistDraft} from '../components/PlaylistModal';
import {Modal} from '../components/Modal';
import {IconWarning} from '../components/Icons';

export function Clips() {
  const {state, dispatch, visibleClips, hotkey, notify, refreshPlaylists, refreshClips} =
    useStore();
  const {playlists, currentPlaylistId, searchQuery, recentNew, status, config} = state;

  const playlist = currentPlaylistId
    ? (playlists.find(p => p.id === currentPlaylistId) ?? null)
    : null;

  const [menu, setMenu] = useState<{clip: Clip; at: {x: number; y: number}} | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<'new' | 'edit' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Clip | null>(null);
  const [confirmPlaylistDelete, setConfirmPlaylistDelete] = useState(false);
  const [manualCopy, setManualCopy] = useState<string | null>(null);

  const fail = (title: string) => (err: Error) =>
    notify({kind: 'error', title, detail: err.message, tone: 'error', holdMs: 7000});

  const actions: ClipActions = {
    onTrim: clip => notify({kind: 'info', title: 'The trim editor lands next', detail: clipTitle(clip), tone: 'neutral', holdMs: 3000}),
    onOpen: clip => notify({kind: 'info', title: 'The viewer lands next', detail: clipTitle(clip), tone: 'neutral', holdMs: 3000}),
    onReveal: clip => void api.revealClip(clip.slug).catch(fail('Could not open the file manager')),
    onCopyFile: clip =>
      void api
        .copyClipFile(clip.slug)
        .then(() => notify({kind: 'info', title: 'Video copied, paste it anywhere', tone: 'accent', holdMs: 3500}))
        .catch(fail('Could not copy the video')),
    onCopyLink: clip => {
      if (!clip.share_url) return;
      void copyToClipboard(clip.share_url).then(ok => {
        if (!ok) {
          setManualCopy(clip.share_url);
          return;
        }
        // A LAN address looks identical to a real share link until a friend
        // tries to open it and cannot (#105).
        if (clip.share_is_public === false) {
          notify({
            kind: 'info',
            title: 'Link copied, but it is local only',
            detail: 'Install cloudflared for links that work off your network',
            tone: 'neutral',
            holdMs: 8000,
          });
        } else {
          notify({kind: 'info', title: 'Share link copied', tone: 'accent', holdMs: 3000});
        }
      });
    },
    onDelete: clip => setConfirmDelete(clip),
    onRename: async (clip, name) => {
      try {
        const updated = await api.renameClip(clip.slug, name);
        await refreshClips();
        if (updated?.name && clipTitle(updated) !== name) {
          // Punctuation is normalised server side, so say what landed on disk.
          notify({kind: 'info', title: `Saved as ${clipTitle(updated)}`, tone: 'neutral', holdMs: 4000});
        }
      } catch (err) {
        fail('Rename failed')(err as Error);
      }
    },
    onContextMenu: (clip, at) => setMenu({clip, at}),
  };

  const submitPlaylist = async (draft: PlaylistDraft) => {
    if (editingPlaylist === 'edit' && playlist) {
      const result = await api.updatePlaylist(playlist.id, draft);
      if (result.ok === false) throw new Error(result.error || 'Could not update the playlist');
      await refreshPlaylists();
      notify({kind: 'info', title: 'Playlist updated', tone: 'accent', holdMs: 3000});
    } else {
      const result = await api.createPlaylist(draft);
      if (result.ok === false) throw new Error(result.error || 'Could not create the playlist');
      await refreshPlaylists();
      dispatch({type: 'setView', view: 'clips', playlistId: result.playlist.id});
      notify({kind: 'info', title: `Playlist "${draft.name}" created`, tone: 'accent', holdMs: 3500});
    }
    setEditingPlaylist(null);
  };

  const title = playlist ? playlist.name : 'All Clips';
  const count = visibleClips.length;
  const subtitle = searchQuery.trim()
    ? `${count} match${count === 1 ? '' : 'es'} for "${searchQuery.trim()}"`
    : `${count} clip${count === 1 ? '' : 's'}`;

  return (
    <div className="clips">
      <header className="clips-head">
        <div className="clips-title">
          <h1>
            {playlist?.emoji ? <span className="clips-emoji">{playlist.emoji}</span> : null}
            {title}
          </h1>
          <p>{subtitle}</p>
        </div>

        <div className="clips-tools">
          {playlist && playlist.kind !== 'auto' ? (
            <>
              <button type="button" className="btn btn-quiet" onClick={() => setEditingPlaylist('edit')}>
                Edit playlist
              </button>
              <button
                type="button"
                className="btn btn-quiet btn-danger"
                onClick={() => setConfirmPlaylistDelete(true)}>
                Delete playlist
              </button>
            </>
          ) : null}
          <button type="button" className="btn btn-quiet" onClick={() => setEditingPlaylist('new')}>
            New playlist
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void api.triggerClip().catch(fail('Could not save a clip'))}>
            Save clip
          </button>
        </div>
      </header>

      {status.hotkeys_available === false ? (
        <div className="banner" data-tone="warning" role="status">
          <IconWarning size={17} className="banner-icon" />
          <div className="banner-text">
            <strong>Global hotkeys are not available.</strong>
            <span>
              Vice cannot read your keyboard, so {hotkey} will not save a clip. The Save clip button
              above still works. Adding your user to the input group and logging back in usually
              fixes it.
            </span>
          </div>
        </div>
      ) : null}

      {count === 0 ? (
        <p className="home-empty">
          {searchQuery.trim()
            ? `Nothing matches "${searchQuery.trim()}".`
            : playlist
              ? 'This playlist is empty. Drag a clip onto it, or right-click a clip to add it.'
              : `No clips yet. Press ${hotkey} to save the last ${config?.recording?.clip_duration ?? 20} seconds.`}
        </p>
      ) : (
        <div className="clip-grid">
          {visibleClips.map(clip => (
            <ClipCard
              key={clip.slug}
              clip={clip}
              draggable
              isNew={recentNew.includes(clip.slug)}
              actions={actions}
            />
          ))}
        </div>
      )}

      {menu ? (
        <ContextMenu
          at={menu.at}
          heading="Add to playlist"
          emptyLabel="No playlists yet"
          onClose={() => setMenu(null)}
          items={playlists.map(p => ({
            id: p.id,
            label: p.name,
            mark: p.emoji ?? undefined,
            onSelect: () => {
              const slug = menu.clip.slug;
              void api
                .addClipToPlaylist(p.id, slug)
                .then(result => {
                  if (result.ok === false) throw new Error(result.error || 'Could not add the clip');
                  notify({kind: 'info', title: `Added to ${p.name}`, tone: 'accent', holdMs: 3000});
                })
                .catch(fail('Could not add the clip'));
            },
          }))}
        />
      ) : null}

      <PlaylistModal
        open={editingPlaylist !== null}
        editing={editingPlaylist === 'edit' ? playlist : null}
        onClose={() => setEditingPlaylist(null)}
        onSubmit={submitPlaylist}
      />

      <Modal
        open={confirmDelete !== null}
        title="Delete this clip?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setConfirmDelete(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => {
                const clip = confirmDelete;
                setConfirmDelete(null);
                if (!clip) return;
                void api
                  .deleteClip(clip.slug)
                  .then(() => notify({kind: 'info', title: 'Clip deleted', tone: 'neutral', holdMs: 3000}))
                  .catch(fail('Could not delete the clip'));
              }}>
              Delete
            </button>
          </>
        }>
        <p>
          {confirmDelete ? clipTitle(confirmDelete) : ''} will be removed from disk. This cannot be
          undone.
        </p>
      </Modal>

      <Modal
        open={confirmPlaylistDelete}
        title="Delete this playlist?"
        onClose={() => setConfirmPlaylistDelete(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => setConfirmPlaylistDelete(false)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger-solid"
              onClick={() => {
                setConfirmPlaylistDelete(false);
                if (!playlist) return;
                void api
                  .deletePlaylist(playlist.id)
                  .then(async () => {
                    await refreshPlaylists();
                    dispatch({type: 'setView', view: 'clips', playlistId: null});
                    notify({kind: 'info', title: 'Playlist deleted', tone: 'neutral', holdMs: 3000});
                  })
                  .catch(fail('Could not delete the playlist'));
              }}>
              Delete
            </button>
          </>
        }>
        <p>The clips themselves stay put. Only the playlist goes.</p>
      </Modal>

      <Modal open={manualCopy !== null} title="Copy this link" onClose={() => setManualCopy(null)}>
        <p>The clipboard was not available, so here is the link to copy by hand.</p>
        <textarea className="manual-copy" readOnly value={manualCopy ?? ''} rows={3} />
      </Modal>
    </div>
  );
}
