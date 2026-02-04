// src/main.js
import { registerPlugin } from "@pexip/plugin-api";

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

const CSV_PATH = "./data/dial_targets.csv"; // relative to plugin index.html

const FALLBACK_TARGETS = [
    { label: "Boardroom (SIP)", destination: "sip:boardroom@example.com", protocol: "auto", role: "GUEST" },
    { label: "Security desk (SIP)", destination: "sip:security@company.com", protocol: "auto", role: "GUEST" },
    { label: "Legacy codec", destination: "h323:10.0.0.50", protocol: "auto", role: "GUEST" },
    { label: "Recorder", destination: "rtmp://recorder.example.com/live/room1", protocol: "auto", role: "GUEST" },
];

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

function stripBom(s) {
    return s.replace(/^\uFEFF/, "");
}

function destinationHasScheme(dest) {
    const d = (dest || "").trim().toLowerCase();
    return /^[a-z][a-z0-9+.-]*:/.test(d);
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

    // De-dupe by destination
    const seen = new Set();
    return targets.filter((t) => {
        if (seen.has(t.destination)) return false;
        seen.add(t.destination);
        return true;
    });
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
        console.warn(`dialout-picker: CSV load failed (${CSV_PATH}). Using fallback list.`, e);
        return FALLBACK_TARGETS;
    }
}

(async () => {
    const plugin = await registerPlugin({
        id: "dialout-picker",
        version: 1,
    });

    const btn = await plugin.ui.addButton({
        position: "toolbar",
        icon: "IconPhone",
        tooltip: "Dial out",
        roles: ["chair"],
    });

    btn.onClick.add(async () => {
        const targets = await loadTargets();
        const byDest = new Map(targets.map((t) => [t.destination, t]));

        try {
            const result = await plugin.ui.showForm({
                title: "Dial out from this meeting",
                description: "Select a target to dial into this VMR.",
                form: {
                    submitBtnTitle: "Dial",
                    elements: {
                        target: {
                            name: "Target",
                            type: "select",
                            required: true,
                            options: targets.map((t) => ({ id: t.destination, label: t.label })),
                        },
                        join_as: {
                            name: "Join as",
                            type: "select",
                            required: true,
                            selected: "guest",
                            options: [
                                { id: "guest", label: "Guest" },
                                { id: "host", label: "Host" },
                            ],
                        },
                        protocol: {
                            name: "Protocol (only used if destination has no scheme)",
                            type: "select",
                            required: true,
                            selected: "auto",
                            options: [
                                { id: "auto", label: "Auto" },
                                { id: "sip", label: "SIP" },
                                { id: "h323", label: "H.323" },
                                { id: "mssip", label: "MS SIP" },
                                { id: "rtmp", label: "RTMP" },
                            ],
                        },
                        display_name: {
                            name: "Display name (recommended)",
                            type: "text",
                            placeholder: "Defaults to the selected label",
                            required: false,
                        },
                    },
                },
            });

            const destination = result.target;
            const selected = byDest.get(destination);

            const role = selected?.role || (result.join_as === "host" ? "HOST" : "GUEST");
            const destHasScheme = destinationHasScheme(destination);

            const protocol =
                (selected?.protocol && selected.protocol !== "auto")
                    ? selected.protocol
                    : (result.protocol || "auto");

            const displayName =
                (result.display_name || "").trim() ||
                selected?.label ||
                "Dial-out participant";

            // Build dial args.
            // ✅ Do NOT send source_display_name; let Infinity defaults apply.
            const dialArgs = {
                destination,
                role,
                protocol: "auto", // safe default for your env
                remote_display_name: displayName,
                text: displayName,
            };

            // Only override protocol for "bare" destinations if user chose something explicit
            if (!destHasScheme && protocol && protocol !== "auto") {
                dialArgs.protocol = protocol;
            }

            console.log("DIALOUT-PICKER dialArgs:", dialArgs);

            await plugin.conference.dialOut(dialArgs);

            await plugin.ui.showToast({
                message: `Dialing ${displayName}…`,
                type: "success",
            });
        } catch (err) {
            await plugin.ui.showToast({
                message: `Dial-out failed: ${err?.message || err}`,
                type: "danger",
            });
        }
    });
})();
