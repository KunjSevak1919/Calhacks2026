"""Visa Flexible Credential (VFC) endpoints -- SIMULATED, not a real Visa
API (VFC is issuer-bank-only; see vfc.py). Owns its own settings state,
fully separate from PocketPilot's own self.settings, so this file is the
only thing that needs touching for VFC and app.py's diff stays tiny.

Registered from app.py with: `from pocketpilot.routes_vfc import init_routes`
then `init_routes(app, lambda: pilot)`. Takes a getter rather than the
pilot instance itself so that tests which reassign `server.pilot` for a
fresh fixture (the same pattern test_api.py already uses) are seen here
too -- a plain parameter would close over the original instance forever.
"""
from flask import jsonify, request

from . import vfc

DEFAULT_SETTINGS = {"debit_buffer": vfc.DEFAULT_DEBIT_BUFFER,
                     "installment_threshold": vfc.DEFAULT_INSTALLMENT_THRESHOLD,
                     "enabled": True}


def init_routes(app, get_pilot):
    settings = dict(DEFAULT_SETTINGS)
    app.vfc_settings = settings  # exposed so tests can reset between cases

    def rules():
        pilot = get_pilot()
        return vfc.generate_rules(pilot.profile, pilot.cards, {**pilot.settings, **settings})

    @app.get("/api/vfc/rules")
    def vfc_get_rules():
        return jsonify({"rules": rules(), "settings": settings, "simulated": True})

    @app.post("/api/vfc/rules")
    def vfc_post_rules():
        b = request.get_json(silent=True) or {}
        if "debit_buffer" in b:
            try:
                v = float(b["debit_buffer"])
            except (TypeError, ValueError):
                return {"error": "debit_buffer must be a number", "simulated": True}, 400
            if v < 0:
                return {"error": "debit_buffer must not be negative", "simulated": True}, 400
            settings["debit_buffer"] = v
        if "installment_threshold" in b:
            try:
                v = float(b["installment_threshold"])
            except (TypeError, ValueError):
                return {"error": "installment_threshold must be a number", "simulated": True}, 400
            if v <= 0:
                return {"error": "installment_threshold must be positive", "simulated": True}, 400
            settings["installment_threshold"] = v
        if "enabled" in b:
            settings["enabled"] = bool(b["enabled"])
        return jsonify({"rules": rules(), "settings": settings, "simulated": True})

    @app.post("/api/vfc/authorize")
    def vfc_authorize():
        b = request.get_json(silent=True) or {}
        if not settings.get("enabled", True):
            return {"error": "Visa Flexible Credential is turned off. "
                              "Enable it via POST /api/vfc/rules first.", "simulated": True}, 400
        if "amount" not in b or not (b.get("merchant") or b.get("mcc")):
            return {"error": "Send amount plus merchant or mcc.", "simulated": True}, 400
        try:
            amount = float(b["amount"])
        except (TypeError, ValueError):
            return {"error": "amount must be a number", "simulated": True}, 400
        if amount <= 0:
            return {"error": "amount must be positive", "simulated": True}, 400

        pilot = get_pilot()
        purchase = {"merchant": b.get("merchant"), "mcc": b.get("mcc"), "amount": amount}
        combined_settings = {**pilot.settings, **settings}
        if "debt_guard" in b:
            combined_settings["debt_guard"] = bool(b["debt_guard"])
        result = vfc.authorize(purchase, rules(), pilot.profile, pilot.cards,
                                combined_settings, pilot.today)
        return jsonify(result)
