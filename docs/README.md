# Dial-out Picker – Multi‑Target Dial Branch

This branch extends the **Dial-out Picker Web App 3 plugin for Pexip Infinity** to support
dialing **multiple targets in a single action**, with robust error handling and clear per‑target feedback.

---

## ✨ Features

### 🔢 Multi‑target dial-out
- Select **one or many** targets from the list
- Dial-outs are processed **sequentially**
- Failure of one target **does not block the rest**

### 🔍 Searchable target list
- Filter targets as you type (label or destination)
- “Select all (filtered)” for fast bulk dialing
- Clear selection with one click

### 📄 CSV-driven configuration
Targets are loaded from:

```
webapp3/branding/plugins/dialout-picker/data/dial_targets.csv
```

Example:

```csv
label,destination,protocol,role
Boardroom (SIP),sip:boardroom@example.com,,guest
Security desk (SIP),sip:security@company.com,,guest
Legacy codec,h323:10.0.0.50,h323,guest
Recorder,rtmp://recorder.example.com/live/room1,rtmp,guest
```

If the CSV cannot be loaded, a safe fallback list is used.

---

## 🧠 Smart dial behaviour

- **Protocols**
  - Automatically inferred from destination URI
  - Only forced if destination has no scheme
- **Roles**
  - Per‑target role supported (guest / host)
- **Display names**
  - `remote_display_name` always set
  - Optional global override via the UI

---

## 🛡️ Robust error handling

### Per‑target isolation
Each dial-out attempt is wrapped so that:
- Errors are caught per target
- Timeouts prevent the UI from getting stuck
- The widget **always completes**

### Timeout protection
Each dial-out has a configurable timeout (default: **12 seconds**).
If exceeded, the attempt is marked as failed and the next target proceeds.

---

## 📊 Results & status feedback

The widget shows:
- Live status while dialing
- A scrolling results panel with:
  - ✅ Success
  - ❌ Failure
  - ⏭ Skipped
- A final summary count:
  ```
  Done. Success: X  Failed: Y  Skipped: Z
  ```

---

## 🧩 UI / UX details

- Compact iframe that fits the form (no horizontal scrolling)
- Native Web App 3 header (title, close button, drag handle)
- Sticky **Dial** button
- Keyboard-friendly, responsive layout

---

## 📦 Build & deploy

```bash
npm install
npm run build
```

Copy the contents of `dist/` into:

```
webapp3/branding/plugins/dialout-picker/
```

Upload your branding package via the **Infinity Management Node**.

---

## 📁 Key files

```
index.html          # Plugin entry
widget.html         # Multi-dial widget UI
src/main.js         # Toolbar button & widget launcher
src/widget.js       # Multi-dial logic, search, CSV, results
data/dial_targets.csv
```

---

## 🚀 Notes

- Designed for **hosts/chairs**
- Tested against Pexip Infinity Web App 3
- No server-side components required

---

## 📸 Screenshots

_(Optional – add to `docs/screenshots/` and reference here)_

---

## 🧑‍💻 Author

Internal Web App 3 plugin for Pexip Infinity  
Multi-dial feature branch
