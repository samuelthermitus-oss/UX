# Public Live Data Source Catalog

A metadata registry of free, publicly-accessible, real-time (or near-real-time)
data sources — flights, trains/transit, satellite imagery/tracking, official
public traffic cameras, and internet/network health — so an application can
discover, in one place, what's available and how to connect to each one.

This is a **catalog, not an aggregator**: it does not poll, cache, or re-serve
any of the underlying data. Each entry points at the provider's own live API
so you always pull directly from source.

## Scope and exclusions

Every source listed here is:
- an **officially published, documented API or feed** from the operating
  organization (government agency, standards body, or a network that
  explicitly publishes crowdsourced data for public use), and
- **free to access** at least at a usable tier, and
- **live or near-live** — GTFS-RT, ADS-B position updates, orbital elements,
  traffic camera snapshots, etc. — not static/archival datasets, with the
  one noted exception (Ookla Open Data) kept in for background context and
  explicitly flagged as non-real-time.

**Deliberately excluded:** indexes of general/private CCTV (e.g. unsecured or
personal security cameras discovered by port-scanning). Only official
government-operated traffic camera programs are included under
`traffic-cameras`. Always check each provider's current terms of service —
"free" tiers, rate limits, and attribution requirements change over time and
are the provider's to define, not this catalog's.

## Layout

```
public-data-metadata/
├── data/
│   └── sources.csv      # canonical registry - one row per data source
├── scripts/
│   └── search.py         # CLI to query/filter the registry
├── webapp/                # real-time flights + satellites dashboard (see webapp/README.md)
└── README.md
```

## Live dashboard

The catalog itself is read-only metadata. For an actual real-time view —
live aircraft positions and live satellite ground tracks on a map, updating
continuously — see [`webapp/`](webapp/README.md). It's a small FastAPI +
vanilla-JS app you run locally (`pip install -r requirements.txt && python3
server.py`), currently covering the `flights` and `satellite-tracking`
categories from the catalog below.

## Schema (`data/sources.csv`)

| column | meaning |
|---|---|
| `id` | short stable identifier |
| `category` | one of `flights`, `trains`, `satellite-imagery`, `satellite-tracking`, `traffic-cameras`, `network` |
| `name` | source/API name |
| `provider` | organization operating the source |
| `endpoint_url` | base API/data endpoint |
| `docs_url` | documentation link |
| `auth_type` | authentication required, if any |
| `cost` | free / free tier + paid / etc. |
| `real_time` | whether updates are live, and roughly how live |
| `update_frequency` | how often data refreshes |
| `coverage` | geographic scope |
| `format` | data format(s) returned |
| `license` | usage terms as published by the provider (verify current terms before relying on this) |
| `attribution_required` | whether the provider asks for attribution |
| `notes` | caveats: rate limits, coverage gaps, ToS changes, etc. |

## Usage

```bash
# List everything in a category
python3 scripts/search.py --category flights

# Free-text search across all fields
python3 scripts/search.py "gtfs germany"

# Only sources that are genuinely live right now
python3 scripts/search.py --real-time-only

# See available categories
python3 scripts/search.py --list-categories
```

No external dependencies — Python 3 standard library only.

## Extending the catalog

Add a row to `data/sources.csv` following the schema above. Prefer sources
that publish an explicit open-data policy or ToS over ones inferred from
usage; note any rate limit or licensing caveat in `notes` rather than
omitting it.
