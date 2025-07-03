# Browser Compatibility Guide

This extension supports both Chrome and Firefox browsers, but due to differences in how each browser implements Manifest V3, you'll need to use the appropriate manifest file for each browser.

## For Chrome

Use the default `manifest.json` file, which is already configured for Chrome compatibility.

## For Firefox

To use the extension in Firefox, you need to use the Firefox-specific manifest file:

1. Rename `manifest.firefox.json` to `manifest.json` (or replace the existing `manifest.json` with `manifest.firefox.json`)
2. Load the extension in Firefox

### Why Two Manifest Files?

Chrome and Firefox have different implementations of Manifest V3, particularly in how they handle background scripts:

- Chrome uses `service_worker` for background scripts in Manifest V3
- Firefox requires `scripts` for background scripts in Manifest V3

This difference necessitates having separate manifest files for each browser to ensure compatibility.

## Error Details

If you encounter the following error in Firefox:

```
There was an error during the temporary add-on installation.
Error details: background.service_worker is currently disabled. Add background.scripts.
```

This means you're trying to use the Chrome-specific manifest file in Firefox. Follow the instructions above to use the Firefox-specific manifest file instead.
