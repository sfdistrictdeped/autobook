# AutoBook Beta 0.3.0

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
Beta 0.3.0


## Home screen and app information

The landing screen includes **Print Your New Booklet**, **View Changelog**, and **About AutoBook**, plus a compact bug-report/suggestion button and email link to `sfdistrict.deped@gmail.com`. The current version is displayed beneath the feedback link, matching AutoTarp. The About panel lists the app concept/developers, testers, coding attribution, version, and district credit. The footer displays the San Fernando District logo and the 2026 innovation credit.

The changelog is ordered newest first. Beta 0.3.0 is the current major update, introducing the redesigned booklet setup workspace; Beta 0.2.0 records the AutoTarp-inspired home screen and compact information panels; Beta 0.1.0 remains the initial release. The home screen uses the same approximate width and button proportions as AutoTarp, with transparent hero artwork and no top-right beta badge. The About panel intentionally has no report-email button because feedback is available on the home screen.


## Beta 0.3.0 UI update
- Reworked the booklet setup workspace into numbered, collapsible steps.
- Added a top toolbar with Undo/Redo, help, dark mode, and a Proceed to Print menu.
- Added print workflow guidance and keyboard shortcuts.
- Kept PDF processing local in the browser and preserved booklet imposition, front/back preview, and print-ready PDF export.


### Beta 0.3.0 final UI adjustments
- Moved the Proceed to Print action below the booklet preview, replacing the redundant standalone download button.
- Added an About-style print options panel for downloading the print-ready PDF or opening it for printing in the browser.
- Replaced the upload drop zone after file selection with a first-page thumbnail, file details, Remove Uploaded PDF, and Proceed to Booklet Settings actions.
- Added Reset Settings beside Generate Booklet PDF and Clear PDF. Reset Settings restores default booklet dimensions, orientation, binding, scaling, gutter, and margin without removing the uploaded document.
- Removed the redundant header Home button and deferred dark mode.
