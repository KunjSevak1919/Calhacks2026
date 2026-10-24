"""CDP Server Wallet accounts for x402 (Coinbase Developer Platform, cdp-sdk).

CdpClient() reads CDP_API_KEY_ID, CDP_API_KEY_SECRET and CDP_WALLET_SECRET
from the environment itself; this module never reads, prints or logs them.
Private keys stay inside CDP: EvmLocalAccount asks CDP to sign each payment
over its own synchronous HTTP client, which is what x402's sync client needs.

Everything here talks to the network, so tests fake it instead.
get_accounts() runs its own event loop: call it from a plain thread
(asyncio.to_thread from inside an agent), never from a running loop.
"""
import asyncio
from decimal import Decimal


async def _get_accounts(names):
    from cdp import CdpClient

    async with CdpClient() as cdp:
        return {name: await cdp.evm.get_or_create_account(name=name) for name in names}


def get_accounts(names):
    """{name: EvmServerAccount}, creating any that don't exist yet."""
    return asyncio.run(_get_accounts(list(names)))


def address_for(name):
    return get_accounts([name])[name].address


def signer_for(name):
    """An x402 ClientEvmSigner backed by the named CDP account."""
    from cdp.evm_local_account import EvmLocalAccount
    from x402.mechanisms.evm.signers import EthAccountSigner

    return EthAccountSigner(EvmLocalAccount(get_accounts([name])[name]))


async def _request_test_usdc(address, faucet_network):
    from cdp import CdpClient

    async with CdpClient() as cdp:
        return await cdp.evm.request_faucet(address=address, network=faucet_network, token="usdc")


def request_test_usdc(address, faucet_network):
    """Ask CDP's testnet faucet for test USDC. Returns the faucet tx hash."""
    return asyncio.run(_request_test_usdc(address, faucet_network))


async def _usdc_balance(address, faucet_network, usdc):
    from cdp import CdpClient

    async with CdpClient() as cdp:
        result = await cdp.evm.list_token_balances(address=address, network=faucet_network)
    for b in result.balances:
        if b.token.contract_address.lower() == usdc.lower():
            return Decimal(b.amount.amount) / (10 ** b.amount.decimals)
    return Decimal(0)


def usdc_balance(address, network):
    """Test USDC balance in dollars, from CDP's onchain data API."""
    import x402_config

    net = x402_config.TESTNETS[network]
    return asyncio.run(_usdc_balance(address, net["faucet_network"], net["usdc"]))
