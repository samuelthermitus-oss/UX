#!/usr/bin/env python3
"""Query the public real-time data source catalog (data/sources.csv)."""
import argparse
import csv
import os
import sys

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sources.csv")

CATEGORIES = [
    "flights",
    "trains",
    "satellite-imagery",
    "satellite-tracking",
    "traffic-cameras",
    "network",
]


def load_sources():
    with open(DATA_PATH, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def matches(row, query, category, real_time_only):
    if category and row["category"] != category:
        return False
    if real_time_only and row["real_time"].strip().lower().startswith("no"):
        return False
    if not query:
        return True
    haystack = " ".join(row.values()).lower()
    return all(term in haystack for term in query.lower().split())


def print_row(row):
    print(f"[{row['id']}] {row['name']}  ({row['category']})")
    print(f"    provider:     {row['provider']}")
    print(f"    endpoint:     {row['endpoint_url']}")
    print(f"    docs:         {row['docs_url']}")
    print(f"    auth:         {row['auth_type']}   cost: {row['cost']}")
    print(f"    real-time:    {row['real_time']}   update freq: {row['update_frequency']}")
    print(f"    coverage:     {row['coverage']}")
    print(f"    format:       {row['format']}")
    print(f"    license:      {row['license']}   attribution required: {row['attribution_required']}")
    print(f"    notes:        {row['notes']}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Search the public real-time data source catalog")
    parser.add_argument("query", nargs="?", default="", help="free-text search across all fields")
    parser.add_argument("--category", choices=CATEGORIES, help="filter by category")
    parser.add_argument("--real-time-only", action="store_true", help="exclude sources that are not live/real-time")
    parser.add_argument("--list-categories", action="store_true", help="list available categories and exit")
    args = parser.parse_args()

    if args.list_categories:
        for c in CATEGORIES:
            print(c)
        return

    rows = load_sources()
    results = [r for r in rows if matches(r, args.query, args.category, args.real_time_only)]

    if not results:
        print("No sources matched.", file=sys.stderr)
        return

    for row in results:
        print_row(row)
    print(f"{len(results)} source(s) found.")


if __name__ == "__main__":
    main()
