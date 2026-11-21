# Pahlawan Gombunan · Tambunan Phone AR

All 12 story pages open automatically in one camera session. Pages 2, 5, 10 and 11 present their supplied scenes without a tap activity.

| Printed target | What to do |
|---|---|
| 01 — The Land of Tambunan | Tap a deer for forest sounds, the boar or piglet for a wild boar growl, or the river for flowing water. |
| 03 — Life on the Plain | Tap **Plant pumpkin** first, then follow the prompts for four more crops. |
| 04 — Sharing Makes Them Strong | Tap the standing man in blue or **Wave** below the picture to see him turn toward you and wave. |
| 06 — Gombunan’s Last Stand | Watch the leaves sway gently. No tap is needed. |
| 07 — Remembering Gombunan | Reveal Gombunan’s message or tap the elders to raise his name. |
| 08 — A New People Arrive | Tap Tamasin or **Wave** to see him face you and wave. |
| 09 — Friends, Not Enemies | Tap the campfire to put it out or relight it. Tap Tamasin to hear him speak. |
| 12 — The Birth of Tambunan | Tap the gate for the name reveal and celebration.

## Try it on your phone

1. Publish **only the complete `web/` folder** to static hosting with HTTPS. No build command or backend is needed. Open the resulting HTTPS URL in Safari or Chrome, not an in-app browser. This package is not published automatically.
2. Lay a supported page flat, with its printed title/text edge nearest you. The original printable files are included in `web/assets/`; the app’s **Printable targets** section also links to them. You can show the target on a second screen instead of printing it.
3. Tap **Start camera** and allow access. Aim the rear camera down at the page with all four corners visible. Hold steady while the scene loads. Turn to any of the 12 story pages without restarting the camera or selecting a page in the app.
4. Tap objects directly or use the controls below the picture. Angle your phone to see the raised scene from the side; the base stays aligned to the printed page. Drag to turn/tilt, pinch to zoom, and tap Reset view to return to the original orientation. Keep the page visible. Point at another supported page to switch, or tap **Stop camera** to finish.

A computer’s `localhost`, a LAN `http://` address, and opening `index.html` as a file won’t enable the phone camera. Camera frames are processed on-device. Voice lines also have captions.

## Try it on Windows

Extract the entire ZIP and run **Start Storybook.bat** (Python 3 required), or run `python serve.py` and open <http://localhost:8799/>. **3D preview** lets you explore without scanning. To preview a specific page, use a deep link such as `?page=7&preview=1`.

## Sources and verification

`full-book.mind` uses the supplied PDF pages at full-page aspect in printed order, 1–12. The five targets from the earlier release were retained unchanged. The original PDFs are kept byte-for-byte. The GLBs are browser exports of the corresponding Blender scenes; the originals are untouched. A page-sized portrait footing lines up with the scan target, and the diorama rises vertically over it. The figures and scenery keep their original proportions at full height.

Run `node --test tests/*.test.mjs` from the project folder for layout and page mapping checks.
