"""Expected native refusals that can cross the worker protocol without SQL imports."""
STATUSES = {"invalid_configuration": 400, "invalid_asset": 400, "asset_not_editable": 403,
            "asset_conflict": 409, "revision_conflict": 409}


class NativeRefusal(ValueError):
    def __init__(self, code, detail):
        if code not in STATUSES:
            raise ValueError("Unknown native refusal code")
        self.code = code
        super().__init__(detail)
