// src/widget.js
import { registerWidget } from "@pexip/plugin-api";

/**
 * CSV format - place at:
 *   webapp3/plugins/dialout-picker/data/dial_targets.csv
 *
 * label,destination,protocol,role
 * Boardroom (SIP),sip:boardroom@company.com,,guest
 * Security desk (SIP),sip:security@company.com,,guest
 * Legacy codec,h323:10.0.0.50,h323,guest
 * Recorder,rtmp://recorder.example.com/live/room1,rtmp,guest
 */
const CSV_PATH = "./data/dial_targets.csv";

const FALLBACK_TARGETS = [
    { label: "Boardroom (SIP)", destination: "sip:boardroom@company.com", protocol: "auto", role: "GUEST" },
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

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label = "operation") {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function mkEl(tag, attrs = {}, text = "") {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === "className") el.className = v;
        else if (k === "textContent") el.textContent = v;
        else el.setAttribute(k, v);
    }
    if (text) el.textContent = text;
    return el;
}

function badgeKind(ok, skipped) {
    if (skipped) return { cls: "badge skip", txt: "SKIP" };
    if (ok) return { cls: "badge ok", txt: "OK" };
    return { cls: "badge fail", txt: "FAIL" };
}

(async () => {
    const widget = await registerWidget({ parentPluginId: "dialout-picker" });

    const qEl = document.getElementById("q");
    const listEl = document.getElementById("targetList");
    const joinAsEl = document.getElementById("joinAs");
    const protocolEl = document.getElementById("protocol");
    const displayEl = document.getElementById("displayName");
    const dialBtn = document.getElementById("dialBtn");
    const countHint = document.getElementById("countHint");
    const selectedHint = document.getElementById("selectedHint");
    const statusEl = document.getElementById("status");
    const selectAllBtn = document.getElementById("selectAllBtn");
    const clearBtn = document.getElementById("clearBtn");
    const resultsLog = document.getElementById("resultsLog");
    const summaryHint = document.getElementById("summaryHint");

    // defensive: ensure required elements exist
    const missing = [];
    for (const [name, el] of Object.entries({
        qEl, listEl, joinAsEl, protocolEl, displayEl, dialBtn,
        countHint, selectedHint, statusEl, selectAllBtn, clearBtn,
        resultsLog, summaryHint,
    })) {
        if (!el) missing.push(name);
    }
    if (missing.length) {
        console.error("dialout-picker widget missing elements:", missing);
        if (statusEl) statusEl.textContent = `Widget UI error: missing ${missing.join(", ")}`;
        return;
    }

    dialBtn.disabled = true;
    countHint.textContent = "Loading targets…";
    summaryHint.textContent = "Ready.";

    const allTargets = await loadTargets();
    const byDest = new Map(allTargets.map((t) => [t.destination, t]));

    let filtered = [...allTargets];
    const selected = new Set(); // destination strings

    function clearResults() {
        resultsLog.innerHTML = "";
    }

    function appendResult({ ok, skipped = false, label, message }) {
        const line = mkEl("div", { className: "resLine" });

        const b = badgeKind(ok, skipped);
        line.appendChild(mkEl("div", { className: b.cls }, b.txt));

        const text = mkEl("div", { className: "resText" });
        text.textContent = label;

        const sub = mkEl("div", { className: "resSub" });
        sub.textContent = message;

        const stack = mkEl("div");
        stack.appendChild(text);
        stack.appendChild(sub);

        line.appendChild(stack);
        resultsLog.appendChild(line);

        // scroll to bottom
        resultsLog.scrollTop = resultsLog.scrollHeight;
    }

    function updateSelectedUI() {
        selectedHint.textContent = `${selected.size} selected`;
        dialBtn.textContent = selected.size ? `Dial (${selected.size})` : "Dial";
        dialBtn.disabled = selected.size === 0;
    }

    function renderList() {
        listEl.innerHTML = "";

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="hint">No matches</div>`;
            countHint.textContent = "0 matches";
            updateSelectedUI();
            return;
        }

        for (const t of filtered) {
            const row = document.createElement("label");
            row.className = "targetItem";

            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = selected.has(t.destination);
            cb.addEventListener("change", () => {
                if (cb.checked) selected.add(t.destination);
                else selected.delete(t.destination);
                updateSelectedUI();
            });

            const info = document.createElement("div");
            info.className = "tMain";

            const l = document.createElement("div");
            l.className = "tLabel";
            l.textContent = t.label;

            const d = document.createElement("div");
            d.className = "tDest";
            d.textContent = t.destination;

            info.appendChild(l);
            info.appendChild(d);

            row.appendChild(cb);
            row.appendChild(info);
            listEl.appendChild(row);
        }

        countHint.textContent = `${filtered.length} match${filtered.length === 1 ? "" : "es"}`;
        updateSelectedUI();
    }

    function applyFilter() {
        const q = qEl.value;
        filtered = allTargets.filter((t) => matches(t, q));
        renderList();
    }

    qEl.addEventListener("input", applyFilter);

    selectAllBtn.addEventListener("click", () => {
        for (const t of filtered) selected.add(t.destination);
        renderList();
    });

    clearBtn.addEventListener("click", () => {
        selected.clear();
        renderList();
    });

    // Initial render
    renderList();

    dialBtn.addEventListener("click", async () => {
        statusEl.textContent = "";
        clearResults();

        const destinations = [...selected];
        if (!destinations.length) return;

        // lock UI
        dialBtn.disabled = true;
        selectAllBtn.disabled = true;
        clearBtn.disabled = true;
        qEl.disabled = true;
        joinAsEl.disabled = true;
        protocolEl.disabled = true;
        displayEl.disabled = true;

        summaryHint.textContent = "Dialing…";

        const roleFallback = joinAsEl.value || "GUEST";
        const chosenProto = normalizeProtocol(protocolEl.value || "auto");
        const overrideName = (displayEl.value || "").trim();

        const DIAL_TIMEOUT_MS = 12000; // prevents "stuck dialing"
        const GAP_MS = 350;

        let ok = 0;
        let fail = 0;
        let skip = 0;

        try {
            for (let i = 0; i < destinations.length; i++) {
                const destination = destinations[i];
                const t = byDest.get(destination);
                const label = t?.label || destination;

                if (!t) {
                    skip++;
                    appendResult({ ok: false, skipped: true, label, message: "Missing target definition" });
                    statusEl.textContent = `Skipped ${i + 1}/${destinations.length}: ${label}`;
                    continue;
                }

                const role = t.role || roleFallback;
                const destHasScheme = destinationHasScheme(destination);

                const displayName = overrideName || t.label || "Dial-out participant";

                const dialArgs = {
                    destination,
                    role,
                    protocol: "auto",
                    remote_display_name: displayName,
                    text: displayName,
                };

                const perTargetProto = normalizeProtocol(t.protocol);
                const protoToUse = perTargetProto !== "auto" ? perTargetProto : chosenProto;

                // Only force protocol for "bare" destinations
                if (!destHasScheme && protoToUse !== "auto") {
                    dialArgs.protocol = protoToUse;
                }

                statusEl.textContent = `Dialing ${i + 1}/${destinations.length}: ${label}`;

                try {
                    await withTimeout(
                        widget.conference.dialOut(dialArgs),
                        DIAL_TIMEOUT_MS,
                        `Dial-out to ${label}`
                    );

                    ok++;
                    appendResult({ ok: true, label, message: "Dial requested" });
                } catch (e) {
                    fail++;
                    appendResult({ ok: false, label, message: e?.message || String(e) });
                }

                summaryHint.textContent = `Success: ${ok}  Failed: ${fail}  Skipped: ${skip}`;
                await sleep(GAP_MS);
            }

            statusEl.textContent = "Done.";
            summaryHint.textContent = `Done. Success: ${ok}  Failed: ${fail}  Skipped: ${skip}`;
        } finally {
            // always restore UI
            selectAllBtn.disabled = false;
            clearBtn.disabled = false;
            qEl.disabled = false;
            joinAsEl.disabled = false;
            protocolEl.disabled = false;
            displayEl.disabled = false;

            updateSelectedUI();
        }
    });
})();
