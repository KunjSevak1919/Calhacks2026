"""Claude: explanations and Ask Coach answers.

Claude never decides which card wins or how much to pay. The engine does that.
Claude turns the engine's numbers into plain language and answers questions
using only the user's own data. Without an API key we return canned answers.
"""
import json
import os

SYSTEM = """You are Pocket Pilot, a friendly money coach for college students managing their credit cards.
Rules:
- Use plain words a 14-year-old understands. Short sentences. Under 110 words.
- Plain text only: it shows in a phone chat bubble. No markdown, no bullet points, no headings, no bold.
- Use ONLY the numbers in the user's data below. Never invent numbers, rates, fees or scores.
- If the data doesn't answer the question, say so and say what to check (card terms, the issuer's app).
- Never recommend opening a new card, taking a loan, or spending more to earn rewards.
- You can explain what usually affects credit scores, but never give an exact score or promise a change.
- You are educational, not a financial advisor. For big decisions, suggest the campus financial aid office.
- End with one concrete next step when there is one."""

FALLBACK = [
    (("score", "credit score"),
     "Your score likely dipped because you opened Zero Intro last month. A new card adds a hard inquiry and "
     "lowers the average age of your accounts. Both usually fade within a few months. Your on-time payments "
     "and low usage (8.7% of your limits) are helping. Next step: keep paying on time."),
    (("late", "fee work", "late fee"),
     "If you pay Aurum Gold after Oct 30, you may get a late fee and lose your grace period, so new purchases "
     "start charging 29.9% interest. Paying at least the $35 minimum by Oct 30 avoids the fee. Paying the full "
     "$640 avoids interest too. Next step: approve the payment for Oct 29, the day after payday."),
    (("secured",),
     "A secured card asks for a deposit, usually equal to your limit, so the bank takes less risk. It builds "
     "credit the same way a regular card does. After several months of on-time payments, many issuers review it "
     "for an upgrade and return the deposit. All 5 of your cards are regular cards, so you don't need one."),
    (("annual", "worth"),
     "Voyager charges $95 a year. This year it earned you $41. That's $54 less than the fee. Before it posts on "
     "Nov 15, you could ask to switch to Voyager Basic, the no-fee version. That keeps the account open, which "
     "protects the age of your credit history."),
    (("minimum", "pay back", "payback"),
     "Paying only the minimum on Aurum Gold's $640 at 29.9% APR takes years and costs well over $100 in interest. "
     "Paying it in full by Oct 30 costs $0 in interest. Next step: approve the full payment after payday."),
]


def tidy(text, stop_reason=None):
    """Make Claude's answer fit a chat bubble: no markdown, never cut mid-sentence."""
    lines = []
    for line in text.strip().splitlines():
        line = line.strip().lstrip("-*\u2022 ").replace("**", "").replace("__", "")
        if line.startswith("#"):
            line = line.lstrip("# ")
        if line:
            lines.append(line)
    out = " ".join(lines)
    if stop_reason == "max_tokens":
        end = max(out.rfind(". "), out.rfind("? "), out.rfind("! "))
        out = out[: end + 1] if end > 0 else out
    return out.strip()


def _client():
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return None
    try:
        import anthropic
        return anthropic.Anthropic(api_key=key)
    except Exception:
        return None


def _fallback(question):
    q = question.lower()
    for keys, answer in FALLBACK:
        if any(k in q for k in keys):
            return answer
    return ("I can help with your cards, due dates, fees, interest and credit score. "
            "Try asking: \"Is my annual fee worth it?\" or \"How do late fees work?\"")


def ask(question, context, history=None):
    """Answer a student's question using their wallet context. Returns dict."""
    client = _client()
    if client is None:
        return {"answer": _fallback(question), "source": "offline"}
    messages = list(history or [])
    messages.append({"role": "user", "content":
                     f"My data (JSON):\n{json.dumps(context, default=str)}\n\nQuestion: {question}"})
    try:
        resp = client.messages.create(
            model=os.getenv("CLAUDE_MODEL_SMART", "claude-sonnet-5-5"),
            max_tokens=700, system=SYSTEM, messages=messages)
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return {"answer": tidy(text, resp.stop_reason), "source": "claude"}
    except Exception as e:  # network, auth, rate limit
        return {"answer": _fallback(question), "source": f"offline ({e.__class__.__name__})"}


def explain_pick(best, ranked, purchase, debt_guard, template_reason):
    """One friendly sentence for the notification. Falls back to the template."""
    client = _client()
    if client is None:
        return template_reason
    facts = {"purchase": purchase, "debt_guard_on": debt_guard, "best": best,
             "others": [{k: s[k] for k in ("name", "net", "reward", "interest")} for s in ranked[1:]]}
    try:
        resp = client.messages.create(
            model=os.getenv("CLAUDE_MODEL_FAST", "claude-haiku-5-5"), max_tokens=120, system=SYSTEM,
            messages=[{"role": "user", "content":
                       "Write ONE sentence (max 30 words) telling the student which card to use and why, "
                       f"using only these numbers: {json.dumps(facts)}"}])
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        return text or template_reason
    except Exception:
        return template_reason
