"""Start Pocket Pilot and its three specialists with one command.

Each agent keeps running as its own process (its own asyncio loop, mailbox
client, seed-derived identity) exactly as it would if you started it alone --
this just saves you four terminals. Logs interleave in this one terminal,
each line already prefixed by its own agent name (uagents' own logger does
that), e.g. "[pocket-pilot]:", "[card-scorer]:", "[payment-planner]:",
"[merchant-resolver]:".

Run: python run_all.py   (with server/app.py already running)
Stop: Ctrl+C -- all four are terminated together.
"""
import os
import subprocess
import sys
import time

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import api_client  # noqa: E402
from seeds import missing_seeds  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = ["merchant_resolver_agent.py", "card_scorer_agent.py", "payment_planner_agent.py",
           "pocket_pilot_agent.py"]


def _check_flask():
    try:
        api_client.health()
        print(f"Flask API is up at {api_client._base_url()}")
    except api_client.ApiError as e:
        print(f"WARNING: Flask API isn't reachable yet ({e}). "
              "Start it with `cd server && python app.py` -- the agents will "
              "still start, but every answer will say the server is unreachable.")


def main():
    missing = missing_seeds()
    if missing:
        print(f"Missing from .env: {', '.join(missing)}. Each agent needs its own seed "
              "(a long random string, see .env.example). Not starting any agent.")
        sys.exit(1)
    _check_flask()
    procs = []
    try:
        for script in SCRIPTS:
            print(f"Starting {script} ...")
            procs.append(subprocess.Popen([sys.executable, os.path.join(HERE, script)]))
            time.sleep(1)  # stagger startup so logs are easier to read
        print("\nAll four agents starting. Press Ctrl+C to stop them.\n")
        for p in procs:
            p.wait()
    except KeyboardInterrupt:
        print("\nStopping all agents...")
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=10)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
