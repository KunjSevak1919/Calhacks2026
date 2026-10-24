import requests

import x402_chain

USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
WHO = "0x5ccA87D7f2bdaEE1008aBF4f1A788c61fdF7561E"
NONCE = "0x" + "ab" * 32


class FakeRpc:
    def __init__(self, results):
        self.results = results
        self.calls = []

    def __call__(self, url, json, timeout):
        self.calls.append(json)
        result = self.results[json["method"]]
        if isinstance(result, Exception):
            raise result

        class Resp:
            def json(self_inner):
                return {"error": result["error"]} if isinstance(result, dict) and "error" in result \
                    else {"result": result}
        return Resp()


def test_selector_and_topic_match_the_usdc_contract():
    # Known values for authorizationState(address,bytes32) and the
    # AuthorizationUsed(address,bytes32) event (EIP-3009).
    assert x402_chain.AUTHORIZATION_STATE == "0xe94a0102"
    assert x402_chain.AUTHORIZATION_USED_TOPIC == \
        "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5"


def test_authorization_used_true_and_false():
    used = FakeRpc({"eth_call": "0x" + "0" * 63 + "1"})
    assert x402_chain.authorization_used("rpc", USDC, WHO, NONCE, post=used) is True
    data = used.calls[0]["params"][0]["data"]
    assert data.startswith("0xe94a0102") and WHO[2:].lower() in data and "ab" * 32 in data
    unused = FakeRpc({"eth_call": "0x" + "0" * 64})
    assert x402_chain.authorization_used("rpc", USDC, WHO, NONCE, post=unused) is False


def test_unreachable_chain_is_unknown_not_false():
    down = FakeRpc({"eth_call": requests.ConnectionError("no wifi")})
    assert x402_chain.authorization_used("rpc", USDC, WHO, NONCE, post=down) is None


def test_find_tx_uses_a_window_the_public_rpc_accepts():
    rpc = FakeRpc({"eth_blockNumber": hex(1000), "eth_getLogs": [{"transactionHash": "0xfound"}]})
    assert x402_chain.find_authorization_tx("rpc", USDC, WHO, NONCE, post=rpc) == "0xfound"
    query = rpc.calls[1]["params"][0]
    assert int(query["toBlock"], 16) - int(query["fromBlock"], 16) < 200
    assert query["topics"][0] == x402_chain.AUTHORIZATION_USED_TOPIC


def test_find_tx_rpc_error_is_none():
    rpc = FakeRpc({"eth_blockNumber": hex(1000), "eth_getLogs": {"error": {"code": -32614}}})
    assert x402_chain.find_authorization_tx("rpc", USDC, WHO, NONCE, post=rpc) is None


def test_authorization_of_reads_payload_dicts():
    payload = {"payload": {"authorization": {"from": WHO, "nonce": NONCE, "validBefore": "1700000000"}}}
    assert x402_chain.authorization_of(payload) == (WHO, NONCE, 1700000000)
    assert x402_chain.authorization_of({"payload": {}}) is None
