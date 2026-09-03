"""Desktop launcher additions for Vice on Linux desktops.

The recorder daemon is intentionally independent from the GUI. This launcher
keeps the GUI recoverable when it is minimized or hidden by providing a Qt
system-tray icon and a small per-user Unix socket used to activate the existing
window. The latter replaces the X11-only ``wmctrl`` path on Wayland while
leaving it available as a fallback.
"""

from __future__ import annotations

import os
import socket
import subprocess
import threading
from pathlib import Path
from typing import Any, Callable

from . import app as _app

APP_COMMAND_SOCKET = _app.APP_LOCK_FILE.with_name("vice-app.sock")

_command_server: "_CommandServer | None" = None
_command_server_lock = threading.Lock()


def _send_show_command(timeout: float = 0.75) -> bool:
    """Ask the already-running Vice GUI to restore itself."""
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(timeout)
            sock.connect(str(APP_COMMAND_SOCKET))
            sock.sendall(b"show\n")
        return True
    except OSError as exc:
        _app.log.debug("Could not signal existing Vice window: %s", exc)
        return False


def _raise_existing_window() -> bool:
    """Wayland-safe activation first, then Vice's wmctrl fallback."""
    if _send_show_command():
        _app.log.info("Asked the existing Vice process to restore its window")
        return True
    return _original_raise_existing_window()


class _CommandServer:
    """Tiny local IPC endpoint for second-launch window activation."""

    def __init__(self, show_window: Callable[[], None]) -> None:
        self._show_window = show_window
        self._socket: socket.socket | None = None
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        APP_COMMAND_SOCKET.parent.mkdir(parents=True, exist_ok=True)
        APP_COMMAND_SOCKET.unlink(missing_ok=True)

        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(str(APP_COMMAND_SOCKET))
        os.chmod(APP_COMMAND_SOCKET, 0o600)
        server.listen(4)
        server.settimeout(0.5)
        self._socket = server
        self._thread = threading.Thread(
            target=self._serve,
            name="vice-window-activation",
            daemon=True,
        )
        self._thread.start()
        _app.log.info("Window activation socket ready at %s", APP_COMMAND_SOCKET)

    def _serve(self) -> None:
        assert self._socket is not None
        while not self._stop.is_set():
            try:
                conn, _ = self._socket.accept()
            except socket.timeout:
                continue
            except OSError:
                break

            with conn:
                try:
                    command = conn.recv(64).strip().lower()
                except OSError:
                    continue

            if command == b"show":
                try:
                    self._show_window()
                except Exception:
                    _app.log.exception("Could not restore Vice window")

    def close(self) -> None:
        self._stop.set()
        if self._socket is not None:
            try:
                self._socket.close()
            except OSError:
                pass
            self._socket = None
        APP_COMMAND_SOCKET.unlink(missing_ok=True)


def _request_show(win: Any) -> None:
    """Restore/focus ``win`` through Qt when possible, pywebview otherwise."""
    controller = getattr(win, "_vice_tray_controller", None)
    if controller is not None:
        controller.show_requested.emit()
        return

    # pywebview's Qt backend implements these through Qt signals, so the calls
    # are safe from the activation socket's worker thread as well.
    try:
        win.restore()
    except Exception:
        _app.log.debug("win.restore() failed while activating", exc_info=True)
    try:
        win.show()
    except Exception:
        _app.log.debug("win.show() failed while activating", exc_info=True)


def _request_hide(win: Any) -> None:
    """Hide Vice to its tray instead of destroying the native window."""
    controller = getattr(win, "_vice_tray_controller", None)
    if controller is not None:
        controller.hide_requested.emit()
        return
    try:
        win.hide()
    except Exception:
        _app.log.debug("win.hide() failed", exc_info=True)


def _start_command_server(win: Any) -> None:
    global _command_server
    with _command_server_lock:
        if _command_server is not None:
            return
        server = _CommandServer(lambda: _request_show(win))
        try:
            server.start()
        except OSError as exc:
            _app.log.warning("Could not create window activation socket: %s", exc)
            return
        _command_server = server


def _stop_command_server() -> None:
    global _command_server
    with _command_server_lock:
        server = _command_server
        _command_server = None
    if server is not None:
        server.close()


