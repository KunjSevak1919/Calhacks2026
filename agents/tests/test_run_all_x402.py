import pytest

import run_all
from tests.x402_fakes import config


def test_x402_off_starts_just_the_four_agents(tmp_path, monkeypatch):
    cfg = config(tmp_path, x402_enabled="off")
    monkeypatch.setattr(run_all.x402_config, "load", lambda: cfg)
    assert run_all._scripts() == run_all.SCRIPTS


def test_x402_on_starts_the_paid_service_first(tmp_path, monkeypatch):
    cfg = config(tmp_path)
    monkeypatch.setattr(run_all.x402_config, "load", lambda: cfg)
    assert run_all._scripts() == ["x402_server.py", *run_all.SCRIPTS]


def test_x402_on_mainnet_refuses_to_start(tmp_path, monkeypatch):
    cfg = config(tmp_path, x402_network="eip155:8453")
    monkeypatch.setattr(run_all.x402_config, "load", lambda: cfg)
    with pytest.raises(SystemExit):
        run_all._scripts()
