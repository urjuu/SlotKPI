// Slot KPI Monitor — app.js (fixed typing + CSV upload/import)

const tbody = document.getElementById("tbody");
const summaryBody = document.getElementById("summaryBody");

const btnAddRow = document.getElementById("btnAddRow");
const btnLoadSample = document.getElementById("btnLoadSample");
const btnExport = document.getElementById("btnExport");
const btnClear = document.getElementById("btnClear");

const gameFilter = document.getElementById("gameFilter");
const noteSearch = document.getElementById("noteSearch");

let rows = [];

/* ----------------- helpers: parsing & formatting ----------------- */
function parseNumber(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const cleaned = s.replace(/,/g, "").replace(/\s/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
}

function parseAvailability(v) {
    // accepts: "99.8", "99.8%", "0.998"
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const cleaned = s.replace("%", "").trim();
    const n = parseNumber(cleaned);
    if (n === null) return null;
    return n > 1 ? n / 100 : n;
}

function fmtMoney(n) {
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtPct(x) {
    if (!Number.isFinite(x)) return "";
    return (x * 100).toFixed(2) + "%";
}

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* ----------------- KPI calculations ----------------- */
function calcRTP(turnover, wins) {
    if (!Number.isFinite(turnover) || !Number.isFinite(wins) || turnover <= 0) return null;
    return wins / turnover;
}

function calcGGR(turnover, wins) {
    if (!Number.isFinite(turnover) || !Number.isFinite(wins)) return null;
    return turnover - wins;
}

/* ----------------- Status rules (edit as you like) ----------------- */
function rtpStatus(rtp) {
    if (!Number.isFinite(rtp)) return "";
    if (rtp > 0.98) return "ALERT";
    if (rtp >= 0.97) return "WATCH";
    if (rtp < 0.90) return "LOW RTP";
    return "NORMAL";
}

function ggrStatus(ggr, turnover) {
    if (!Number.isFinite(ggr)) return "";
    // simple rule: weak if margin <1% or ggr very small
    if (Number.isFinite(turnover) && turnover > 0) {
        const margin = ggr / turnover;
        if (margin < 0.01) return "Weak";
    }
    if (ggr < 1500) return "Weak";
    return "OK";
}

function escalation(rtpStat, ggrStat) {
    if (!rtpStat || !ggrStat) return "";
    return (rtpStat === "ALERT" && ggrStat === "Weak") ? "YES" : "NO";
}

function buildNote(r) {
    if (!r.rtpStat) return "";
    if (Number.isFinite(r.avail) && r.avail < 0.99) {
        return "Availability below target; recommend technical check and monitor impact on turnover/GGR.";
    }
    if (r.escal === "YES") {
        return "RTP significantly above expected range, suppressing GGR. Monitor closely and escalate for review.";
    }
    if (r.rtpStat === "ALERT") {
        return "RTP elevated above expected range; monitor closely and escalate if trend persists.";
    }
    if (r.rtpStat === "WATCH") {
        return "RTP trending high; monitor next 24–48h.";
    }
    if (r.rtpStat === "LOW RTP") {
        return "RTP below average but within variance; positive impact on GGR.";
    }
    return "RTP within expected range; no action required.";
}

/* ----------------- data model ----------------- */
function recalcRow(r) {
    r.turnover = parseNumber(r.turnoverRaw);
    r.wins = parseNumber(r.winsRaw);
    r.avail = parseAvailability(r.availRaw);

    r.rtp = calcRTP(r.turnover, r.wins);
    r.ggr = calcGGR(r.turnover, r.wins);

    r.rtpStat = rtpStatus(r.rtp);
    r.ggrStat = ggrStatus(r.ggr, r.turnover);
    r.escal = escalation(r.rtpStat, r.ggrStat);
    r.note = buildNote(r);
}

function newId() {
    return String(Date.now()) + Math.random().toString(16).slice(2);
}

function addRow(data = {}) {
    const r = {
        id: newId(),
        date: data.date ?? "2026-01-01",
        game: data.game ?? "",
        turnoverRaw: data.turnoverRaw ?? "",
        winsRaw: data.winsRaw ?? "",
        availRaw: data.availRaw ?? "99.8%",
        turnover: null, wins: null, avail: null,
        rtp: null, ggr: null,
        rtpStat: "", ggrStat: "", escal: "", note: ""
    };
    recalcRow(r);
    rows.push(r);
}

/* ----------------- filtering ----------------- */
function rebuildGameFilter() {
    const games = Array.from(new Set(rows.map(r => r.game).filter(Boolean))).sort();
    const current = gameFilter.value;
    gameFilter.innerHTML =
        `<option value="__all__">All</option>` +
        games.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    if (games.includes(current)) gameFilter.value = current;
}

function getVisibleRows() {
    const gf = gameFilter.value;
    const q = noteSearch.value.trim().toLowerCase();
    return rows.filter(r => {
        if (gf !== "__all__" && r.game !== gf) return false;
        if (q && !(r.note || "").toLowerCase().includes(q)) return false;
        return true;
    });
}

/* ----------------- rendering ----------------- */
function pill(text, kind) {
    if (!text) return "";
    return `<span class="pill ${kind}">${escapeHtml(text)}</span>`;
}

function render() {
    rebuildGameFilter();
    const visible = getVisibleRows();

    tbody.innerHTML = visible.map(r => {
        const rtpCellClass =
            Number.isFinite(r.rtp) && r.rtp > 0.98 ? "warn-cell" :
                Number.isFinite(r.rtp) && r.rtp < 0.90 ? "bad-cell" : "";

        const availCellClass =
            Number.isFinite(r.avail) && r.avail < 0.99 ? "bad-cell" : "";

        const ggrCellClass = r.ggrStat === "Weak" ? "warn-cell" : "";

        const rtpKind =
            r.rtpStat === "ALERT" ? "warn" :
                r.rtpStat === "WATCH" ? "warn" :
                    r.rtpStat === "LOW RTP" ? "bad" :
                        r.rtpStat === "NORMAL" ? "ok" : "";

        const ggrKind = r.ggrStat === "Weak" ? "warn" : "ok";
        const escKind = r.escal === "YES" ? "bad" : "ok";

        return `
      <tr data-id="${r.id}">
        <td><input class="inp" data-k="date" value="${escapeHtml(r.date)}" placeholder="YYYY-MM-DD"></td>
        <td><input class="inp" data-k="game" value="${escapeHtml(r.game)}" placeholder="Slot A"></td>

        <td class="num">
          <input inputmode="numeric" class="inp numinp" data-k="turnover"
            value="${escapeHtml(r.turnoverRaw)}" placeholder="120000">
        </td>

        <td class="num">
          <input inputmode="numeric" class="inp numinp" data-k="wins"
            value="${escapeHtml(r.winsRaw)}" placeholder="114000">
        </td>

        <td class="num ${availCellClass}">
          <input class="inp numinp" data-k="avail" value="${escapeHtml(r.availRaw)}" placeholder="99.8%">
        </td>

        <td class="num ${rtpCellClass}" data-out="rtp">${fmtPct(r.rtp)}</td>
        <td class="num ${ggrCellClass}" data-out="ggr">${fmtMoney(r.ggr)}</td>

        <td data-out="rtpStat">${pill(r.rtpStat, rtpKind)}</td>
        <td data-out="ggrStat">${pill(r.ggrStat, ggrKind)}</td>
        <td data-out="esc">${pill(r.escal, escKind)}</td>

        <td data-out="note">${escapeHtml(r.note)}</td>
        <td><button class="delBtn" data-action="del">DEL</button></td>
      </tr>
    `;
    }).join("");

    renderSummary(visible);
}

function renderSummary(visibleRows) {
    const byGame = new Map();

    for (const r of visibleRows) {
        const g = r.game || "(blank)";
        if (!byGame.has(g)) {
            byGame.set(g, {
                game: g, days: 0,
                turnover: 0, wins: 0, ggr: 0,
                rtpSum: 0, rtpCount: 0,
                minAvail: null, anyEsc: false
            });
        }
        const s = byGame.get(g);
        s.days++;
        if (Number.isFinite(r.turnover)) s.turnover += r.turnover;
        if (Number.isFinite(r.wins)) s.wins += r.wins;
        if (Number.isFinite(r.ggr)) s.ggr += r.ggr;
        if (Number.isFinite(r.rtp)) { s.rtpSum += r.rtp; s.rtpCount++; }
        if (Number.isFinite(r.avail)) s.minAvail = (s.minAvail === null) ? r.avail : Math.min(s.minAvail, r.avail);
        if (r.escal === "YES") s.anyEsc = true;
    }

    const items = Array.from(byGame.values()).sort((a, b) => a.game.localeCompare(b.game));

    summaryBody.innerHTML = items.map(s => {
        const avgRtp = s.rtpCount ? s.rtpSum / s.rtpCount : null;
        return `
      <tr>
        <td>${escapeHtml(s.game)}</td>
        <td class="num">${s.days}</td>
        <td class="num">${fmtMoney(s.turnover)}</td>
        <td class="num">${fmtMoney(s.wins)}</td>
        <td class="num">${fmtMoney(s.ggr)}</td>
        <td class="num">${fmtPct(avgRtp)}</td>
        <td class="num">${fmtPct(s.minAvail)}</td>
        <td>${s.anyEsc ? pill("YES", "bad") : pill("NO", "ok")}</td>
      </tr>
    `;
    }).join("");
}

/* --------- KEY FIX: do NOT re-render while typing (prevents 1-digit bug) --------- */
function updateRowOutputs(tr, row) {
    const rtpCell = tr.querySelector('[data-out="rtp"]');
    const ggrCell = tr.querySelector('[data-out="ggr"]');
    const rtpStatCell = tr.querySelector('[data-out="rtpStat"]');
    const ggrStatCell = tr.querySelector('[data-out="ggrStat"]');
    const escCell = tr.querySelector('[data-out="esc"]');
    const noteCell = tr.querySelector('[data-out="note"]');

    if (rtpCell) rtpCell.textContent = fmtPct(row.rtp);
    if (ggrCell) ggrCell.textContent = fmtMoney(row.ggr);
    if (rtpStatCell) rtpStatCell.textContent = row.rtpStat;
    if (ggrStatCell) ggrStatCell.textContent = row.ggrStat;
    if (escCell) escCell.textContent = row.escal;
    if (noteCell) noteCell.textContent = row.note || "";
}

/* ----------------- CSV Export ----------------- */
function exportCSV() {
    const header = ["Date", "Game Name", "Turnover", "Wins", "Availability"];
    const visible = getVisibleRows();
    const lines = [header.join(",")];

    for (const r of visible) {
        const line = [
            r.date,
            r.game,
            r.turnoverRaw ?? "",
            r.winsRaw ?? "",
            r.availRaw ?? ""
        ].map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
        lines.push(line);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "slot_kpi_upload.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/* ----------------- CSV Import (Upload) ----------------- */
// Robust CSV parser (handles quotes)
function parseCSV(text) {
    const rows = [];
    let cur = "", inQuotes = false;
    let row = [];

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"' && inQuotes && next === '"') { // escaped quote
            cur += '"';
            i++;
            continue;
        }
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch === "," && !inQuotes) {
            row.push(cur);
            cur = "";
            continue;
        }
        if ((ch === "\n" || ch === "\r") && !inQuotes) {
            if (ch === "\r" && next === "\n") i++;
            row.push(cur);
            cur = "";
            // ignore empty last line
            if (row.some(c => String(c).trim() !== "")) rows.push(row);
            row = [];
            continue;
        }
        cur += ch;
    }

    row.push(cur);
    if (row.some(c => String(c).trim() !== "")) rows.push(row);
    return rows;
}

function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase();
}

