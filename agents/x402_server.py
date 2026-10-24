"""Pocket Pilot's paid x402 endpoints: how our agents EARN. Test network only.

  POST /x402/best-card     {merchant, amount, debt_guard?} -> best card,
                           reason, mcc (same engine as /api/pick)   $0.001
  POST /x402/merchant-data {merchant} -> mcc + category from a SIMULATED
                           merchant directory (x402_merchant_data.json) $0.001
  GET  /x402/stats         free: earned / spent so far
  GET  /health             free

An unpaid request gets HTTP 402 with the payment requirements (PAYMENT-REQUIRED
header: exact scheme, test USDC on Base Sepolia, our address). A paid retry is
verified and settled through the facilitator by x402's own Flask middleware;
the answer comes back with a PAYMENT-RESPONSE receipt (tx hash). A request
the handler rejects (400/502) is never settled, so the caller isn't charged.

A separate small service: calls the Flask API like every other agent and
doesn't touch server/. No LLM anywhere in this path.

Run: python x402_server.py   (needs CDP keys in .env; see README "Coinbase x402")
"""
import io
import json
import logging
import os
import sys
from urllib.parse import urlparse

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from flask import Flask, jsonify, request  # noqa: E402
from rapidfuzz import fuzz  # noqa: E402

import api_client  # noqa: E402
import merchant_resolver  # noqa: E402
import x402_config  # noqa: E402
from x402_ledger import Ledger  # noqa: E402

logger = logging.getLogger("x402-server")

BEST_CARD = "/x402/best-card"
MERCHANT_DATA = "/x402/merchant-data"
MERCHANT_DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "x402_merchant_data.json")
MATCH_SCORE = 90
MAX_AMOUNT = 100_000


def load_merchant_data(path=MERCHANT_DATA_FILE):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def lookup_merchant(name, data):
    """The simulated directory entry for a store name, or None."""
    target = merchant_resolver.normalize(name)
    if not target:
        return None
    best, best_score = None, 0
    for entry in data["merchants"]:
        for alias in [entry["name"], *entry.get("aliases", [])]:
            score = fuzz.WRatio(target, merchant_resolver.normalize(alias))
            if score > best_score:
                best, best_score = entry, score
    return best if best_score >= MATCH_SCORE else None


def _buffer_request_body(wsgi_app):
    """Read the request body before x402's middleware runs. Werkzeug's dev
    server drains any unread body after responding with a blocking read, and
    x402 answers 402 without reading it -- so a POST with a body hung until
    the client gave up. Buffering it first avoids that (bodies here are tiny)."""
    def app(environ, start_response):
        length = int(environ.get("CONTENT_LENGTH") or 0)
        body = environ["wsgi.input"].read(length) if length > 0 else b""
        environ["wsgi.input"] = io.BytesIO(body)
        return wsgi_app(environ, start_response)
    return app


def _bad_request(message):
    return jsonify({"error": message}), 400


def _parse_purchase(body):
    """(merchant, amount, debt_guard, error)"""
    merchant = body.get("merchant")
    if not isinstance(merchant, str) or not merchant.strip() or len(merchant) > 100:
        return None, None, None, "merchant must be a store name"
    amount = body.get("amount")
    if isinstance(amount, bool) or not isinstance(amount, (int, float)) or not 0 < amount <= MAX_AMOUNT:
        return None, None, None, f"amount must be a number of dollars between 0 and {MAX_AMOUNT}"
    debt_guard = body.get("debt_guard")
    if debt_guard is not None and not isinstance(debt_guard, bool):
        return None, None, None, "debt_guard must be true or false"
    return merchant.strip(), float(amount), debt_guard, None


def best_card_reply(merchant, amount, result):
    """Shape /api/pick's answer for another agent. Field names from a live
    /api/pick response: best, ranked, reason, store, debt_guard, uncertain."""
    best = result.get("best") or {}
    ranked = result.get("ranked") or []
    store = result.get("store") or {}
    return {
        "merchant": store.get("merchant") or merchant,
        "amount": amount,
        "best_card": best.get("name"),
        "card_id": best.get("card_id"),
        "rate_label": best.get("rate_label"),
        "reward": best.get("reward"),
        "interest": best.get("interest"),
        "net": best.get("net"),
        "reason": result.get("reason"),
        "mcc": store.get("mcc"),
        "category": store.get("category"),
        "store_confidence": store.get("confidence"),
        "runner_up": ranked[1].get("name") if len(ranked) > 1 else None,
        "debt_guard": result.get("debt_guard"),
        "uncertain": result.get("uncertain"),
        "engine": "Pocket Pilot rewards-vs-interest engine (no LLM in scoring)",
    }


