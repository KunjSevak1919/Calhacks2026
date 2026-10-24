"""Turn a chat message into a structured intent.

Deterministic parsing (regex + keywords) runs first and handles everything the
demo needs. An optional LLM fallback (behind parse_intent_llm) only fires when
ANTHROPIC_API_KEY is set and the deterministic pass can't tell what the user
wants -- swap the model later by editing just that one function.
"""
import json
import os
import re

# ASI:One puts the literal agent address in the message text when a user
# @-mentions an agent, e.g. "@agent1qde95qr0dzcnhhs8f65hkwujn9mh89jx0u7u7g6nv3t
# m2jxvjwhkunvessq yes" (confirmed: https://asi1.ai/blog/mastering-at-mentions).
# Addresses are bech32 (lowercase letters + digits only), always "agent1...".
MENTION_RE = re.compile(r"@agent1[a-z0-9]+", re.IGNORECASE)
STRIP_CHARS = " \t\n.,!?;:\"'"
# ASI:One sends typographic quotes (“ ” ‘ ’); match them like plain ones.
CURLY_QUOTES = str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"})

AMOUNT_RE = re.compile(r"\$\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*dollars?", re.IGNORECASE)
MERCHANT_AT_RE = re.compile(
    r"\bat\s+([A-Za-z0-9&'.\- ]+?)(?=\s+(?:for|with)\b|[.,!?]|\s+\$|$)", re.IGNORECASE
)
CARD_WITH_RE = re.compile(
    r"\bwith\s+(?:my\s+)?([A-Za-z0-9&'.\- ]+?)(?=[.,!?]|$)", re.IGNORECASE
)
STORE_KIND_RE = re.compile(
    r"what\s+(?:kind|type)\s+of\s+store\s+is\s+(.+?)[.,!?]*$", re.IGNORECASE
)

YES_WORDS = {"yes", "y", "yep", "yeah", "approve", "do it", "confirm", "ok", "okay", "sure"}
NO_WORDS = {"no", "n", "nope", "later", "not now", "skip", "cancel", "dismiss"}

HELP_WORDS = ("help", "what can you do", "commands")
RESET_WORDS = ("reset demo", "reset the demo", "demo reset")
IMPACT_WORDS = ("how much have you saved", "saved me", "money kept", "impact")
NOTIF_WORDS = ("due soon", "anything due", "notification", "notifications", "due date", "any alerts")
DEBT_GUARD_WORDS = ("debt guard",)
CARRYING_BALANCE_WORDS = ("carrying a balance", "carry a balance", "i'm in debt", "revolving balance")
PAID_OFF_WORDS = ("paid off", "no balance", "not carrying")
COACH_HINT_WORDS = ("why", "how do", "how does", "what is", "what's", "explain", "credit score", "late fee")
VFC_RULES_WORDS = ("visa rules", "vfc rules", "my rules", "flexible credential rules")
CARD_DETAILS_RE = re.compile(
    r"\b(?:tell me about|tell me more about|more about|details (?:on|for|about)|info (?:on|about))"
    r"\s+(?:my\s+)?(?:the\s+)?(.+?)(?:\s+card)?$", re.IGNORECASE)
WALLET_WORDS = ("show my cards", "show me my cards", "list my cards", "my cards", "how am i doing",
                "my wallet", "my balances", "show my balances")
VFC_AUTHORIZE_WORDS = ("how should i pay", "which way should i pay", "visa flexible", "vfc")


def _extract_amount(text):
    m = AMOUNT_RE.search(text)
    if not m:
        return None
    raw = m.group(1) or m.group(2)
    try:
        return float(raw)
    except ValueError:
        return None


def _extract_merchant(text):
    m = MERCHANT_AT_RE.search(text)
    if not m:
        return None
    return m.group(1).strip().rstrip(".,!?")


def _extract_card(text):
    m = CARD_WITH_RE.search(text)
    if not m:
        return None
    return m.group(1).strip().rstrip(".,!?")


def normalize_text(text):
    """Strip ASI:One's "@agent1q..." mention and surrounding whitespace/
    punctuation before intent matching, so a reply like "@agent1qxyz... yes"
    still matches "yes" exactly. Only trims from the ends -- amounts like
    "$84.50" keep their internal punctuation."""
    cleaned = MENTION_RE.sub(" ", (text or "").translate(CURLY_QUOTES))
    cleaned = re.sub(r"\s+", " ", cleaned).strip(STRIP_CHARS)
    return cleaned