function importCSVText(csvText) {
    const table = parseCSV(csvText);
    if (!table.length) return;

    const header = table[0].map(normalizeHeader);

    const idxDate = header.findIndex(h => h === "date");
    const idxGame = header.findIndex(h => h === "game name" || h === "game" || h === "gamename");
    const idxTurn = header.findIndex(h => h === "turnover");
    const idxWins = header.findIndex(h => h === "wins");
    const idxAvail = header.findIndex(h => h === "availability" || h === "avail");

    // If no header row, assume fixed order
    const hasHeader = (idxDate !== -1 || idxGame !== -1 || idxTurn !== -1 || idxWins !== -1 || idxAvail !== -1);

    const startRow = hasHeader ? 1 : 0;

    const imported = [];

    for (let i = startRow; i < table.length; i++) {
        const r = table[i];

        const date = hasHeader ? (r[idxDate] ?? "") : (r[0] ?? "");
        const game = hasHeader ? (r[idxGame] ?? "") : (r[1] ?? "");
        const turnoverRaw = hasHeader ? (r[idxTurn] ?? "") : (r[2] ?? "");
        const winsRaw = hasHeader ? (r[idxWins] ?? "") : (r[3] ?? "");
        const availRaw = hasHeader ? (r[idxAvail] ?? "") : (r[4] ?? "");

        imported.push({
            date: String(date).trim() || "2026-01-01",
            game: String(game).trim(),
            turnoverRaw: String(turnoverRaw).trim(),
            winsRaw: String(winsRaw).trim(),
            availRaw: String(availRaw).trim() || "99.8%"
        });
    }

    // replace current rows with imported
    rows = [];
    for (const x of imported) {
        const rr = {
            id: newId(),
            date: x.date,
            game: x.game,
            turnoverRaw: x.turnoverRaw,
            winsRaw: x.winsRaw,
            availRaw: x.availRaw,
            turnover: null, wins: null, avail: null,
            rtp: null, ggr: null,
            rtpStat: "", ggrStat: "", escal: "", note: ""
        };
        recalcRow(rr);
        rows.push(rr);
    }

    render();
}

