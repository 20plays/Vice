from __future__ import annotations

import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock

from vice import tray_app


class TrayActivationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.socket_path = Path(self.tmp.name) / "vice-app.sock"
        self.path_patcher = mock.patch.object(
            tray_app, "APP_COMMAND_SOCKET", self.socket_path
        )
        self.path_patcher.start()

    def tearDown(self) -> None:
        tray_app._stop_command_server()
        self.path_patcher.stop()
        self.tmp.cleanup()

    def test_command_server_forwards_show_request(self) -> None:
        shown = threading.Event()
        server = tray_app._CommandServer(shown.set)
        server.start()
        try:
            self.assertTrue(tray_app._send_show_command())
            self.assertTrue(shown.wait(1.5))
        finally:
            server.close()

    def test_existing_window_activation_prefers_socket_over_wmctrl(self) -> None:
        shown = threading.Event()
        server = tray_app._CommandServer(shown.set)
        server.start()
        try:
            with mock.patch.object(
                tray_app, "_original_raise_existing_window", return_value=False
            ) as fallback:
                self.assertTrue(tray_app._raise_existing_window())
                fallback.assert_not_called()
            self.assertTrue(shown.wait(1.5))
        finally:
            server.close()

    def test_existing_window_activation_falls_back_when_socket_is_absent(self) -> None:
        with mock.patch.object(
            tray_app, "_original_raise_existing_window", return_value=True
        ) as fallback:
            self.assertTrue(tray_app._raise_existing_window())
            fallback.assert_called_once_with()


class TrayShutdownTests(unittest.TestCase):
    def test_shutdown_stops_systemd_owner_then_ipc_and_waits(self) -> None:
        result = mock.Mock(returncode=0, stderr="")
        with mock.patch.object(
            tray_app._app, "_systemd_unit_available", return_value=True
        ), mock.patch.object(
            tray_app.subprocess, "run", return_value=result
        ) as run, mock.patch.object(
            tray_app._app, "_stop_daemon"
        ) as stop, mock.patch.object(
            tray_app._app, "_wait_for_daemon_exit", return_value=True
        ) as wait:
            tray_app._stop_daemon_completely(timeout=0.25)

        run.assert_called_once()
        self.assertEqual(
            run.call_args.args[0],
            ["systemctl", "--user", "stop", "vice.service"],
        )
        stop.assert_called_once_with()
        wait.assert_called_once_with(timeout=0.25)

    def test_shutdown_without_systemd_still_stops_and_waits(self) -> None:
        with mock.patch.object(
            tray_app._app, "_systemd_unit_available", return_value=False
        ), mock.patch.object(
            tray_app.subprocess, "run"
        ) as run, mock.patch.object(
            tray_app._app, "_stop_daemon"
        ) as stop, mock.patch.object(
            tray_app._app, "_wait_for_daemon_exit", return_value=True
        ) as wait:
            tray_app._stop_daemon_completely(timeout=0.25)

        run.assert_not_called()
        stop.assert_called_once_with()
        wait.assert_called_once_with(timeout=0.25)


if __name__ == "__main__":
    unittest.main()