def parse_intent(text, has_pending=False):
    """Deterministic intent parse. Returns a dict with at least an "intent" key."""
    t = normalize_text(text)
    low = t.lower()

    if has_pending:
        if low in YES_WORDS or any(low.startswith(w) for w in YES_WORDS):
            return {"intent": "confirm_yes", "raw": t}
        if low in NO_WORDS or any(low.startswith(w) for w in NO_WORDS):
            return {"intent": "confirm_no", "raw": t}

    if any(w in low for w in HELP_WORDS):
        return {"intent": "help", "raw": t}

    if any(w in low for w in RESET_WORDS):
        return {"intent": "reset_demo", "raw": t}

    # Card-info questions never carry a purchase amount; "which of my cards
    # at Target for $20" is still a pick.
    if _extract_amount(t) is None and any(w in low for w in WALLET_WORDS):
        return {"intent": "wallet", "raw": t}

    m = CARD_DETAILS_RE.search(t)
    if m and _extract_amount(t) is None:
        return {"intent": "card_details", "card_query": m.group(1).strip(STRIP_CHARS), "raw": t}

    if any(w in low for w in DEBT_GUARD_WORDS) or any(w in low for w in CARRYING_BALANCE_WORDS):
        turn_off = any(w in low for w in PAID_OFF_WORDS) or "off" in low or "disable" in low
        turn_on = "on" in low or "enable" in low or any(w in low for w in CARRYING_BALANCE_WORDS)
        intent = "debt_guard_off" if turn_off and not turn_on else "debt_guard_on"
        return {"intent": intent, "raw": t}

    if any(w in low for w in IMPACT_WORDS):
        return {"intent": "impact", "raw": t}

    if low.startswith("i paid") or (" paid " in f" {low} " and _extract_amount(t) is not None):
        return {
            "intent": "pay",
            "merchant": _extract_merchant(t),
            "amount": _extract_amount(t),
            "card": _extract_card(t),
            "raw": t,
        }

    if any(w in low for w in NOTIF_WORDS):
        return {"intent": "notifications", "raw": t}

    if any(w in low for w in VFC_RULES_WORDS):
        return {"intent": "vfc_rules", "raw": t}

    if any(w in low for w in VFC_AUTHORIZE_WORDS):
        return {
            "intent": "vfc_authorize",
            "merchant": _extract_merchant(t),
            "amount": _extract_amount(t),
            "raw": t,
        }

    m = STORE_KIND_RE.search(t)
    if m:
        return {"intent": "store_kind", "merchant": m.group(1).strip().rstrip(STRIP_CHARS), "raw": t}

    amount = _extract_amount(t)
    merchant = _extract_merchant(t)
    if amount is not None and (merchant or "mcc" in low):
        return {"intent": "pick", "merchant": merchant, "amount": amount, "raw": t}

    if any(w in low for w in COACH_HINT_WORDS):
        return {"intent": "coach", "question": t, "raw": t}

    if low in YES_WORDS:
        return {"intent": "confirm_yes", "raw": t}
    if low in NO_WORDS:
        return {"intent": "confirm_no", "raw": t}

    return {"intent": "unknown", "raw": t}


def parse_intent_llm(text):
    """Optional LLM fallback. Only used when ANTHROPIC_API_KEY is set and the
    deterministic parser returned "unknown". Returns the same shape as
    parse_intent, or None if no key is configured or the call fails.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return None

    try:
        import anthropic
    except ImportError:
        return None

    prompt = (
        "Classify this message from a user talking to their credit card assistant. "
        "Reply with ONLY strict JSON, no prose, matching this shape: "
        '{"intent": one of ["pick","debt_guard_on","debt_guard_off","notifications",'
        '"confirm_yes","confirm_no","pay","impact","store_kind","vfc_authorize","vfc_rules",'
        '"coach","reset_demo","help","wallet","card_details","unknown"],'
        '"merchant": string or null, "amount": number or null, "question": string or null}. '
        f"Message: {text!r}"
    )
    try:
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=os.getenv("CLAUDE_MODEL_FAST", "claude-haiku-4-5-20251001"),
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = "".join(block.text for block in resp.content if hasattr(block, "text"))
        parsed = json.loads(raw)
        parsed.setdefault("raw", text)
        return parsed
    except Exception:
        return None
