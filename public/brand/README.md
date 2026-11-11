# Brand assets

The mark is a fingerprint arch: two ridges, the inner one ending early so the
shape reads as a print rather than a wifi symbol. All files have a transparent
canvas. There is no background colour baked into any export.

| File | Size | Use |
| --- | --- | --- |
| `logo.png` | 1024 x 1024 | mark on the soft plate, for apps, avatars, store listings |
| `logo.svg` | vector | same tile, for anything that scales |
| `logo-mark.png` | 1024 x 1024 | arch alone, no plate, for dark or photographic backgrounds |
| `logo-mark.svg` | vector | same mark |
| `logo-wordmark.png` | 2048 x 550 | horizontal lockup, arch plus `untrace` |
| `logo-wordmark.svg` | vector | same lockup, wordmark converted to outlines so it needs no font |

## Colours

| Token | Hex | Where |
| --- | --- | --- |
| Moss | `#4C7561` | the mark |
| Plate | `#EAF0EB` | the rounded tile behind the mark |
| Ink | `#1C1E1A` | the wordmark |

## Notes

- The tile corner radius is `13.5 / 48` of its side (about 28%).
- The wordmark is Instrument Serif at 268 units, tracking `-0.012em`, outlined.
- `public/favicon.svg` uses the same geometry at 32 px.
- Regenerating: the exports are produced from the SVG sources with
  `@resvg/resvg-js`, so editing `logo.svg` or `logo-mark.svg` and re-exporting is
  enough to keep everything in sync.
