"""Temporary agent debug logging for runtime evidence."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

LOG_PATH = Path(__file__).resolve().parents[1] / "debug-370d1e.log"
SESSION_ID = "370d1e"


def agent_log(run_id: str, hypothesis_id: str, location: str, message: str, data: dict[str, Any]) -> None:
    payload = {
        "sessionId": SESSION_ID,
        "runId": run_id,
        "hypothesisId": hypothesis_id,
        "location": location,
        "message": message,
        "data": data,
        "timestamp": int(time.time() * 1000),
    }
    try:
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=True) + "\n")
    except Exception:
        pass
