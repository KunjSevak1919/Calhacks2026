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


# ---------- distinguishing "route doesn't exist" from "that specific id
# wasn't found" -- confirmed live against the real server: approving an
# already-approved notification returns 404 with a JSON {"error": ...} body
# (Content-Type: application/json), while a truly missing route (e.g.
# /api/pay on this branch) returns Flask's default HTML 404 page, no JSON. ----------

class _HtmlNotFoundResponse:
    """Flask's default 404 for an unmatched route: HTML, not JSON."""
    status_code = 404
    ok = False

    def json(self):
        raise ValueError("No JSON object could be decoded")


def test_404_with_json_error_body_is_friendly_not_found(monkeypatch):
    monkeypatch.setattr(
        api_client.requests, "request",
        lambda method, url, timeout=None, **kw: _FakeResponse(
            status_code=404, json_data={"error": "No notification called due-aurum"}))
    try:
        api_client.approve_notification("due-aurum")
        assert False, "expected ApiError"
    except api_client.ApiError as e:
        assert e.not_found is True
        assert "isn't available on this server yet" not in str(e)
        assert "already be done" in str(e)


def test_404_missing_route_is_not_marked_not_found(monkeypatch):
    monkeypatch.setattr(api_client.requests, "request",
                         lambda method, url, timeout=None, **kw: _HtmlNotFoundResponse())
    try:
        api_client.pay(merchant="Whole Foods", amount=10)
        assert False, "expected ApiError"
    except api_client.ApiError as e:
        assert e.not_found is False
        assert "isn't available on this server yet" in str(e)


def test_error_without_not_found_kwarg_defaults_false():
    assert api_client.ApiError("boom").not_found is False


def test_pick_timeout_retries_once_without_claude_explanation(monkeypatch):
    bodies = []

    def slow_then_fast(method, url, timeout=None, json=None, **kw):
        bodies.append(dict(json))
        if json.get("explain"):
            raise requests.exceptions.ReadTimeout("slow")
        return _FakeResponse(json_data={"reason": "template"})

    monkeypatch.setattr(api_client.requests, "request", slow_then_fast)
    assert api_client.pick(merchant="Whole Foods", amount=84.5) == {"reason": "template"}
    assert [b["explain"] for b in bodies] == [True, False]
    assert bodies[1]["merchant"] == "Whole Foods" and bodies[1]["amount"] == 84.5


def test_pick_connection_error_is_not_retried(monkeypatch):
    calls = []

    def refused(method, url, timeout=None, **kw):
        calls.append(1)
        raise requests.exceptions.ConnectionError("refused")

    monkeypatch.setattr(api_client.requests, "request", refused)
    try:
        api_client.pick(merchant="Target", amount=10)
        assert False, "expected ApiError"
    except api_client.ApiError as e:
        assert "Can't reach" in str(e)
    assert calls == [1]
