import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Agents refuse to start without their seeds. Tests use their own fixed
# values, set before any agent module runs load_dotenv (which never
# overrides a variable that is already set), so the real .env is never used.
for _name in ("POCKET_PILOT_SEED", "CARD_SCORER_SEED", "PAYMENT_PLANNER_SEED",
              "MERCHANT_RESOLVER_SEED"):
    os.environ[_name] = f"test-{_name.lower()}"
