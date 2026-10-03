# Data provenance

## Reference data

- Dataset: `penguins.csv`, the simplified Palmer Penguins dataset.
- Provider: [allisonhorst/palmerpenguins](https://github.com/allisonhorst/palmerpenguins).
- Exact download URL: `https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv`.
- License: [CC0-1.0](https://allisonhorst.github.io/palmerpenguins/LICENSE.html).
- Retrieved: 2026-10-03. The vendored content hash, not a mutable branch name, identifies the exact bytes used.
- Canonical SHA-256 and download metadata: `data/manifest.json`. Runtime checks fail closed on a mismatch.
- Primary documentation and findings: [Horst, Hill and Gorman, 2022, R Journal, DOI 10.32614/RJ-2022-020](https://journal.r-project.org/articles/RJ-2022-020/).

The source article credits the original measurements to Kristen Gorman and Palmer Station LTER. This application distributes the simplified public CSV, not original field sheets.

## Schema

| Column | Type / unit |
|---|---|
| species | Adélie (CSV `Adelie`), Chinstrap, Gentoo |
| island | Island category |
| bill_length_mm | Numeric millimeters |
| bill_depth_mm | Numeric millimeters |
| flipper_length_mm | Numeric millimeters; not modeled here |
| body_mass_g | Numeric grams; not modeled here |
| sex | Category or missing; proposed follow-up variable |
| year | Integer collection year |

There are 344 original rows. Drop rows missing only the fields used in this experiment: bill length, bill depth, species, year. This leaves 342 complete cases. Do not discard birds merely because sex is missing in an analysis that does not model sex. No imputation, normalization, fabricated values or synthetic augmentation.

## Retrieval and reproduction

```powershell
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv' -OutFile data/penguins.csv
python scripts/seed_catalog.py
python scripts/seed_verified_run.py
```

Re-running `seed_catalog.py` intentionally re-versions the manifest; review upstream changes before doing this. For exact reproduction, keep the bundled bytes and original manifest. Each result stores the data hash, scientific code hash, library versions, method, seed, bootstrap count and timestamp.

`data/evidence.json` is a manually curated, attributed reference catalog, not a live literature search. It retains citation title, authors, year, DOI, URL, retrieval date and article location. It stores two claims from one source; source counts never inflate this to two papers. Live Omnigent retrieves this same catalog through its LiteratureAgent tool. Broad literature API search is not implemented in this scoped release.

`data/verified-run.json` was produced by executing the actual computation. It is labeled `local`. The seed script records automated developer authorization explicitly, so its approval is not counted as a human UI interaction. New UI runs preserve their separate click approval.
