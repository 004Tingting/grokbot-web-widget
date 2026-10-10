"""Assemble the distributable grokbot.js: inject ALL 25 expression rings
into src/grokbot.template.js at the /*__RINGS__*/ marker.

Semantic names follow bible-strong-avatar-lab (web port of the same
25-expression system); index alignment verified against grokbot_widget
state_data.dart pools (idle [0,8], thinking [8,16,14,17,5], ...).

Outputs: src/grokbot.js 与 dist/grokbot.js（同一内容，单文件产物）
"""
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent

NAMES = [
    "upward-side-glance",    # 00
    "downward-gaze",         # 01
    "joyful-down-right",     # 02
    "surprised-left",        # 03
    "sleepy-squint",         # 04
    "skeptical-right",       # 05
    "small-attentive",       # 06
    "angry-right",           # 07
    "curious-left",          # 08
    "asymmetric-down-right", # 09
    "attentive-left",        # 10
    "joyful-wide",           # 11
    "wide-downward-gaze",    # 12
    "eyes-closed",           # 13
    "skeptical-left",        # 14
    "far-right-glance",      # 15
    "angry-left",            # 16
    "playful-right",         # 17
    "asymmetric-up-left",    # 18
    "gentle-downward-gaze",  # 19
    "wide-down-left",        # 20
    "surprised-wide-left",   # 21
    "drowsy-closed",         # 22
    "suspicious-right",      # 23
    "shy-downward",          # 24
]

def fmt(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s else "0"

def main() -> None:
    exprs = json.loads((HERE / "expressions.json").read_text(encoding="utf-8"))
    assert len(exprs) == len(NAMES)
    rings = []
    for idx, eyes in enumerate(exprs):
        flat = ["[" + ",".join(fmt(x) for pt in eye for x in pt) + "]" for eye in eyes]
        rings.append(f"  /* {idx:02d} {NAMES[idx]} */\n  [" + ",".join(flat) + "]")
        assert len(eyes) == 2 and all(len(eye) == 48 for eye in eyes), idx
    literal = "[\n" + ",\n".join(rings) + "\n]"

    template = (ROOT / "src" / "grokbot.template.js").read_text(encoding="utf-8")
    marker = "/*__RINGS__*/null"
    assert marker in template, "marker missing in template"
    out = template.replace(marker, literal, 1)

    for rel in ("src/grokbot.js", "dist/grokbot.js"):
        path = ROOT / rel
        path.write_text(out, encoding="utf-8", newline="\n")
        print(f"{rel}: {path.stat().st_size} bytes")

if __name__ == "__main__":
    main()