function createUploadUI() {
    // hidden file input
    let fileInput = document.getElementById("csvFile");
    if (!fileInput) {
        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = ".csv,text/csv";
        fileInput.id = "csvFile";
        fileInput.style.display = "none";
        document.body.appendChild(fileInput);
    }

    // create button near Export if not already present
    let uploadBtn = document.getElementById("btnUpload");
    if (!uploadBtn && btnExport && btnExport.parentElement) {
        uploadBtn = document.createElement("button");
        uploadBtn.id = "btnUpload";
        uploadBtn.className = "btn btn-secondary";
        uploadBtn.textContent = "Upload CSV";
        btnExport.parentElement.insertBefore(uploadBtn, btnExport); // place before Export
    }

    if (uploadBtn) {
        uploadBtn.addEventListener("click", () => fileInput.click());
    }

    fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        importCSVText(text);
        fileInput.value = ""; // reset so you can upload same file again
    });
}

/* ----------------- events ----------------- */
btnAddRow?.addEventListener("click", () => {
    addRow({ date: "2026-01-01", game: "Slot X", availRaw: "99.8%" });
    render();
});

btnLoadSample?.addEventListener("click", () => {
    rows = [];
    addRow({ date: "2026-01-01", game: "Slot A", turnoverRaw: "120000", winsRaw: "114000", availRaw: "99.8%" });
    addRow({ date: "2026-01-01", game: "Slot B", turnoverRaw: "80000", winsRaw: "70000", availRaw: "99.5%" });
    addRow({ date: "2026-01-01", game: "Slot C", turnoverRaw: "150000", winsRaw: "149000", availRaw: "99.9%" });
    render();
});

