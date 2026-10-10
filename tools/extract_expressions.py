"""Extract GrokBot expression eye-rings from expression_data.dart into JSON.

Usage: python extract_expressions.py <path-to-expression_data.dart> [output.json]

Output: grokbot-expressions.json — [{ e: [[48 (x,y) pairs left eye], [right eye]], ... }]
Coordinates stay in the widget's own space (viewbox 259, face center 114.2705).
"""
import json
import re
import sys

if len(sys.argv) < 2:
    sys.exit("usage: python extract_expressions.py <expression_data.dart> [out.json]")
src_path = sys.argv[1]
out_path = sys.argv[2] if len(sys.argv) > 2 else "expressions.json"

text = open(src_path, encoding="utf-8").read()

# Each point: Offset(x, y). Expressions nest as lists of lists of lists.
nums = re.findall(r"Offset\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)", text)
points = [(float(x), float(y)) for x, y in nums]
assert len(points) % (25 * 2 * 48) == 0, f"unexpected point count {len(points)}"

exprs = []
for e in range(25):
    base = e * 2 * 48
    eyes = []
    for eye in range(2):
        ring = points[base + eye * 48 : base + (eye + 1) * 48]
        eyes.append([[round(x, 2), round(y, 2)] for x, y in ring])
    exprs.append(eyes)

with open(out_path, "w", encoding="utf-8") as f:
    json.dump(exprs, f, separators=(",", ":"))

print(f"extracted {len(exprs)} expressions -> {out_path}")
print(f"json size: {len(json.dumps(exprs, separators=(',', ':')))} bytes")
