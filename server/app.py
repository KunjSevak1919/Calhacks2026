"""Pocket Pilot API. Run: python app.py  ->  http://localhost:5001"""
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from pocketpilot.service import PocketPilot  # noqa: E402  (needs env loaded first)

app = Flask(__name__)
CORS(app)
pilot = PocketPilot()


def body():
    return request.get_json(silent=True) or {}


@app.get("/health")
def health():
    return {"ok": True, "data_source": pilot.profile.get("source")}


@app.get("/api/wallet")
def wallet():
    return jsonify(pilot.wallet())


@app.post("/api/pick")
def pick():
    b = body()
    if "amount" not in b or not (b.get("merchant") or b.get("mcc") or b.get("place_types") or b.get("domain")):
        return {"error": "Send amount plus merchant, mcc, place_types or domain."}, 400
    try:
        amount = float(b["amount"])
    except (TypeError, ValueError):
        return {"error": "amount must be a number"}, 400
    return jsonify(pilot.pick(merchant=b.get("merchant"), amount=amount, mcc=b.get("mcc"),
                              place_types=b.get("place_types"), domain=b.get("domain"),
                              foreign=bool(b.get("foreign")), debt_guard=b.get("debt_guard"),
                              explain=b.get("explain", True)))


@app.get("/api/notifications")
def notifications():
    return jsonify(pilot.notifications())


@app.post("/api/notifications/<note_id>/approve")
def approve(note_id):
    result = pilot.approve(note_id)
    if result is None:
        return {"error": f"No notification called {note_id}"}, 404
    return jsonify(result)


@app.post("/api/coach")
def coach():
    b = body()
    question = (b.get("question") or "").strip()
    if not question:
        return {"error": "Send a question."}, 400
    return jsonify(pilot.ask(question, b.get("history")))


@app.route("/api/settings", methods=["GET", "POST"])
def settings():
    if request.method == "POST":
        b = body()
        if "debt_guard" in b:
            pilot.settings["debt_guard"] = bool(b["debt_guard"])
    return jsonify(pilot.settings)


@app.get("/api/payback/<card_id>")
def payback(card_id):
    if card_id not in pilot.profile["accounts"]:
        return {"error": f"Unknown card {card_id}"}, 404
    return jsonify(pilot.payback(card_id))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5001)), debug=True)
