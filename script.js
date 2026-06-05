let players = [];
let sortKey = "adjustedDkp";
let sortDirection = "desc";

const headerMap = {
  characterId: ["Character ID", "CharacterID", "ID"],
  username: ["Username", "Name", "Player"],
  power: ["Power"],
  highestPower: ["Highest Power"],
  dkp: ["DKP"],
  dkpKills: ["DKP Kills"],
  dkpDeads: ["DKP Deads"],
  adjustedDkp: ["Adjusted DKP"],
  reduction: ["Reduction"],
  dkpGoal: ["DKP Goal"],
  minDeadDkp: ["Min Dead DKP"],
  goalPercent: ["Normal DKP Goal", "Goal %", "% Goal"],
  deadDkpAchieved: ["Dead DKP Achieved"],
  killsDeadsPercent: ["% Kills/Deads"],
  pDkp: ["P/DKP"],
  powerLossPercent: ["% Power Loss"],
  t5Deaths: ["T5 Deaths"],
  t4Deaths: ["T4 Deaths"],
  totalKp: ["Total KP"],
  t5Kills: ["T5 Kills"],
  t4Kills: ["T4 Kills"]
};

function getCsvUrl(sheetName) {
  const encodedSheet = encodeURIComponent(sheetName);
  return `https://docs.google.com/spreadsheets/d/${CONFIG.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodedSheet}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (cell !== "" || row.length > 0) {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      }
      if (char === "\r" && next === "\n") i++;
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function findHeaderIndex(headers, aliases) {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const index = normalized.indexOf(normalizeHeader(alias));
    if (index !== -1) return index;
  }
  return -1;
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;

  let text = String(value).trim();
  if (!text || text === "-" || text.toLowerCase() === "n/a") return 0;

  const hadPercent = text.includes("%");

  text = text
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/'/g, "");

  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  // German format: 1.234.567,89
  if (commaCount === 1 && dotCount >= 1) {
    text = text.replace(/\./g, "").replace(",", ".");
  }
  // German decimal: 85,5
  else if (commaCount === 1 && dotCount === 0) {
    text = text.replace(",", ".");
  }
  // German thousands only: 1.234.567 or 4.400.000.000
  else if (commaCount === 0 && dotCount >= 1) {
    const parts = text.split(".");
    const allThousands = parts.length > 1 && parts.slice(1).every(part => part.length === 3);
    if (allThousands) {
      text = parts.join("");
    }
  }
  // English thousands: 1,234,567
  else if (commaCount > 1 && dotCount === 0) {
    text = text.replace(/,/g, "");
  }

  const cleaned = text.replace(/[^\d.-]/g, "");
  const number = Number(cleaned);

  if (!Number.isFinite(number)) return 0;
  if (hadPercent) return number / 100;

  return number;
}

function normalizePercent(value) {
  const number = parseNumber(value);
  if (number > 3) return number / 100;
  return number;
}

function getValue(row, headers, key) {
  const index = findHeaderIndex(headers, headerMap[key] || [key]);
  return index === -1 ? "" : row[index];
}

function rowsToPlayers(rows) {
  if (rows.length < 2) return [];

  const headers = rows[0];

  return rows.slice(1)
    .filter(row => row.some(cell => String(cell || "").trim() !== ""))
    .map(row => {
      const dkpGoal = parseNumber(getValue(row, headers, "dkpGoal"));
      const adjustedDkp = parseNumber(getValue(row, headers, "adjustedDkp"));
      const goalPercentRaw = getValue(row, headers, "goalPercent");

      return {
        characterId: String(getValue(row, headers, "characterId")).trim(),
        username: String(getValue(row, headers, "username")).trim(),
        power: parseNumber(getValue(row, headers, "power")),
        highestPower: parseNumber(getValue(row, headers, "highestPower")),
        dkp: parseNumber(getValue(row, headers, "dkp")),
        adjustedDkp,
        reduction: normalizePercent(getValue(row, headers, "reduction")),
        dkpGoal,
        goalPercent: goalPercentRaw !== "" ? normalizePercent(goalPercentRaw) : (dkpGoal > 0 ? adjustedDkp / dkpGoal : 0),
        deadDkpAchieved: normalizePercent(getValue(row, headers, "deadDkpAchieved")),
        totalKp: parseNumber(getValue(row, headers, "totalKp")),
        t5Deaths: parseNumber(getValue(row, headers, "t5Deaths")),
        t4Deaths: parseNumber(getValue(row, headers, "t4Deaths")),
        raw: row
      };
    })
    .filter(player => player.characterId || player.username);
}

async function loadDataset() {
  const datasetSelect = document.getElementById("datasetSelect");
  const selected = CONFIG.datasets[datasetSelect.selectedIndex] || CONFIG.datasets[0];
  const status = document.getElementById("loadStatus");

  try {
    status.textContent = `Loading ${selected.label}...`;

    const response = await fetch(getCsvUrl(selected.sheetName));
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);

    const csvText = await response.text();

    if (csvText.startsWith("<!DOCTYPE html") || csvText.includes("<title>")) {
      throw new Error("Google Sheet did not return CSV. Check sharing/publishing settings.");
    }

    players = rowsToPlayers(parseCsv(csvText));
    status.textContent = `Loaded ${players.length} players from ${selected.label}`;

    renderDashboard();
    renderTable();
  } catch (error) {
    console.error(error);
    status.textContent = "Could not load Google Sheet";
    document.getElementById("dashboard").insertAdjacentHTML("afterbegin", `
      <div class="error-box">
        <strong>Could not load data.</strong><br>
        Make sure the Google Sheet is shared publicly or published to the web.<br>
        Error: ${error.message}
      </div>
    `);
  }
}

const formatNumber = value => {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (number >= 1000000000000) return (number / 1000000000000).toFixed(2) + "T";
  if (number >= 1000000000) return (number / 1000000000).toFixed(2) + "B";
  if (number >= 1000000) return (number / 1000000).toFixed(2) + "M";
  if (number >= 1000) return (number / 1000).toFixed(1) + "K";
  return Math.round(number).toString();
};

const formatPercent = value =>
  `${(Number(value || 0) * 100).toFixed(1)}%`;

function metricClass(value) {
  if (value < 0.7) return "low";
  if (value < 1) return "warn";
  return "good";
}

function getActivePlayers() {
  const threshold = CONFIG.activePlayerThreshold ?? 25000000;
  return players.filter(p => Number(p.power || 0) >= threshold);
}

function setupTabs() {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.tab).classList.add("active");
    });
  });
}

function setupDatasetSelector() {
  const select = document.getElementById("datasetSelect");
  select.innerHTML = CONFIG.datasets.map(dataset => `<option>${dataset.label}</option>`).join("");
  select.addEventListener("change", loadDataset);
  document.getElementById("reloadButton").addEventListener("click", loadDataset);
}

function renderDashboard() {
  const activePlayers = getActivePlayers();
  const totalPlayers = activePlayers.length;
  const totalDkp = players.reduce((sum, p) => sum + Number(p.adjustedDkp || 0), 0);
  const avgGoal = activePlayers.length
    ? activePlayers.reduce((sum, p) => sum + Number(p.goalPercent || 0), 0) / activePlayers.length
    : 0;
  const belowGoal = activePlayers.filter(p => p.goalPercent < 0.7).length;

  document.getElementById("totalPlayers").textContent = totalPlayers;
  document.getElementById("totalDkp").textContent = formatNumber(totalDkp);
  document.getElementById("avgGoal").textContent = formatPercent(avgGoal);
  document.getElementById("belowGoal").textContent = belowGoal;

  renderTopList("topAdjustedDkp", "adjustedDkp", formatNumber);
  renderTopList("topGoalPercent", "goalPercent", formatPercent, true);
  renderTopDeadGoalList();
  renderLowContributors();
}

function renderTopList(elementId, key, formatter, percentStyle = false) {
  const container = document.getElementById(elementId);
  const top = [...players].sort((a, b) => b[key] - a[key]).slice(0, 10);

  container.innerHTML = top.map((player, index) => `
    <div class="ranking-row">
      <span>#${index + 1}</span>
      <span>${player.username || player.characterId}</span>
      <strong class="${percentStyle ? metricClass(player[key]) : ""}">${formatter(player[key])}</strong>
    </div>
  `).join("");
}

function renderTopDeadGoalList() {
  const container = document.getElementById("topDeadDkp");
  const top = [...players]
    .sort((a, b) => b.deadDkpAchieved - a.deadDkpAchieved)
    .slice(0, 10);

  container.innerHTML = top.map((player, index) => `
    <div class="ranking-row">
      <span>#${index + 1}</span>
      <span>
        ${player.username || player.characterId}
        <small style="display:block;color:var(--muted);margin-top:2px;">
          T5: ${formatNumber(player.t5Deaths)} | T4: ${formatNumber(player.t4Deaths)}
        </small>
      </span>
      <strong class="${metricClass(player.deadDkpAchieved)}">${formatPercent(player.deadDkpAchieved)}</strong>
    </div>
  `).join("");
}

function renderLowContributors() {
  const container = document.getElementById("lowContributors");
  const low = getActivePlayers()
    .filter(player => player.goalPercent < 0.7)
    .sort((a, b) => b.dkpGoal - a.dkpGoal)
    .slice(0, 10);

  if (!low.length) {
    container.innerHTML = "<p>No active players below 70% Total DKP Goal.</p>";
    return;
  }

  container.innerHTML = low.map((player, index) => `
    <div class="ranking-row">
      <span>#${index + 1}</span>
      <span>
        ${player.username || player.characterId}
        <small style="display:block;color:var(--muted);margin-top:2px;">
          DKP Goal: ${formatNumber(player.dkpGoal)}
        </small>
      </span>
      <strong class="low">${formatPercent(player.goalPercent)}</strong>
    </div>
  `).join("");
}

function renderTable() {
  const query = document.getElementById("searchInput").value.toLowerCase().trim();

  let filtered = players.filter(player =>
    String(player.characterId).toLowerCase().includes(query) ||
    String(player.username).toLowerCase().includes(query)
  );

  filtered.sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];

    if (typeof av === "string") {
      return sortDirection === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }

    return sortDirection === "asc"
      ? Number(av || 0) - Number(bv || 0)
      : Number(bv || 0) - Number(av || 0);
  });

  const tbody = document.querySelector("#statsTable tbody");

  tbody.innerHTML = filtered.map(player => `
    <tr>
      <td>${player.characterId}</td>
      <td>${player.username}</td>
      <td>${formatNumber(player.power)}</td>
      <td>${formatNumber(player.highestPower)}</td>
      <td>${formatNumber(player.dkp)}</td>
      <td>${formatNumber(player.adjustedDkp)}</td>
      <td>${formatNumber(player.dkpGoal)}</td>
      <td class="${metricClass(player.goalPercent)}">${formatPercent(player.goalPercent)}</td>
      <td class="${metricClass(player.deadDkpAchieved)}">${formatPercent(player.deadDkpAchieved)}</td>
      <td>${formatNumber(player.totalKp)}</td>
      <td>${formatNumber(player.t5Deaths)}</td>
      <td>${formatNumber(player.t4Deaths)}</td>
      <td>${formatPercent(player.reduction)}</td>
    </tr>
  `).join("");
}

function setupTable() {
  document.getElementById("searchInput").addEventListener("input", renderTable);

  document.querySelectorAll("#statsTable th").forEach(header => {
    header.addEventListener("click", () => {
      const key = header.dataset.sort;
      setSort(key);
    });
  });

  document.querySelectorAll(".details-sort").forEach(button => {
    button.addEventListener("click", () => {
      setSort(button.dataset.sort);
      document.querySelectorAll(".details-sort").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function setSort(key) {
  if (sortKey === key) {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDirection = "desc";
  }

  renderTable();
}

setupTabs();
setupDatasetSelector();
setupTable();
loadDataset();
