// src/widget.js
import { registerWidget } from "@pexip/plugin-api";

/**
 * CSV format - place at:
 *   webapp3/plugins/dialout-picker/data/dial_targets.csv
 *
 * label,destination,protocol,role
 * Boardroom (SIP),sip:ep3@anzsec.pextest.com,,guest
 * Security desk (SIP),sip:security@company.com,,guest
 * Legacy codec,h323:10.0.0.50,h323,guest
 * Recorder,rtmp://recorder.example.com/live/room1,rtmp,guest
 */
const CSV_PATH = "./data/dial_targets.csv"; // relative to widget.html

const FALLBACK_TARGETS = [
    { label: "Boardroom (SIP)", destination: "sip:ep3@anzsec.pextest.com", protocol: "auto", role: "GUEST" },
    { label: "Security desk (SIP)", destination: "sip:security@company.com", protocol: "auto", role: "GUEST" },
    { label: "Legacy codec", destination: "h323:10.0.0.50", protocol: "auto", role: "GUEST" },
    { label: "Recorder", destination: "rtmp://recorder.example.com/live/room1", protocol: "auto", role: "GUEST" },
];

function stripBom(s) {
    return s.replace(/^\uFEFF/, "");
}

function destinationHasScheme(dest) {
    const d = (dest || "").trim().toLowerCase();
    return /^[a-z][a-z0-9+.-]*:/.test(d);
}

function normalizeProtocol(v) {
    const p = (v || "").trim().toLowerCase();
    if (!p || p === "auto") return "auto";
    if (p === "sip" || p === "h323" || p === "mssip" || p === "rtmp") return p;
    return "auto";
}

function normalizeRole(v) {
    const r = (v || "").trim().toLowerCase();
    return r === "host" ? "HOST" : "GUEST";
}

// Minimal CSV parser supporting commas + quotes
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += ch;
            }
            continue;
        }

        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ",") {
            row.push(field);
            field = "";
            continue;
        }
        if (ch === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }
        if (ch === "\r") continue;

        field += ch;
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function toTargetsFromCsv(csvText) {
    const rows = parseCsv(stripBom(csvText)).filter((r) => r.some((c) => (c || "").trim() !== ""));
    if (!rows.length) return [];

    const header = rows[0].map((h) => (h || "").trim().toLowerCase());
    const col = (name) => header.indexOf(name);

    const iLabel = col("label");
    const iDest = col("destination");
    const iProto = col("protocol");
    const iRole = col("role");

    const hasHeader =
        header.includes("label") ||
        header.includes("destination") ||
        header.includes("protocol") ||
        header.includes("role");

    const dataRows = hasHeader ? rows.slice(1) : rows;

    const targets = dataRows
        .map((cols) => cols.map((c) => (c ?? "").trim()))
        .map((cols) => {
            const label = (iLabel >= 0 ? cols[iLabel] : cols[0]) || "";
            const destination = (iDest >= 0 ? cols[iDest] : cols[1]) || "";
            const protocol = normalizeProtocol(iProto >= 0 ? cols[iProto] : cols[2]);
            const role = normalizeRole(iRole >= 0 ? cols[iRole] : cols[3]);
            return { label, destination, protocol, role };
        })
        .filter((t) => t.label && t.destination);

    // de-dupe by destination
    const seen = new Set();
    return targets.filter((t) => (seen.has(t.destination) ? false : (seen.add(t.destination), true)));
}

