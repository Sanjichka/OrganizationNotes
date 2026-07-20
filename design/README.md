# Design reference

`Orgo.dc.html` is the canonical visual reference for the app — a working,
interactive mockup of both the week and review views.

## Opening it

It needs `support.js` — the generated `dc-runtime` bundle — sitting next to it in
this folder. That file is **not committed**; it is a build artefact of the
`dc-runtime` project (`cd dc-runtime && bun run build`).

Drop your copy into `design/support.js`, then open `Orgo.dc.html` in a browser.
Without it the page renders blank.

Then serve the folder (the runtime fetches over HTTP, so `file://` will not work):

```bash
python3 -m http.server 8000
# → http://localhost:8000/design/Orgo.dc.html
```

## What you can change live

The mockup exposes three props:

| Prop | Default | Range |
|---|---|---|
| `rainbow` | `true` | off collapses all seven days to one hue |
| `chroma` | `0.13` | `0.04`–`0.18` |
| `showTimes` | `true` | show/hide the duration chip |

## What this is not

It is a **design artefact, not a starting codebase.**

- State is in memory. No persistence, no dates, no auth.
- Drag-and-drop uses HTML5 drag events, which are mouse-only and do nothing on a
  phone. The real app uses `@dnd-kit`'s touch sensor.
- There is no carry-over logic, no offline handling, no error states.

Read [`../docs/design-system.md`](../docs/design-system.md) for the extracted
rules — hues, the shading formula, type, spacing — rather than reverse-engineering
this file.

## A note on the source

The copy this was reconstructed from arrived with mis-encoded UTF-8 (`—`, `✓`,
`×`, `⠿`, `›`, `↵` had been mangled). Those glyphs were repaired by hand. If you
have the original file, diffing against it is worthwhile.
