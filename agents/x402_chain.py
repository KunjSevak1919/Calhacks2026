"""Ask the test chain whether an x402 payment actually happened.

An x402 "exact" payment is a signed USDC transferWithAuthorization (EIP-3009)
with a one-time nonce. The USDC contract remembers every used nonce
(authorizationState) and emits AuthorizationUsed when one is spent. So when a
facilitator call fails or a reply gets lost, we can still tell for sure
whether money moved -- and find the tx -- instead of guessing.

Plain JSON-RPC over requests to a public Base Sepolia endpoint. Every
function returns None when the chain can't be reached ("don't know"),
never raises.
"""
import logging

import requests
from eth_utils import keccak

logger = logging.getLogger("x402-chain")

RPC_TIMEOUT_SECONDS = 10
# sepolia.base.org rejects wider ranges ("eth_getLogs is limited to a 200
# range"). 150 blocks is ~5 minutes of Base Sepolia, which covers our whole
# payment window; the margin leaves room for "latest" moving between calls.
LOG_LOOKBACK_BLOCKS = 150
AUTHORIZATION_STATE = "0x" + keccak(text="authorizationState(address,bytes32)")[:4].hex()
AUTHORIZATION_USED_TOPIC = "0x" + keccak(text="AuthorizationUsed(address,bytes32)").hex()


def _word(hex_value):
    """A 32-byte ABI word from an address or bytes32 hex string."""
    return hex_value.lower().removeprefix("0x").rjust(64, "0")


def _rpc(rpc_url, method, params, post=requests.post):
    resp = post(rpc_url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params},
                timeout=RPC_TIMEOUT_SECONDS)
    body = resp.json()
    if "error" in body:
        raise RuntimeError(f"{method}: {body['error']}")
    return body["result"]


def authorization_used(rpc_url, usdc, authorizer, nonce, post=requests.post):
    """True/False: has this (authorizer, nonce) been spent? None: unknown."""
    data = AUTHORIZATION_STATE + _word(authorizer) + _word(nonce)
    try:
        result = _rpc(rpc_url, "eth_call", [{"to": usdc, "data": data}, "latest"], post)
        return int(result, 16) != 0
    except Exception as e:
        logger.warning(f"couldn't check authorization on-chain ({type(e).__name__}: {e})")
        return None


def find_authorization_tx(rpc_url, usdc, authorizer, nonce, post=requests.post):
    """The tx hash that spent this authorization, or None."""
    try:
        latest = int(_rpc(rpc_url, "eth_blockNumber", [], post), 16)
        logs = _rpc(rpc_url, "eth_getLogs", [{
            "address": usdc,
            "fromBlock": hex(max(latest - LOG_LOOKBACK_BLOCKS, 0)),
            "toBlock": hex(latest),
            "topics": [AUTHORIZATION_USED_TOPIC, "0x" + _word(authorizer), "0x" + _word(nonce)],
        }], post)
        return logs[-1]["transactionHash"] if logs else None
    except Exception as e:
        logger.warning(f"couldn't look up the settlement tx ({type(e).__name__}: {e})")
        return None


def authorization_of(payment_payload):
    """(authorizer, nonce, valid_before) from an x402 exact-EVM payment
    payload (object or dict), or None if it isn't an EIP-3009 authorization."""
    payload = payment_payload.payload if hasattr(payment_payload, "payload") else (payment_payload or {}).get("payload")
    auth = (payload or {}).get("authorization") or {}
    if not auth.get("from") or not auth.get("nonce"):
        return None
    return auth["from"], auth["nonce"], int(auth.get("validBefore") or 0)
