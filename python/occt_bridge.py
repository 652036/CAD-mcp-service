"""
Minimal Python bridge placeholder for future pythonocc-core integration.

Current role:
- documents the intended CLI contract
- allows the repository structure to match the CAD MCP roadmap
- can be invoked manually for environment smoke checks
"""

from __future__ import annotations

import json
import sys


def main() -> int:
    payload = {
        "success": True,
        "backend": "python-bridge-placeholder",
        "message": "pythonocc-core integration is not wired yet in this build",
        "argv": sys.argv[1:],
    }
    sys.stdout.write(json.dumps(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
