# Data Sources & Provenance

This prototype uses **only public-domain CMS data and clearly-labeled synthetic
data**. No proprietary, PHI, or real patient data appears anywhere in this repo.

## Public-domain CMS sources

| File | Content | Provenance |
|------|---------|-----------|
| `data/cms-ncds.json` | National Coverage Determination (NCD) summaries | Public domain — coverage.cms.gov (U.S. federal government work, 17 U.S.C. § 105) |
| `data/cms-lcds.json` | Local Coverage Determination (LCD) summaries from Medicare Administrative Contractors | Public domain — coverage.cms.gov |

The NCD/LCD summaries are **representative excerpts** of public CMS coverage
language, cached and committed so that Track 1 requires **no live CMS API
call**. Each record links to its source via `full_text_url` (NCDs). The cache
date is recorded in each file's `_meta` block.

CPT descriptors referenced in this demo are limited to the public, widely-cited
subset (e.g. 27447 = total knee arthroplasty, 99213 = established-patient office
visit). ICD-10-CM codes (e.g. M17.11, J06.9) are public CMS/CDC code
definitions.

## Synthetic data (clearly labeled)

| File | Content | Provenance |
|------|---------|-----------|
| `data/synthetic-payers.json` | Three fictional payer profiles and their overlay criteria | **SYNTHETIC** — authored for this demo only; not real payer policy |
| `data/mock-gap-analysis.json` | Deterministic fixture returned when `MOCK_LLM=true` | **SYNTHETIC** — illustrative gap assessments |

The synthetic payers (`PAYER_COMMERCIAL_A`, `PAYER_MEDICARE_ADV_B`,
`PAYER_MEDICAID_C`) model the **payer-specific overlay layer** that sits on top
of the federal CMS baseline — the layer Anthropic's CMS Connector is not
designed to supply. Every synthetic file carries a `_meta.disclaimer` field
stating that the data is fictional.

## Why two layers

A real prior-authorization determination requires both:

1. **Federal baseline** — what CMS covers nationally (NCD) and regionally (LCD).
   Supplied in production by Anthropic's CMS Connector.
2. **Payer overlay** — the additional commercial / Medicare Advantage / Medicaid
   criteria layered on top. Supplied by this server.

For CPT 27447 there is deliberately **no NCD** (`NCD-NONE-27447`), which is
true to reality: major joint replacement has no national determination and is
governed by LCDs plus payer policy. That makes it the ideal demonstration of
why the overlay layer is necessary.

## Regenerating the knowledge store

The committed JSON is the source of truth. To rebuild the SQLite store:

```bash
npm run seed          # runs seed:cms then seed:payers
```

The seed scripts use a **content-hash check** (`_seed_hashes` table): on a
re-seed, only records whose content changed are re-written.
