import pytest

import seeds


def test_require_seed_returns_value(monkeypatch):
    monkeypatch.setenv("CARD_SCORER_SEED", "abc")
    assert seeds.require_seed("CARD_SCORER_SEED") == "abc"


@pytest.mark.parametrize("value", [None, "", "   "])
def test_require_seed_refuses_missing_or_blank(monkeypatch, value):
    if value is None:
        monkeypatch.delenv("CARD_SCORER_SEED", raising=False)
    else:
        monkeypatch.setenv("CARD_SCORER_SEED", value)
    with pytest.raises(SystemExit) as exc:
        seeds.require_seed("CARD_SCORER_SEED")
    assert "CARD_SCORER_SEED is missing" in str(exc.value)


def test_missing_seeds_lists_all_four_checks(monkeypatch):
    monkeypatch.delenv("MERCHANT_RESOLVER_SEED", raising=False)
    monkeypatch.setenv("PAYMENT_PLANNER_SEED", "")
    assert seeds.missing_seeds() == ["PAYMENT_PLANNER_SEED", "MERCHANT_RESOLVER_SEED"]


def test_run_all_refuses_to_start_without_seeds(monkeypatch):
    import run_all

    monkeypatch.delenv("MERCHANT_RESOLVER_SEED", raising=False)
    started = []
    monkeypatch.setattr(run_all.subprocess, "Popen", lambda *a, **kw: started.append(a))
    with pytest.raises(SystemExit):
        run_all.main()
    assert started == []
