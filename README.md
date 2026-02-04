# Pexip Web App 3 Dial-Out Picker Plugin

A simple **Pexip Infinity Web App 3 plugin** that adds a **host-only toolbar button** allowing a chair/host to **dial out to a participant** from a pre-defined list.

This project currently supports **Option A**: a **CSV-backed dial-out list** bundled with the plugin.

---

## Features

- Host-only toolbar button (chair role)
- Pop-up form to select a dial-out target
- Dial-out targets loaded from a bundled CSV file
- Fallback list if CSV cannot be loaded
- Supports SIP / H.323 / RTMP / MS SIP (depending on Infinity configuration)
- Uses `remote_display_name` + `text` for dial-out labeling

---

## CSV Dial-Out List

The plugin reads a CSV file from:

```
./data/dial_targets.csv
```

### CSV format

```csv
label,destination,protocol,role
Boardroom (SIP),sip:boardroom@example.com,,guest
Security desk (SIP),sip:security@company.com,,guest
Legacy codec,h323:10.0.0.50,h323,guest
Recorder,rtmp://recorder.example.com/live/room1,rtmp,guest
```

### Columns

| Column        | Required | Description |
|--------------|----------|-------------|
| `label`       | Yes | Display name shown in the plugin dropdown |
| `destination` | Yes | Dial-out destination (e.g. `sip:user@domain`, `h323:ip`, `rtmp://...`) |
| `protocol`    | ❌ No  | `sip`, `h323`, `mssip`, `rtmp`, or blank |
| `role`        | ❌ No  | `guest` or `host` |

> **Note:** Some Infinity environments reject `"protocol": "sip"` even if supported in the Web App API.
> If you see `unsupported protocol 'sip'`, leave protocol blank and use a `sip:` destination.

---

## Development

### Prerequisites
- Node.js 18+ recommended
- npm (or yarn/pnpm)

### Install dependencies
```bash
npm install
```

### Build plugin
```bash
npm run build
```

This produces a bundled output in `dist/` (depending on your tooling).

---

## Installing into Pexip Infinity Branding

1. Build the plugin (`npm run build`)
2. Copy your plugin output into your Web App 3 branding folder structure, for example:

```
webapp3/
  branding/
    plugins/
      dialout-picker/
        index.html
        assets/...
        data/
          dial_targets.csv
```

3. Ensure your `manifest.json` references the plugin:

```json
{
  "plugins": [
    {
      "id": "dialout-picker",
      "src": "./plugins/dialout-picker/index.html"
    }
  ]
}
```

4. Zip the `webapp3/` folder and upload it to the **Pexip Management Node**
5. Apply the branding to your VMR / Web App as required

---

## Verifying the Plugin Loaded

Open DevTools Console in Web App 3 and confirm:

- The button appears in the toolbar (chair/host only)
- You can see log output from the plugin (if enabled)
- You can see the dial request in the Network tab:

Look for:

```
POST /api/client/v2/conferences/<alias>/dial
```

---

## Notes / Troubleshooting

### Button does not appear
- Ensure you are joined as a **chair/host**
- Ensure `manifest.json` plugin `id` matches `registerPlugin({ id })`

### Dial fails with HTTP 400
Check the response body in Network tab. Common issues include:
- Invalid destination format
- Unsupported protocol in your deployment
- Missing permissions / dial-out disabled

### Display name not visible in roster
Depending on Infinity/Web App behavior:
- `remote_display_name` may not always replace the displayed roster name
- remote endpoint identity or alias may still be shown

---

## Security Notes

This plugin uses a **local CSV file** bundled into the branding package.
No network calls are made outside the Pexip Infinity Client API.

If you expand this project to load targets dynamically from an external API:
- validate input
- restrict dial-out targets
- avoid exposing sensitive endpoints in client-side JS

---

## License

