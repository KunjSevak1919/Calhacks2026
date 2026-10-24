import requests

import api_client


class _FakeResponse:
    def __init__(self, status_code=200, json_data=None):
        self.status_code = status_code
        self.ok = status_code < 400
        self._json_data = json_data or {}

    def json(self):
        return self._json_data


def test_connection_error_raises_api_error(monkeypatch):
    def boom(method, url, timeout=None, **kw):
        raise requests.exceptions.ConnectionError("refused")

    monkeypatch.setattr(api_client.requests, "request", boom)
    try:
        api_client.health()
        assert False, "expected ApiError"
    except api_client.ApiError as e:
        assert "Can't reach" in str(e)


def test_404_raises_api_error_with_status(monkeypatch):
    monkeypatch.setattr(api_client.requests, "request",
                         lambda method, url, timeout=None, **kw: _FakeResponse(status_code=404))
    try:
        api_client.impact()
        assert False, "expected ApiError"
    except api_client.ApiError as e:
        assert e.status_code == 404


def test_success_returns_json(monkeypatch):
    monkeypatch.setattr(api_client.requests, "request",
                         lambda method, url, timeout=None, **kw: _FakeResponse(json_data={"ok": True}))
    assert api_client.health() == {"ok": True}