async function loadTargets() {
    try {
        const res = await fetch(CSV_PATH, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const targets = toTargetsFromCsv(text);
        if (!targets.length) throw new Error("CSV parsed but no entries found");
        return targets;
    } catch (e) {
        console.warn(`dialout-picker widget: CSV load failed (${CSV_PATH}). Using fallback list.`, e);
        return FALLBACK_TARGETS;
    }
}

function matches(target, q) {
    const needle = (q || "").trim().toLowerCase();
    if (!needle) return true;
    const hay = `${target.label} ${target.destination}`.toLowerCase();
    return hay.includes(needle);
}

function optionLabel(t) {
    return `${t.label} — ${t.destination}`;
}

(async () => {
    const widget = await registerWidget({ parentPluginId: "dialout-picker" });

    const qEl = document.getElementById("q");
    const targetEl = document.getElementById("target");
    const joinAsEl = document.getElementById("joinAs");
    const protocolEl = document.getElementById("protocol");
    const displayEl = document.getElementById("displayName");
    const dialBtn = document.getElementById("dialBtn");
    const hintEl = document.getElementById("countHint");
    const statusEl = document.getElementById("status");

    // Defensive: if any element is missing, show a clear error in the UI
    const missing = [];
    if (!qEl) missing.push("#q");
    if (!targetEl) missing.push("#target");
    if (!joinAsEl) missing.push("#joinAs");
    if (!protocolEl) missing.push("#protocol");
    if (!displayEl) missing.push("#displayName");
    if (!dialBtn) missing.push("#dialBtn");
    if (!hintEl) missing.push("#countHint");
    if (!statusEl) missing.push("#status");

    if (missing.length) {
        console.error("dialout-picker widget: missing elements:", missing);
        if (statusEl) statusEl.textContent = `Widget UI error: missing ${missing.join(", ")}`;
        return;
    }

    dialBtn.disabled = true;
    hintEl.textContent = "Loading targets…";

    const allTargets = await loadTargets();
    const byDest = new Map(allTargets.map((t) => [t.destination, t]));
    let filtered = [...allTargets];

    function renderOptions() {
        const current = targetEl.value;
        targetEl.innerHTML = "";

        filtered.forEach((t) => {
            const opt = document.createElement("option");
            opt.value = t.destination;
            opt.textContent = optionLabel(t);
            targetEl.appendChild(opt);
        });

        if (filtered.length === 0) {
            const opt = document.createElement("option");
            opt.value = "";
            opt.textContent = "No matches";
            targetEl.appendChild(opt);
            targetEl.value = "";
            dialBtn.disabled = true;
            hintEl.textContent = "0 matches";
            return;
        }

        targetEl.value = filtered.some((t) => t.destination === current) ? current : filtered[0].destination;
        dialBtn.disabled = false;
        hintEl.textContent = `${filtered.length} match${filtered.length === 1 ? "" : "es"}`;
    }

    function applyFilter() {
        const q = qEl.value;
        filtered = allTargets.filter((t) => matches(t, q));
        renderOptions();
    }

    // Filter on each character
    qEl.addEventListener("input", applyFilter);

    // Re-render when selection changes (optional)
    targetEl.addEventListener("change", () => {
        const selected = byDest.get(targetEl.value);
        if (selected && !(displayEl.value || "").trim()) {
            // If user hasn't typed a name, set a helpful default
            displayEl.placeholder = selected.label || "Defaults to the selected label";
        }
    });

    // Initial render
    renderOptions();

    dialBtn.addEventListener("click", async () => {
        statusEl.textContent = "";

        const destination = targetEl.value;
        const selected = byDest.get(destination);

        if (!destination || !selected) {
            statusEl.textContent = "Please select a valid target.";
            return;
        }

        const role = selected.role || joinAsEl.value || "GUEST";
        const chosenProto = normalizeProtocol(selected.protocol || protocolEl.value || "auto");
        const destHasScheme = destinationHasScheme(destination);

        const displayName =
            (displayEl.value || "").trim() ||
            selected.label ||
            "Dial-out participant";

        const dialArgs = {
            destination,
            role,
            protocol: "auto",
            remote_display_name: displayName,
            text: displayName,
            // Do NOT send source_display_name (per your preference)
        };

        if (!destHasScheme && chosenProto !== "auto") {
            dialArgs.protocol = chosenProto;
        }

        try {
            dialBtn.disabled = true;
            statusEl.textContent = `Dialing ${displayName}…`;
            await widget.conference.dialOut(dialArgs);
            statusEl.textContent = `Dial started: ${displayName}`;
        } catch (err) {
            statusEl.textContent = `Dial-out failed: ${err?.message || err}`;
        } finally {
            dialBtn.disabled = filtered.length === 0;
        }
    });
})();
