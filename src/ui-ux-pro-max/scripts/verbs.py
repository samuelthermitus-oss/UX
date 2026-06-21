#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max — Verb command dispatcher.

Turns the CSV/BM25 engine into an ergonomic verb interface:

  audit     — UX/quality audit against the 99-rule knowledge base
  polish    — final pass: spacing, typography, color tokens, focus states
  critique  — visual hierarchy + emotional resonance review
  redesign  — full re-design pass with style + palette swap
  harden    — error handling, edge cases, i18n, empty states
  lint      — deterministic anti-pattern scanner (regex-based, no LLM)
  generate  — Higgsfield-backed image gen: hero | mobile
  brandkit  — Higgsfield-backed brand-kit asset pack

Each verb composes a domain query + a focused checklist that Claude can
consume directly. Generative verbs shell out to Higgsfield CLI.

Usage:
  python3 verbs.py <verb> [target] [options]
  python3 verbs.py audit src/app/page.tsx
  python3 verbs.py critique landing
  python3 verbs.py generate hero --prompt "matte black headphones, studio"
"""

import argparse
import io
import json
import shutil
import subprocess
import sys
from pathlib import Path

from core import CSV_CONFIG, search

# Force UTF-8 on Windows
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")

SCRIPTS_DIR = Path(__file__).parent


# ============ VERB DEFINITIONS ============
# Each verb declares (a) which engine queries to compose, (b) which severity
# levels to surface from ux-guidelines, (c) the checklist headline to print.

VERBS = {
    "audit": {
        "headline": "UX/quality audit",
        "intent": "Identify accessibility, performance, and interaction failures.",
        "queries": [
            ("ux", "accessibility contrast focus keyboard"),
            ("ux", "touch target loading error feedback"),
            ("ux", "performance image lazy bundle"),
        ],
        "min_severity": "High",
    },
    "polish": {
        "headline": "Final-pass polish",
        "intent": "Tighten spacing, hierarchy, typography, focus + hover states.",
        "queries": [
            ("ux", "spacing hierarchy typography line-height"),
            ("ux", "hover focus disabled state"),
            ("typography", "modern professional"),
        ],
        "min_severity": "Medium",
    },
    "critique": {
        "headline": "Design critique",
        "intent": "Review visual hierarchy, emotional tone, and structural clarity.",
        "queries": [
            ("style", "visual hierarchy whitespace"),
            ("ux", "visual hierarchy color contrast"),
            ("landing", "hero structure cta"),
        ],
        "min_severity": "Medium",
    },
    "redesign": {
        "headline": "Full redesign pass",
        "intent": "Propose a new style + palette + type system replacement.",
        "queries": [
            ("style", "modern premium"),
            ("color", "premium saas"),
            ("typography", "premium modern"),
        ],
        "min_severity": "Medium",
    },
    "harden": {
        "headline": "Production hardening",
        "intent": "Cover error states, empty states, loading, edge cases, i18n.",
        "queries": [
            ("ux", "error empty loading state"),
            ("ux", "validation form feedback"),
            ("ux", "skeleton placeholder fallback"),
        ],
        "min_severity": "High",
    },
}


# ============ HELPERS ============
SEVERITY_RANK = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}


def _query(domain: str, q: str, n: int = 3):
    """Run a single domain query through the existing engine."""
    try:
        return search(q, domain=domain, max_results=n)
    except Exception as exc:  # noqa: BLE001 — best-effort, surface as inline note
        return {"error": str(exc), "results": []}


def _severity_ok(row: dict, min_sev: str) -> bool:
    """Filter rules by minimum severity."""
    sev = row.get("Severity", "Medium")
    return SEVERITY_RANK.get(sev, 2) >= SEVERITY_RANK.get(min_sev, 2)


def _render_checklist_row(row: dict) -> str:
    """One-line checklist entry from a CSV row (works for ux and design rules)."""
    category = row.get("Category") or row.get("Style Category") or "—"
    issue = row.get("Issue") or row.get("Pattern Name") or row.get("Product Type") or ""
    severity = row.get("Severity", "")
    description = row.get("Description") or row.get("Notes") or ""
    do = row.get("Do", "")
    dont = row.get("Don't", "")

    lines = [f"- **[{severity or category}] {issue}**"]
    if description:
        lines.append(f"  - {description}")
    if do:
        lines.append(f"  - ✅ {do}")
    if dont:
        lines.append(f"  - ❌ {dont}")
    return "\n".join(lines)


def _render_results(results: list[dict], min_sev: str) -> list[str]:
    """Render a list of CSV rows as markdown bullets, filtered by severity."""
    out = []
    for row in results:
        if "Severity" in row and not _severity_ok(row, min_sev):
            continue
        out.append(_render_checklist_row(row))
    return out


# ============ KNOWLEDGE VERBS ============
def run_knowledge_verb(verb: str, subject: str | None) -> str:
    """Compose engine queries for audit/polish/critique/redesign/harden."""
    spec = VERBS[verb]
    out = []
    target = f" for `{subject}`" if subject else ""
    out.append(f"# uipro {verb}{target}")
    out.append(f"_{spec['intent']}_\n")
    out.append(f"## {spec['headline']}\n")

    for domain, query in spec["queries"]:
        result = _query(domain, query)
        if result.get("error") or not result.get("results"):
            continue
        out.append(f"### {domain.title()} · _{query}_\n")
        rendered = _render_results(result["results"], spec["min_severity"])
        if rendered:
            out.append("\n".join(rendered))
        else:
            out.append("_(no rules at this severity)_")
        out.append("")

    out.append("---")
    out.append(
        f"_Run `uipro lint {subject or '<path>'}` for a deterministic anti-pattern scan._"
    )
    return "\n".join(out)


# ============ LINT VERB (delegates to lint.py) ============
def run_lint(target: str, severity: str) -> str:
    """Call lint.py as a subprocess for clean separation."""
    cmd = [sys.executable, str(SCRIPTS_DIR / "lint.py"), target, "--severity", severity]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.stderr:
        print(proc.stderr, file=sys.stderr)
    return proc.stdout


# ============ GENERATE / BRANDKIT (Higgsfield-backed) ============
def _have_higgsfield() -> bool:
    return shutil.which("higgsfield") is not None


def run_generate(mode: str, prompt: str, output: str | None) -> str:
    """Wrap higgsfield product-photoshoot for hero/mobile/brandkit modes."""
    if not _have_higgsfield():
        return (
            "# uipro generate\n\n"
            "❌ Higgsfield CLI not found in PATH. Install it first:\n"
            "  brew install higgsfield\n"
            "Then: `higgsfield auth login`"
        )

    # Mode → Higgsfield mode mapping
    hf_mode = {
        "hero": "product_shot",
        "mobile": "conceptual_product",
        "lifestyle": "lifestyle_scene",
        "hand": "closeup_product_with_person",
    }.get(mode)
    if hf_mode is None:
        return (
            f"# uipro generate {mode}\n\n"
            f"❌ Unknown mode `{mode}`. Choose: hero | mobile | lifestyle | hand"
        )

    out_path = output or f"public/assets/generated/{mode}.png"
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "higgsfield",
        "product-photoshoot",
        "run",
        hf_mode,
        "--prompt",
        prompt,
        "--output",
        out_path,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)

    if proc.returncode != 0:
        return (
            f"# uipro generate {mode}\n\n"
            f"❌ Higgsfield failed (exit {proc.returncode})\n\n"
            f"**stderr:** ```\n{proc.stderr.strip()}\n```\n\n"
            f"Common fixes: `higgsfield auth login`, check credits with `higgsfield account`"
        )

    return (
        f"# uipro generate {mode}\n\n"
        f"✅ Wrote `{out_path}`\n\n"
        f"**prompt:** _{prompt}_\n\n"
        f"**Higgsfield mode:** `{hf_mode}`\n\n"
        f"Embed in Next.js: `<img src=\"/assets/generated/{mode}.png\" alt=\"...\" width=... height=... />`"
    )


def run_brandkit(prompt: str, output_dir: str) -> str:
    """Generate a 3-image brand kit pack (logo concept, color tile, typography mockup)."""
    if not _have_higgsfield():
        return (
            "# uipro brandkit\n\n❌ Higgsfield CLI not found. `brew install higgsfield`."
        )

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    results = []
    pack = {
        "logo": f"minimalist logo concept, {prompt}, monochrome, vector-clean, centered",
        "palette": f"color palette swatch grid, {prompt}, 6 swatches, hex labels visible",
        "type": f"typography specimen sheet, {prompt}, heading + body sample, clean",
    }
    for name, p in pack.items():
        path = out / f"brandkit-{name}.png"
        proc = subprocess.run(
            [
                "higgsfield",
                "product-photoshoot",
                "run",
                "conceptual_product",
                "--prompt",
                p,
                "--output",
                str(path),
            ],
            capture_output=True,
            text=True,
        )
        results.append((name, str(path), proc.returncode == 0, proc.stderr.strip()))

    lines = ["# uipro brandkit\n"]
    for name, path, ok, err in results:
        if ok:
            lines.append(f"✅ `{name}` → `{path}`")
        else:
            lines.append(f"❌ `{name}` failed — {err.splitlines()[-1] if err else 'see stderr'}")
    return "\n".join(lines)


# ============ ENTRYPOINT ============
def main() -> int:
    parser = argparse.ArgumentParser(prog="verbs", description="UI Pro Max verb dispatcher")
    parser.add_argument(
        "verb",
        choices=list(VERBS.keys()) + ["lint", "generate", "brandkit", "list"],
        help="Verb to invoke",
    )
    parser.add_argument("subject", nargs="?", default=None, help="Target path or topic")
    parser.add_argument("--prompt", default=None, help="Prompt for generate / brandkit")
    parser.add_argument("--output", default=None, help="Output path (generate) or dir (brandkit)")
    parser.add_argument(
        "--severity",
        choices=["Low", "Medium", "High", "Critical"],
        default="Medium",
        help="Min severity for lint",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON (where supported)")

    args = parser.parse_args()

    if args.verb == "list":
        print("# uipro verbs\n")
        for v, spec in VERBS.items():
            print(f"- **{v}** — {spec['intent']}")
        print("- **lint** — deterministic anti-pattern scanner")
        print("- **generate** — Higgsfield-backed image gen (hero | mobile | lifestyle | hand)")
        print("- **brandkit** — 3-image brand kit pack")
        return 0

    if args.verb in VERBS:
        print(run_knowledge_verb(args.verb, args.subject))
        return 0

    if args.verb == "lint":
        target = args.subject or "."
        print(run_lint(target, args.severity))
        return 0

    if args.verb == "generate":
        mode = args.subject or "hero"
        if not args.prompt:
            print("❌ generate requires --prompt", file=sys.stderr)
            return 2
        print(run_generate(mode, args.prompt, args.output))
        return 0

    if args.verb == "brandkit":
        if not args.prompt:
            print("❌ brandkit requires --prompt", file=sys.stderr)
            return 2
        print(run_brandkit(args.prompt, args.output or "public/assets/generated/brandkit"))
        return 0

    return 1


if __name__ == "__main__":
    sys.exit(main())
