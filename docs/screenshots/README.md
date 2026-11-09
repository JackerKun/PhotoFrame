# PhotoFrame README captures

Real browser UI from version 1.0.0, with four generated landscapes and manually entered demonstration metadata. No personal photographs, EXIF or browser profile are used. The editor itself is not modified for the captures.

| Asset                  | Content                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `workspace.webp`       | Presets, bottom filmstrip and framed preview                        |
| `film-frame.webp`      | 135 film border, stock search and custom edge lettering       |
| `border-editor.webp`   | Warm-paper theme, materials and frame handles                |
| `sticker-library.webp` | Darkroom theme and vector Nikon F sticker                    |
| `crop-editor.webp`     | XPan crop, rotation and flip controls                                          |
| `batch-sync.webp`      | Guided style synchronization                                 |
| `collage.webp`         | Styled four-image collage                                    |
| `terrain-map.webp`     | Val di Funes contours blended into a sample photo            |
| `city-map.webp`        | Saint Petersburg streets on a white margin with custom fill |
| `export.webp`          | JPEG / PNG export with original resolution selected                                   |
| `mobile-editor.webp`   | 390 × 844 mobile preview                                     |
| `mobile-tools.webp`    | Mobile border / font bottom sheet                            |
| `demo-photo.jpg`       | Generated source image for visitors to try                   |
| `result.jpg`           | Actual JPEG downloaded through the application's save action |
| `result.webp`          | Compressed documentation preview of `result.jpg`             |
| `capture-report.json`  | Version, asset counts, dimensions and export evidence        |

## Reproduce

With Node.js 20+, locked dependencies and Google Chrome installed:

```bash
npm ci
node scripts/screenshots.cjs
```

To use a different Chrome / Chromium executable or output folder:

```bash
PHOTOFRAME_SCREENSHOT_BROWSER="/absolute/path/to/chromium" \
PHOTOFRAME_SCREENSHOT_DIR="/absolute/path/to/output" \
node scripts/screenshots.cjs
```

The script starts a static server on an automatically allocated loopback port, opens isolated desktop / mobile browser contexts, generates four local PNG inputs and interacts with the actual controls. It waits for rendering and operation messages to settle, checks for uncaught page errors and verifies a real JPEG download. Before filling mobile fields, it taps the location input and asserts focus; a sheet covered by its backdrop therefore fails capture rather than producing an apparently valid screenshot. Browser contexts, downloads and the server are closed afterward; no existing browser session is opened.

The landscapes come from the SVG recipe in `scripts/screenshots.cjs`. The map shots use the bundled samples and their [data credits](../../assets/maps/README.md). Export fields are demonstration values, not extracted EXIF. The camera sticker is an existing vector illustration; no external photographic asset is fetched for the captures. WebP conversion keeps image dimensions while reducing README payload.

Review every screenshot visually before committing: loaded canvas, visible selection handles, readable controls, responsive layout, no transient tooltips / toasts and no personal data. This documentation capture is not a complete browser-compatibility or image-format acceptance test. The 2400-pixel photo-long-edge export currently produces a 2560 × 2032 file including borders; preserve the sizing explanation in both READMEs until the implementation changes.
