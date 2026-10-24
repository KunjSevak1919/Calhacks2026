from decimal import Decimal

import pytest

import x402_config

KEYS = {"CDP_API_KEY_ID": "id", "CDP_API_KEY_SECRET": "secret", "CDP_WALLET_SECRET": "wallet"}


def test_all_keys_present_turns_x402_on():
    cfg = x402_config.load(dict(KEYS))
    assert cfg.enabled is True
    assert cfg.network == "eip155:84532"
    assert cfg.daily_cap_usd == Decimal("0.05")
    assert cfg.max_per_call_usd == Decimal("0.01")
    assert cfg.price_best_card_usd == Decimal("0.001")


@pytest.mark.parametrize("missing", list(KEYS))
def test_missing_key_turns_x402_off_and_names_only_the_key(missing):
    env = {k: v for k, v in KEYS.items() if k != missing}
    cfg = x402_config.load(env)
    assert cfg.enabled is False
    assert missing in cfg.reason
    line = x402_config.status_line(cfg)
    assert line.startswith("x402: off")
    for value in env.values():
        assert value not in line  # never print key values


def test_x402_enabled_off_wins_over_keys():
    cfg = x402_config.load({**KEYS, "X402_ENABLED": "off"})
    assert cfg.enabled is False
    assert "X402_ENABLED=off" in cfg.reason


def test_caps_come_from_env():
    cfg = x402_config.load({**KEYS, "X402_DAILY_CAP_USD": "0.02", "X402_MAX_PER_CALL_USD": "0.005"})
    assert cfg.daily_cap_usd == Decimal("0.02")
    assert cfg.max_per_call_usd == Decimal("0.005")


def test_bad_dollar_amount_is_an_error():
    with pytest.raises(x402_config.X402ConfigError):
        x402_config.load({**KEYS, "X402_DAILY_CAP_USD": "lots"})


def test_base_sepolia_passes_testnet_guard():
    x402_config.require_testnet(x402_config.load(dict(KEYS)))


@pytest.mark.parametrize("network", ["eip155:8453", "eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"])
def test_mainnet_refuses_to_start(network):
    cfg = x402_config.load({**KEYS, "X402_NETWORK": network})
    with pytest.raises(x402_config.X402ConfigError, match="not a test network"):
        x402_config.require_testnet(cfg)


def test_usdc_atomic_conversion():
    assert x402_config.usd_to_atomic("0.001", "eip155:84532") == 1000
    assert x402_config.atomic_to_usd("1000", "eip155:84532") == Decimal("0.001")


def test_tx_url_points_at_base_sepolia_explorer():
    assert x402_config.tx_url("eip155:84532", "0xabc") == "https://sepolia.basescan.org/tx/0xabc"
    assert x402_config.tx_url("eip155:84532", None) is None
