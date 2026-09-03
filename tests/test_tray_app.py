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


if __name__ == "__main__":
    unittest.main()
