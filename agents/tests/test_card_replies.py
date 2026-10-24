import pytest

import card_replies
from wallet_fixture import WALLET

CARDS = WALLET["cards"]


@pytest.mark.parametrize("text, card_id", [
    ("Tell me about Aurum Gold", "aurum"),
    ("tell me about aurum", "aurum"),
    ("AURUM GOLD please", "aurum"),
    ("how long to pay off zero intro?", "zero"),
    ("what about my intro card", "zero"),
    ("is my Voyager fee worth it", "voyager"),
    ("steady 2% details", "steady"),
    ("tell me about steady", "steady"),
    ("spin", "spin"),
])
def test_find_card_case_insensitive_and_partial(text, card_id):
    assert card_replies.find_card(text, CARDS)["id"] == card_id


@pytest.mark.parametrize("text", ["tell me about my sapphire", "how am I doing", "", None])
def test_find_card_none_when_not_named(text):
    assert card_replies.find_card(text, CARDS) is None


def test_unknown_card_lists_the_users_cards():
    assert card_replies.unknown_card("sapphire", CARDS) == (
        "I don't see a card called \"sapphire\". "
        "Your cards: Aurum Gold, Steady 2%, Zero Intro, Spin 5%, Voyager.")


def test_format_wallet_one_line_per_card_then_total():
    assert card_replies.format_wallet(WALLET) == (
        "Your cards:\n"
        "- Aurum Gold: $640.00 of $5,000.00 (13% used), 29.9% APR, due Oct 30\n"
        "- Steady 2%: $310.00 of $3,000.00 (10% used), 24.9% APR, due Nov 12\n"
        "- Zero Intro: $0.00 of $4,000.00 (0% used), 0% APR, nothing due\n"
        "- Spin 5%: $370.00 of $2,500.00 (15% used), 26.2% APR, due Nov 8\n"
        "- Voyager: $820.00 of $10,000.00 (8% used), 27.4% APR, due Nov 4\n"
        "Total: $2,140.00 of $24,500.00 (9% used). Debt Guard is off.")


def test_format_wallet_never_crashes_on_missing_values():
    reply = card_replies.format_wallet({"cards": [{"name": "Mystery"}]})
    assert reply.startswith("Your cards:\n- Mystery: — of — (— used), — APR, nothing due")
    assert "Total: — of — (— used). Debt Guard is off." in reply


def test_format_wallet_no_cards():
    assert card_replies.format_wallet({}) == "I don't see any cards yet."