def _stop_daemon_completely(timeout: float = 10.0) -> None:
    """Stop every Vice recorder owner and wait until it is actually gone."""
    # If the installer created a user service, systemd owns the daemon.
    # Stopping the unit first also suppresses Restart= while this explicit
    # quit is in progress. The IPC stop below remains a fallback for a
    # daemon that was launched directly or escaped the unit.
    if _app._systemd_unit_available():
        try:
            result = subprocess.run(
                ["systemctl", "--user", "stop", "vice.service"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=15,
                check=False,
            )
            if result.returncode != 0:
                _app.log.warning(
                    "systemctl stop vice.service failed (%s): %s",
                    result.returncode,
                    (result.stderr or "").strip()[:200],
                )
        except (OSError, subprocess.SubprocessError) as exc:
            _app.log.warning("Could not stop Vice systemd service: %s", exc)

    _app._stop_daemon()
    _app._wait_for_daemon_exit(timeout=timeout)


def _request_quit(win: Any) -> None:
    """Request a real application quit instead of a hide-to-tray close."""
    controller = getattr(win, "_vice_tray_controller", None)
    if controller is not None:
        controller.quit_requested.emit()
        return

    # Non-Qt fallback. This may block briefly, but it guarantees that an
    # explicit Quit does not leave the recorder/hotkey daemon behind.
    _stop_daemon_completely()
    try:
        win.destroy()
    except Exception:
        _app.log.debug("win.destroy() failed during quit", exc_info=True)


def _tray_icon(QIcon: Any) -> Any:
    """Load Vice's own logo, never a theme substitute, when it is available."""
    candidates = (
        Path.home() / ".local/share/icons/hicolor/scalable/apps/vice.svg",
        Path(__file__).resolve().parent.parent / "assets/vice.svg",
    )
    for path in candidates:
        if path.exists():
            icon = QIcon(str(path))
            if not icon.isNull():
                _app.log.debug("Using Vice tray icon from %s", path)
                return icon

    # Last-resort fallback for unusual package layouts where neither copy of
    # the official asset exists. KDE themes can map unknown names to a generic
    # file icon, so this deliberately comes after the real Vice SVG paths.
    return QIcon.fromTheme("vice")


def _install_tray(native: Any, win: Any) -> None:
    """Install a QSystemTrayIcon on pywebview's native QMainWindow."""
    from qtpy import QtCore
    from qtpy.QtGui import QIcon
    from qtpy.QtWidgets import QMenu, QSystemTrayIcon

    class _TrayController(QtCore.QObject):
        show_requested = QtCore.Signal()
        hide_requested = QtCore.Signal()
        quit_requested = QtCore.Signal()
        quit_finished = QtCore.Signal()

        def __init__(self) -> None:
            super().__init__(native)
            self._allow_close = False
            self._quitting = False
            self.show_requested.connect(self.show_window)
            self.hide_requested.connect(self.hide_window)
            self.quit_requested.connect(self.quit_vice)
            self.quit_finished.connect(self._finish_quit)
            native.installEventFilter(self)

        def eventFilter(self, watched: Any, event: Any) -> bool:
            # The window-manager X button is another way of saying
            # "keep Vice running in the tray". Consume the native close
            # event so pywebview cannot destroy the QMainWindow/tray.
            if (
                watched is native
                and event.type() == QtCore.QEvent.Type.Close
                and not self._allow_close
            ):
                event.ignore()
                native.hide()
                return True
            return super().eventFilter(watched, event)

        @QtCore.Slot()
        def show_window(self) -> None:
            native.showNormal()
            native.show()
            native.raise_()
            native.activateWindow()
            handle = native.windowHandle()
            if handle is not None:
                try:
                    handle.requestActivate()
                except Exception:
                    pass

        @QtCore.Slot()
        def hide_window(self) -> None:
            native.hide()

        @QtCore.Slot()
        def quit_vice(self) -> None:
            if self._quitting:
                return
            self._quitting = True
            threading.Thread(
                target=self._shutdown_worker,
                name="vice-tray-quit",
                daemon=True,
            ).start()

        def _shutdown_worker(self) -> None:
            try:
                _stop_daemon_completely()
            except Exception:
                _app.log.exception("Could not fully stop Vice during tray quit")
            finally:
                self.quit_finished.emit()

        @QtCore.Slot()
        def _finish_quit(self) -> None:
            # Only an explicit Quit gets permission to pass through the
            # close-event filter. Hide the tray first so it disappears
            # immediately when the native window exits.
            self._allow_close = True
            tray = getattr(native, "_vice_tray", None)
            if tray is not None:
                tray.hide()
            native.close()

    controller = _TrayController()
    icon = _tray_icon(QIcon)
    if icon.isNull():
        icon = native.windowIcon()
    else:
        # Keep the native window and tray consistent with the official asset.
        native.setWindowIcon(icon)

    menu = QMenu(native)
    open_action = menu.addAction("Open Vice")
    open_action.triggered.connect(controller.show_window)
    menu.addSeparator()
    quit_action = menu.addAction("Quit Vice")
    quit_action.triggered.connect(controller.quit_vice)

    tray = QSystemTrayIcon(icon, native)
    tray.setToolTip("Vice")
    tray.setContextMenu(menu)

    def _activated(reason: Any) -> None:
        reasons = QSystemTrayIcon.ActivationReason
        if reason in (reasons.Trigger, reasons.DoubleClick):
            controller.show_window()

    tray.activated.connect(_activated)
    tray.show()

    # Keep Python references for the life of the native window. Without these,
    # PyQt may collect the menu/controller even though Qt owns the C++ objects.
    native._vice_tray = tray
    native._vice_tray_menu = menu
    native._vice_tray_controller = controller
    native._vice_tray_activated = _activated
    win._vice_tray_controller = controller

    if QSystemTrayIcon.isSystemTrayAvailable():
        _app.log.info("Vice system tray icon enabled")
    else:
        _app.log.warning(
            "Qt reports no system-tray host; second-launch activation still works"
        )


def _install_qt_backend_patch() -> None:
    """Attach the tray while pywebview creates its Qt QMainWindow."""
    import webview.platforms.qt as qt_backend  # type: ignore[import]

    BrowserView = qt_backend.BrowserView
    if getattr(BrowserView, "_vice_tray_patch", False):
        return

    original_init = BrowserView.__init__

    def _patched_init(self: Any, window: Any) -> None:
        original_init(self, window)
        try:
            _install_tray(self, window)
        except Exception:
            # A tray failure must never prevent the clipper UI from opening.
            _app.log.exception("Could not initialize the Vice system tray icon")

    BrowserView.__init__ = _patched_init
    BrowserView._vice_tray_patch = True


def _install_webview_hooks() -> None:
    """Patch pywebview at its public launcher seam without forking pywebview."""
    try:
        import webview  # type: ignore[import]
    except ImportError:
        return

    if getattr(webview, "_vice_tray_hooks", False):
        return

    original_create_window = webview.create_window
    original_start = webview.start

    def _create_window(*args: Any, **kwargs: Any) -> Any:
        win = original_create_window(*args, **kwargs)
        api = kwargs.get("js_api")
        if api is not None and hasattr(api, "keep_running"):
            # Vice's native "minimize" control used to destroy the window.
            # Hiding it keeps this process (and therefore the tray icon) alive.
            api.keep_running = lambda: _request_hide(win)
        if api is not None and hasattr(api, "quit_app"):
            # Route the in-app Quit control through the exact same verified
            # shutdown path as the tray menu.
            api.quit_app = lambda: _request_quit(win)
        _start_command_server(win)
        return win

    def _start(*args: Any, **kwargs: Any) -> Any:
        if kwargs.get("gui") == "qt":
            try:
                _install_qt_backend_patch()
            except Exception:
                _app.log.exception("Could not install Qt tray integration")
        return original_start(*args, **kwargs)

    webview.create_window = _create_window
    webview.start = _start
    webview._vice_tray_hooks = True


_original_raise_existing_window = _app._raise_existing_window


def main() -> None:
    _app._raise_existing_window = _raise_existing_window
    _install_webview_hooks()
    try:
        _app.main()
    finally:
        _stop_command_server()


if __name__ == "__main__":
    main()
