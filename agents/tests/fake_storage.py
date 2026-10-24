class FakeStorage:
    """Minimal stand-in for uagents' ctx.storage: .get(key) / .set(key, value)."""

    def __init__(self):
        self._data = {}

    def get(self, key):
        return self._data.get(key)

    def set(self, key, value):
        self._data[key] = value
