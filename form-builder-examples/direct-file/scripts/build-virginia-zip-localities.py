#!/usr/bin/env python3
"""Builds website-static/data/virginia-zip-localities.json, the ZIP-to-locality lookup behind
the locality screen (website-static/js/virginia-locality.js).

Input: the Census Bureau's 2020 ZCTA-to-county relationship file, downloaded by hand:
  https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
  python3 scripts/build-virginia-zip-localities.py <that file>

Virginia's 3-digit Form 760 locality codes are the county and independent-city FIPS codes, so
the file's county GEOID (51 + code) joins straight to facts/virginiaLocalities.xml. A ZIP lists
every locality holding at least MIN_SHARE of its land area, largest first; one entry means the
screen can fill the locality in, more than one means it asks. ZCTAs approximate ZIP codes
(a PO-box-only ZIP has no ZCTA, and is simply not found), and land area is not population:
a ZIP 90% in a county by area can be mostly people in the city next to it. The filer confirms
the answer either way. A state build would geocode the street address instead.
"""
import csv, json, pathlib, re, sys
from collections import defaultdict

MIN_SHARE = 0.01
HERE = pathlib.Path(__file__).resolve().parents[1] / "src/main/resources/direct-file"

xml = (HERE / "facts/virginiaLocalities.xml").read_text()
codes = xml[xml.index('<Fact path="/vaLocalityCode">'):]
codes = codes[:codes.index("</Fact>")]
slug_by_code = {code: slug for slug, code in re.findall(
    r'<Enum optionsPath="/vaLocalityOptions">([^<]+)</Enum>.*?<Then><String>(\d{3})</String>', codes, re.S)}
flow = (HERE / "flow/your-taxes-virginia.xml").read_text()
name_by_slug = dict(re.findall(r'<option value="([a-z-]+)">([^<]+)</option>', flow))
assert len(slug_by_code) == 133, len(slug_by_code)

land = defaultdict(dict)
total = {}
with open(sys.argv[1], encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f, delimiter="|"):
        zcta, county = row["GEOID_ZCTA5_20"], row["GEOID_COUNTY_20"]
        if not zcta or not county.startswith("51"):
            continue
        land[zcta][slug_by_code[county[2:]]] = int(row["AREALAND_PART"])
        total[zcta] = int(row["AREALAND_ZCTA5_20"])

out = {"_comment": "ZIP (2020 ZCTA) to the Virginia localities holding at least 1% of its land area, "
                   "largest first, as [option value, name]. Built by scripts/build-virginia-zip-localities.py "
                   "from the Census Bureau's 2020 ZCTA-to-county relationship file."}
for zcta in sorted(land):
    parts = sorted(land[zcta].items(), key=lambda kv: -kv[1])
    keep = [slug for slug, area in parts if total[zcta] and area / total[zcta] >= MIN_SHARE] or [parts[0][0]]
    out[zcta] = [[slug, name_by_slug[slug]] for slug in keep]

dest = HERE / "website-static/data/virginia-zip-localities.json"
dest.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
split = sum(1 for k, v in out.items() if not k.startswith("_") and len(v) > 1)
print(f"{len(out) - 1} ZIPs, {split} crossing a city or county line, written to {dest.relative_to(HERE.parents[3])}")
