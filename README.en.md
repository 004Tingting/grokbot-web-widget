# GrokBot Web Widget

简体中文 | English

A Grok-style animated avatar embeddable into any web page with a single
`<script>`. Zero dependencies, single file, Shadow DOM isolation — the render
loop fully stops when idle (near-zero cost for the host page).

> Released under **AGPL-3.0** (see [LICENSE](LICENSE)). Geometry and expression
> ring data come from [nasawz/GrokBot](https://github.com/nasawz/GrokBot)
> (Flutter, BSD-3-Clause); expression naming, blink profiles and micro-saccade
> design reference [bible-strong-avatar-lab](https://github.com/smontlouis/bible-strong-avatar-lab).
> See [NOTICE.md](NOTICE.md) for the full attribution list.

## Features

- **Gaze tracking** — cursor position sampled every 2s, eyes ease toward it
- **25 expressions** (48-point rings, spring morphing, semantic names) and
  **39 states** — each state binds an expression pool, switching cadence and a
  blink profile (natural / calm / attentive / active / reactive)
- **Micro-saccades** — tiny gaze offsets every 1.4–3.2s, can be disabled
- **Click cycling** through an expression sequence; **18 body shapes**
- **Themes** — light / dark / auto, overridable via CSS custom properties
- **Floating ball embed** — one `<script>` tag, positional & color options
- **Four-dimension performance budget** — ~25 KB gzip; 0 rAF when idle;
  per-shape shared Path2D cache (no per-instance duplication); no filters,
  shadows or blur; all timers suspended when the page is hidden

## Quick start

The widget is the single file `dist/grokbot.js` (~25 KB gzip) — copy it to your
site or reference it via CDN:

```html
<!-- Floating ball (bottom-right by default) -->
<script src="dist/grokbot.js" data-float></script>

<!-- Inline element -->
<script src="dist/grokbot.js"></script>
<grok-bot size="160" auto-expression state="thinking"></grok-bot>
```

```js
// JS API
const bot = window.__Widgets.grokbot.mount({
  size: 120, shape: 'blob', theme: 'dark', state: 'thinking',
  autoExpression: true, left: 20, bottom: 20, bodyColor: '#000000',
});
bot.blink();
```

Open `demo.html` directly in a browser (no network needed) to try it locally.

## Tuning

All runtime options (`size` `shape` `theme` `state` `expression` `auto-blink`
`auto-expression` `tracking` `ambient`) are documented in the source header and
`demo.html`. Deeper tuning (constants and data tables such as `STATES`,
`BLINK_PROFILES`, `SHAPES`, `CYCLE`) lives in `src/grokbot.template.js` — edit
it, then regenerate:

```bash
python tools/assemble.py
```

The full Chinese guide with a per-feature tuning table:
[README.md](README.md) · Design blueprint for the upcoming visual studio:
[TOOLPAGE.md](TOOLPAGE.md) · Attribution: [NOTICE.md](NOTICE.md).

## Compatibility

Chrome 90+ / Edge 90+ / Firefox 90+ / Safari 14+.

## License

**AGPL-3.0** — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) for third-party
attribution and obligations.
