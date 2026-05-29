# HUNTGRID

Flat-file GitHub Pages version.

Upload every file in this ZIP directly into the root of the GitHub repo.

## Important

This version uses root-level files:

- index.html
- app.css
- app.js
- service-worker.js
- manifest.json

Do not put app.css in /css or app.js in /js unless you also change index.html.

## After Uploading

1. Commit all files.
2. Wait for GitHub Pages to deploy.
3. Open the site.
4. Clear old browser cache if needed:
   - F12
   - Application
   - Service Workers
   - Unregister
   - Storage
   - Clear site data
   - Ctrl + F5

## Apps Script

The frontend already contains your Apps Script URL.

Set your token in Settings inside the app.

In Code.gs change:

const AUTH_TOKEN = 'CHANGE_THIS_TOKEN';

to your real token.