btnExport?.addEventListener("click", exportCSV);

btnClear?.addEventListener("click", () => {
    if (confirm("Clear all rows?")) {
        rows = [];
        render();
    }
});

gameFilter?.addEventListener("change", render);
noteSearch?.addEventListener("input", render);

// typing handler (NO render inside — keeps focus stable)
tbody.addEventListener("input", (e) => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.classList.contains("inp")) return;

    const tr = input.closest("tr");
    const id = tr?.dataset?.id;
    const k = input.dataset.k;
    const row = rows.find(r => r.id === id);
    if (!row || !k || !tr) return;

    // enforce numeric-only on certain fields
    if (k === "turnover") {
        input.value = input.value.replace(/[^\d]/g, "");
        row.turnoverRaw = input.value;
    } else if (k === "wins") {
        // IMPORTANT: NO LIMIT here — unlimited digits
        input.value = input.value.replace(/[^\d]/g, "");
        row.winsRaw = input.value;
    } else if (k === "avail") {
        input.value = input.value.replace(/[^\d.%]/g, "");
        row.availRaw = input.value;
    } else if (k === "date") {
        row.date = input.value;
    } else if (k === "game") {
        row.game = input.value;
    }

    recalcRow(row);
    updateRowOutputs(tr, row);
});

// full render only when leaving input (updates pills + summary nicely)
tbody.addEventListener("blur", (e) => {
    const el = e.target;
    if (el && el.classList && el.classList.contains("inp")) render();
}, true);

tbody.addEventListener("click", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.dataset.action !== "del") return;
    const tr = el.closest("tr");
    const id = tr?.dataset?.id;
    if (!id) return;
    rows = rows.filter(r => r.id !== id);
    render();
});

/* ----------------- init ----------------- */
createUploadUI();

if (rows.length === 0) {
    addRow({ date: "2026-01-01", game: "Slot A", availRaw: "99.8%" });
    addRow({ date: "2026-01-01", game: "Slot B", availRaw: "99.5%" });
    addRow({ date: "2026-01-01", game: "Slot C", availRaw: "99.9%" });
}
render();
