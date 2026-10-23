# AutoBook 1.0.2 — UI Update

- Replaces the Proceed to Print inline dropdown with an About-style floating dialog containing Download print-ready PDF and Open PDF for printing.
- Adds a Discover other SFD OneApps! button opposite the home-screen theme toggle.
- Adds responsive app cards for SFD OnePortal, SFD OneDirectory, AutoTarp, and the current AutoBook app.
- Preserves separate AutoBook service-worker cache naming to avoid cross-app cache collisions.

All PDF processing remains local to the browser.
# AutoBook 1.0.0

AutoBook is a client-side PDF booklet imposition PWA for the District AutoApps Family.

## Features in this beta
- PDF upload and basic validation
- Selectable sheet and finished-page size presets, plus custom dimensions
- Saddle-stitch booklet page imposition
- Automatic padding to a multiple of four
- Front/back sheet preview
- Download print-ready PDF
- PWA manifest and service-worker app-shell caching
- Provided AutoBook hero artwork and AB app icon/favicon

## Run locally
For best results, serve this folder over HTTP rather than opening `index.html` directly. For example:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to GitHub Pages
1. Create a repository (for example `AutoBook`).
2. Upload the contents of this folder to the repository root.
3. In repository Settings → Pages, choose the deployment branch and root folder.
4. Open the published HTTPS URL and test installation.
5. If using a project Pages URL, verify the service worker and manifest load from the repository subpath.

## Important beta limitations
- PDF.js and pdf-lib are loaded from cdnjs in this beta, so first-time use and PDF processing require an internet connection. The app shell is cached, but the CDN libraries are not yet bundled locally; full offline PDF processing is a follow-up task.
- Browser-based preview is intended for checking imposition, not color-managed proofing.
- Duplex flip-edge behavior varies by printer; test a sample before printing a large run.
- Very large or complex PDFs may use significant browser memory.
- Verify output with real documents and a physical printer before relying on it for official materials.

## Privacy
The selected PDF is processed in the browser. The application code does not upload the selected document to a backend. External CDN requests are made to load the PDF libraries, and Google Fonts is requested for typography.

## Version
1.0.0 — Major Update


## Home screen and app information

The landing screen includes **Print Your New Booklet**, **View Changelog**, and **About AutoBook**, plus a compact bug-report/suggestion button and email link to `sfdistrict.deped@gmail.com`. The current version is displayed beneath the feedback link, matching AutoTarp. The About panel lists the app concept/developers, testers, coding attribution, version, and district credit. The footer displays the San Fernando District logo and the 2026 innovation credit.

The changelog is ordered newest first. Beta 0.4.0 is the current major update, introducing the redesigned booklet setup workspace; Beta 0.2.0 records the AutoTarp-inspired home screen and compact information panels; Beta 0.1.0 remains the initial release. The home screen uses the same approximate width and button proportions as AutoTarp, with transparent hero artwork and no top-right beta badge. The About panel intentionally has no report-email button because feedback is available on the home screen.


## Beta 0.4.0 UI update
- Reworked the booklet setup workspace into numbered, collapsible steps.
- Added a top toolbar with Undo/Redo, help, dark mode, and a Proceed to Print menu.
- Added print workflow guidance and keyboard shortcuts.
- Kept PDF processing local in the browser and preserved booklet imposition, front/back preview, and print-ready PDF export.


### Beta 0.4.0 final UI adjustments
- Moved the Proceed to Print action below the booklet preview, replacing the redundant standalone download button.
- Added a floating menu for downloading the print-ready PDF or opening it for printing in the browser.
- Removed the redundant header Home button and deferred dark mode.


## Beta 0.4.0 major update

- Restored the uploaded-PDF thumbnail, file details, remove action, and guided continuation buttons.
- Added four gated workflow steps, full-app dark mode, grayscale output, page numbering, border designs, and Reset Settings.
- Preserved the `autobook-` cache namespace so activation only removes obsolete AutoBook caches.


## AutoBook 1.0.0 major update
- Adds undo/redo history for setup settings and keyboard shortcuts.
- Adds source page range selection and custom blank-page insertion before imposition.
- Adds locally remembered setup preferences with a reset-to-default option.
- Adds a printable test sheet with a 100 mm calibration line and duplex-check guidance.
- Supports both left-to-right and right-to-left binding.
- Retains local PDF processing, branded number steppers, page numbering, border designs, color/grayscale output, and the AutoBook-only service-worker cache namespace.