def _routes(cfg, pay_to):
    from x402.http.types import PaymentOption, RouteConfig

    def route(price, description):
        return RouteConfig(
            accepts=PaymentOption(scheme="exact", pay_to=pay_to, price=f"${price}", network=cfg.network),
            description=description, mime_type="application/json")

    return {
        f"POST {BEST_CARD}": route(cfg.price_best_card_usd,
                                    "Pocket Pilot: best credit card for a purchase (merchant + amount)"),
        f"POST {MERCHANT_DATA}": route(cfg.price_merchant_data_usd,
                                        "Merchant category lookup (SIMULATED demo directory)"),
    }


def _record_earning(cfg, ledger):
    def after_settle(ctx):
        result = ctx.result
        if not result.success:
            return
        resource = getattr(ctx.payment_payload, "resource", None)
        endpoint = urlparse(resource.url).path if resource and resource.url else "?"
        usd = x402_config.atomic_to_usd(result.amount or ctx.requirements.amount, cfg.network)
        ledger.record_earned(endpoint, usd, tx=result.transaction, payer=result.payer, network=result.network)
        logger.info(f"earned ${usd} for {endpoint} from {result.payer} "
                    f"tx {result.transaction} {x402_config.tx_url(cfg.network, result.transaction) or ''}")
    return after_settle


def create_app(cfg, facilitator, pay_to, ledger, pick=api_client.pick, merchant_data=None):
    """facilitator: anything with verify/settle/get_supported (x402's
    HTTPFacilitatorClientSync in real use, a fake in tests)."""
    from x402 import x402ResourceServerSync
    from x402.http.middleware.flask import PaymentMiddleware
    from x402.mechanisms.evm.exact import register_exact_evm_server

    x402_config.require_testnet(cfg)
    merchant_data = merchant_data or load_merchant_data()
    app = Flask("x402-server")

    @app.post(BEST_CARD)
    def best_card():
        merchant, amount, debt_guard, error = _parse_purchase(request.get_json(silent=True) or {})
        if error:
            return _bad_request(error)
        try:
            result = pick(merchant=merchant, amount=amount, debt_guard=debt_guard)
        except api_client.ApiError as e:
            logger.warning(f"best-card: engine unavailable ({e}); not charging")
            return jsonify({"error": "Pocket Pilot's engine is unavailable; you were not charged."}), 502
        reply = best_card_reply(merchant, amount, result)
        logger.info(f"best-card: {merchant!r} ${amount:.2f} -> {reply['best_card']}")
        return jsonify(reply)

    @app.post(MERCHANT_DATA)
    def merchant_data_lookup():
        name = (request.get_json(silent=True) or {}).get("merchant")
        if not isinstance(name, str) or not name.strip() or len(name) > 100:
            return _bad_request("merchant must be a store name")
        entry = lookup_merchant(name, merchant_data)
        reply = {"merchant": name, "found": entry is not None, "simulated": True,
                 "source": merchant_data["source"]}
        if entry:
            reply.update(merchant=entry["name"], mcc=entry["mcc"], confidence=merchant_data["confidence"])
        logger.info(f"merchant-data: {name!r} -> {reply.get('mcc') or 'not found'} (simulated)")
        return jsonify(reply)

    @app.get("/x402/stats")
    def stats():
        t = ledger.totals()
        return jsonify({k: (str(v) if k.endswith("_usd") else v) for k, v in t.items()}
                       | {"network": cfg.network, "network_name": cfg.network_name})

    @app.get("/health")
    def health():
        return jsonify({"ok": True, "network": cfg.network, "pay_to": pay_to})

    server = x402ResourceServerSync(facilitator)
    register_exact_evm_server(server, cfg.network)
    server.on_after_settle(_record_earning(cfg, ledger))
    PaymentMiddleware(app, _routes(cfg, pay_to), server)
    app.wsgi_app = _buffer_request_body(app.wsgi_app)
    return app


def main():
    logging.basicConfig(level=logging.INFO, format="[x402-server]: %(message)s")
    cfg = x402_config.load()
    print(x402_config.status_line(cfg))
    if not cfg.enabled:
        sys.exit(1)
    try:
        x402_config.require_testnet(cfg)
    except x402_config.X402ConfigError as e:
        print(e)
        sys.exit(1)

    import x402_wallet
    from x402.http import FacilitatorConfig, HTTPFacilitatorClientSync

    pay_to = cfg.pay_to or x402_wallet.address_for(x402_config.SELLER_ACCOUNT)
    facilitator = HTTPFacilitatorClientSync(FacilitatorConfig(url=cfg.facilitator_url))
    app = create_app(cfg, facilitator, pay_to, Ledger(cfg.ledger_dir))
    print(f"Earnings go to {pay_to} ({cfg.network_name}); facilitator {cfg.facilitator_url}")
    print(f"Paid: POST {cfg.server_url}{BEST_CARD} (${cfg.price_best_card_usd}), "
          f"POST {cfg.server_url}{MERCHANT_DATA} (${cfg.price_merchant_data_usd}). Free: GET /x402/stats")
    app.run(host=cfg.host, port=cfg.port, threaded=True)


if __name__ == "__main__":
    main()
