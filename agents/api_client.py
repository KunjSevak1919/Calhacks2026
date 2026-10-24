"""Thin wrapper around the Pocket Pilot Flask API.

No money math and no decisions happen here -- every number the agent shows
to a user comes straight from one of these calls. Every function raises
ApiError on failure (timeout, connection refused, non-2xx, or a 404 for an
endpoint that doesn't exist on the current server/ branch) so the caller can
show one clear message instead of crashing.
"""
import os

import requests

DEFAULT_BASE_URL = "http://localhost:5001"
TIMEOUT_SECONDS = 5


class ApiError(Exception):
    """Raised for any Flask API failure: network, timeout, or non-2xx status.

    not_found=True means the route exists but this specific id/resource
    wasn't found (Flask returned a JSON {"error": ...} body) -- most often
    because it was already approved/dismissed. That's different from a
    route that doesn't exist on this server branch at all (Flask's default
    HTML 404 page, no JSON body), which keeps not_found=False.
    """

    def __init__(self, message, status_code=None, not_found=False, timed_out=False):
        super().__init__(message)
        self.status_code = status_code
        self.not_found = not_found
        self.timed_out = timed_out


def _base_url():
    return os.getenv("POCKET_PILOT_API_URL", DEFAULT_BASE_URL).rstrip("/")


def _request(method, path, **kwargs):
    url = f"{_base_url()}{path}"
    try:
        resp = requests.request(method, url, timeout=TIMEOUT_SECONDS, **kwargs)
    except requests.exceptions.ConnectionError as exc:
        raise ApiError(f"Can't reach Pocket Pilot's server at {url}.") from exc
    except requests.exceptions.Timeout as exc:
        raise ApiError(f"Pocket Pilot's server timed out at {url}.", timed_out=True) from exc
    except requests.exceptions.RequestException as exc:
        raise ApiError(f"Pocket Pilot's server call failed: {exc}") from exc

    if resp.status_code == 404:
        try:
            body = resp.json()
        except ValueError:
            body = None
        if isinstance(body, dict) and body.get("error"):
            # Route exists; this specific id/resource wasn't found -- e.g.
            # confirmed live: approving an already-approved notification
            # returns {"error": "No notification called due-aurum"}, 404.
            raise ApiError("I couldn't find that anymore. It may already be done.",
                            status_code=404, not_found=True)
        raise ApiError(f"{path} isn't available on this server yet.", status_code=404)
    if not resp.ok:
        detail = ""
        try:
            detail = resp.json().get("error", "")
        except ValueError:
            pass
        raise ApiError(detail or f"Pocket Pilot's server returned {resp.status_code}.",
                        status_code=resp.status_code)
    try:
        return resp.json()
    except ValueError as exc:
        raise ApiError("Pocket Pilot's server sent back something unexpected.") from exc


def health():
    return _request("GET", "/health")


def wallet():
    return _request("GET", "/api/wallet")


def pick(merchant=None, amount=0.0, mcc=None, place_types=None, domain=None,
          foreign=False, debt_guard=None, explain=True):
    body = {"amount": amount, "merchant": merchant, "mcc": mcc, "place_types": place_types,
            "domain": domain, "foreign": foreign, "explain": explain}
    if debt_guard is not None:
        body["debt_guard"] = debt_guard
    try:
        return _request("POST", "/api/pick", json={k: v for k, v in body.items() if v is not None})
    except ApiError as e:
        if not (e.timed_out and explain):
            raise
    # explain=True asks Claude to word the reason, which can take over 5s.
    # Same pick, the server's own template reason: fast, same numbers.
    body["explain"] = False
    return _request("POST", "/api/pick", json={k: v for k, v in body.items() if v is not None})


def get_notifications():
    return _request("GET", "/api/notifications")


def approve_notification(note_id):
    return _request("POST", f"/api/notifications/{note_id}/approve")


def dismiss_notification(note_id):
    return _request("POST", f"/api/notifications/{note_id}/dismiss")


def ask_coach(question, history=None):
    body = {"question": question}
    if history:
        body["history"] = history
    return _request("POST", "/api/coach", json=body)


def get_settings():
    return _request("GET", "/api/settings")


def set_debt_guard(enabled):
    return _request("POST", "/api/settings", json={"debt_guard": bool(enabled)})


def payback(card_id):
    return _request("GET", f"/api/payback/{card_id}")


def vfc_rules():
    return _request("GET", "/api/vfc/rules")


def vfc_authorize(merchant=None, amount=0.0, mcc=None):
    body = {"amount": amount, "merchant": merchant, "mcc": mcc}
    return _request("POST", "/api/vfc/authorize", json={k: v for k, v in body.items() if v is not None})


# --- Not on this server branch yet. Kept here so the agent starts working the
# moment server/ adds them, with no agent-side changes needed. Each call will
# raise ApiError(status_code=404) today; callers already handle that. ---

def pay(merchant=None, amount=0.0, card_id=None):
    body = {"merchant": merchant, "amount": amount}
    if card_id:
        body["card_id"] = card_id
    return _request("POST", "/api/pay", json=body)


def impact():
    return _request("GET", "/api/impact")


def get_log():
    return _request("GET", "/api/log")


def demo_reset():
    return _request("POST", "/api/demo/reset")
