#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max — Deterministic anti-pattern linter.

Scans HTML / JSX / TSX / Vue / Svelte files for common UI anti-patterns that
the ui-ux-pro-max knowledge base teaches against. Pure regex — no LLM, no
network, no API key.

Rules are versioned in CSV (`data/lint-rules.csv`) so they're auditable and
contributable. Each rule has:
  - id, name, pattern, severity, category, description, remediation, file_globs

Usage:
  python3 lint.py <path>                  # scans path (file or dir)
  python3 lint.py src/ --severity High    # min severity filter
  python3 lint.py src/ --json             # machine-readable output
"""

import argparse
import csv
import io
import json
import re
import sys
from pathlib import Path

# Force UTF-8 on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DATA_DIR = Path(__file__).parent.parent / "data"
RULES_FILE = DATA_DIR / "lint-rules.csv"

SEVERITY_RANK = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}
SCANNABLE_EXT = {".html", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro"}

# Files/dirs we never descend into
IGNORE_DIRS = {
    "node_modules", ".next", ".turbo", "dist", "build", "out",
    ".git", ".vercel", "coverage", "__pycache__", ".firecrawl",
}


def load_rules() -> list[dict]:
    """Load lint rules from CSV. Falls back to built-in defaults if missing."""
    if RULES_FILE.exists():
        with open(RULES_FILE, encoding="utf-8") as f:
            return list(csv.DictReader(f))
    return DEFAULT_RULES


# Built-in default ruleset — used if data/lint-rules.csv doesn't exist yet.
# Mirrors a subset of the ui-ux-pro-max ux-guidelines.csv anti-patterns.
DEFAULT_RULES: list[dict] = [
    {
        "id": "L001",
        "name": "Emoji used as icon",
        "pattern": r">\s*[\U0001F300-\U0001FAFF\U00002600-\U000027BF]\s*<",
        "severity": "High",
        "category": "Visual",
        "description": "Emoji rendered inside an element looks like a structural icon — inconsistent across platforms.",
        "remediation": "Replace with a vector icon (lucide-react, @heroicons/react, react-icons).",
    },
    {
        "id": "L002",
        "name": "Image missing alt",
        "pattern": r"<img(?![^>]*\balt\s*=)[^>]*>",
        "severity": "Critical",
        "category": "Accessibility",
        "description": "<img> without an alt attribute fails screen readers.",
        "remediation": "Add alt='' for decorative images or alt='descriptive text' for meaningful ones.",
    },
    {
        "id": "L003",
        "name": "Icon-only button without aria-label",
        "pattern": r"<button(?![^>]*\baria-label\s*=)[^>]*>\s*<(?:svg|[A-Z][A-Za-z]+Icon)",
        "severity": "Critical",
        "category": "Accessibility",
        "description": "Icon-only <button> with no accessible name is unreachable for assistive tech.",
        "remediation": "Add aria-label='Action name' to the button.",
    },
    {
        "id": "L004",
        "name": "Raw hex color in JSX className",
        "pattern": r"className=[\"'`][^\"'`]*#[0-9a-fA-F]{3,8}",
        "severity": "Medium",
        "category": "Design tokens",
        "description": "Hardcoded hex color inside a className string bypasses your token system.",
        "remediation": "Use a CSS variable (var(--accent)) or a Tailwind color class.",
    },
    {
        "id": "L005",
        "name": "Inline style raw hex",
        "pattern": r"style=\{\{[^}]*:\s*['\"]#[0-9a-fA-F]{3,8}['\"]",
        "severity": "Medium",
        "category": "Design tokens",
        "description": "Inline-style hex color bypasses the design system.",
        "remediation": "Move the color into a CSS variable or Tailwind class.",
    },
    {
        "id": "L006",
        "name": "Outline removed without replacement focus ring",
        "pattern": r"outline:\s*none|outline:\s*0[^a-zA-Z]",
        "severity": "High",
        "category": "Accessibility",
        "description": "Removing outline kills keyboard focus visibility unless a replacement ring is provided.",
        "remediation": "Use focus-visible:ring or :focus-visible { outline: ... } instead of outline:none.",
    },
    {
        "id": "L007",
        "name": "Click handler on non-button element without role",
        "pattern": r"<div[^>]*\bonClick\s*=(?![^>]*\brole\s*=)",
        "severity": "High",
        "category": "Accessibility",
        "description": "<div onClick> is not a button — keyboard users can't activate it.",
        "remediation": "Use <button> or add role='button' + tabIndex=0 + onKeyDown.",
    },
    {
        "id": "L008",
        "name": "Animating width / height / top / left",
        "pattern": r"transition[^;]*(?:\b(?:width|height|top|left|right|bottom)\b)",
        "severity": "Medium",
        "category": "Performance",
        "description": "Animating layout properties triggers reflow — animate transform/opacity instead.",
        "remediation": "Use translate3d / scale / opacity for the same effect at 60fps.",
    },
    {
        "id": "L009",
        "name": "Disabled zoom in viewport",
        "pattern": r"<meta[^>]*name=[\"']viewport[\"'][^>]*(?:user-scalable=no|maximum-scale=1)",
        "severity": "Critical",
        "category": "Accessibility",
        "description": "Disabling pinch-zoom violates WCAG. Users with low vision cannot read content.",
        "remediation": "Use content='width=device-width, initial-scale=1' only.",
    },
    {
        "id": "L010",
        "name": "Placeholder used as label",
        "pattern": r"<input(?![^>]*\b(?:aria-label|aria-labelledby)\s*=)(?:(?!<input)[^>])*\bplaceholder\s*=",
        "severity": "High",
        "category": "Forms",
        "description": "Placeholder-only inputs lose context once the user starts typing.",
        "remediation": "Add a visible <label> or aria-label.",
    },
    {
        "id": "L011",
        "name": "Anchor without href used as button",
        "pattern": r"<a(?![^>]*\bhref\s*=)[^>]*\bonClick\s*=",
        "severity": "Medium",
        "category": "Semantics",
        "description": "<a onClick> without href is not keyboard-focusable.",
        "remediation": "Use <button> if it's an action, or add href='#' + preventDefault as a last resort.",
    },
    {
        "id": "L012",
        "name": "Fixed 100vh on mobile-facing root",
        "pattern": r"min-h-\[?100vh\]?(?![a-z])|height:\s*100vh",
        "severity": "Low",
        "category": "Mobile",
        "description": "100vh includes mobile browser chrome — content gets pushed off-screen.",
        "remediation": "Prefer min-h-dvh (dynamic viewport) or 100svh.",
    },
]


def iter_files(target: Path):
    """Yield scannable files under target (file or dir)."""
    if target.is_file():
        if target.suffix in SCANNABLE_EXT:
            yield target
        return
    for p in target.rglob("*"):
        if p.is_dir():
            continue
        if any(part in IGNORE_DIRS for part in p.parts):
            continue
        if p.suffix in SCANNABLE_EXT:
            yield p


def scan_file(path: Path, rules: list[dict], min_sev: str) -> list[dict]:
    """Run all rules against one file, return list of findings."""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []

    findings = []
    for rule in rules:
        if SEVERITY_RANK.get(rule["severity"], 2) < SEVERITY_RANK.get(min_sev, 2):
            continue
        try:
            pattern = re.compile(rule["pattern"], re.MULTILINE)
        except re.error:
            continue
        for m in pattern.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            findings.append(
                {
                    "file": str(path),
                    "line": line,
                    "rule_id": rule["id"],
                    "rule": rule["name"],
                    "severity": rule["severity"],
                    "category": rule["category"],
                    "snippet": m.group(0)[:120].replace("\n", " "),
                    "remediation": rule["remediation"],
                }
            )
    return findings


def render_markdown(findings: list[dict], target: str, scanned: int) -> str:
    if not findings:
        return (
            f"# uipro lint — clean\n\n"
            f"✅ No anti-patterns found in `{target}` ({scanned} files scanned)."
        )

    by_sev: dict[str, list[dict]] = {}
    for f in findings:
        by_sev.setdefault(f["severity"], []).append(f)

    out = [f"# uipro lint — `{target}`\n"]
    out.append(f"**{len(findings)} finding(s) across {scanned} files.**\n")
    for sev in ("Critical", "High", "Medium", "Low"):
        if sev not in by_sev:
            continue
        out.append(f"## {sev} ({len(by_sev[sev])})\n")
        for f in by_sev[sev]:
            out.append(
                f"- `{f['file']}:{f['line']}` — **{f['rule']}** _({f['rule_id']})_"
            )
            out.append(f"  - {f['snippet']}")
            out.append(f"  - 🛠 {f['remediation']}")
        out.append("")
    return "\n".join(out)


def main() -> int:
    p = argparse.ArgumentParser(prog="lint", description="UI/UX Pro Max linter")
    p.add_argument("target", nargs="?", default=".", help="File or directory to scan")
    p.add_argument(
        "--severity",
        choices=["Low", "Medium", "High", "Critical"],
        default="Medium",
    )
    p.add_argument("--json", action="store_true", help="JSON output")
    args = p.parse_args()

    target = Path(args.target)
    if not target.exists():
        print(f"❌ Path not found: {target}", file=sys.stderr)
        return 2

    rules = load_rules()
    files = list(iter_files(target))
    findings: list[dict] = []
    for f in files:
        findings.extend(scan_file(f, rules, args.severity))

    if args.json:
        print(json.dumps({"target": str(target), "scanned": len(files), "findings": findings}, indent=2))
    else:
        print(render_markdown(findings, str(target), len(files)))

    # Exit non-zero if any Critical/High findings — useful in CI
    critical = sum(1 for f in findings if f["severity"] in ("Critical", "High"))
    return 1 if critical else 0


if __name__ == "__main__":
    sys.exit(main())
