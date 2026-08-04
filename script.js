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
  deadGoalT5Equiv: ["Dead Goal T5 Equiv", "Dead Goal (T5)", "T5 Equiv"],
  totalKp: ["Total Kill Points", "Total KP"],
  t5Kills: ["T5 Kills"],
  t4Kills: ["T4 Kills"],
  deadDkpFromFiller: ["Dead DKP from Filler"],
  zeroed: ["Zeroed"]
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
        dkpDeads: parseNumber(getValue(row, headers, "dkpDeads")),
        adjustedDkp,
        reduction: normalizePercent(getValue(row, headers, "reduction")),
        dkpGoal,
        goalPercent: goalPercentRaw !== "" ? parseNumber(goalPercentRaw) : (dkpGoal > 0 ? adjustedDkp / dkpGoal : 0),
        deadDkpAchieved: parseNumber(getValue(row, headers, "deadDkpAchieved")),
        totalKp: parseNumber(getValue(row, headers, "totalKp")),
        t5Deaths: parseNumber(getValue(row, headers, "t5Deaths")),
        t4Deaths: parseNumber(getValue(row, headers, "t4Deaths")),
        deadGoalT5Equiv: parseNumber(getValue(row, headers, "deadGoalT5Equiv")),
        deadDkpFromFiller: parseNumber(getValue(row, headers, "deadDkpFromFiller")),
        zeroed: String(getValue(row, headers, "zeroed")).trim(),
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
    status.textContent = t("loading");

    const response = await fetch(getCsvUrl(selected.sheetName));
    if (!response.ok) throw new Error(`Google Sheets returned ${response.status}`);

    const csvText = await response.text();

    if (csvText.startsWith("<!DOCTYPE html") || csvText.includes("<title>")) {
      throw new Error("Google Sheet did not return CSV. Check sharing/publishing settings.");
    }

    players = rowsToPlayers(parseCsv(csvText));
    status.textContent = t("loaded", { count: players.length, dataset: selected.label });

    renderDashboard();
    renderTable();
  } catch (error) {
    console.error(error);
    status.textContent = t("couldNotLoad");
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

const formatPercent = value => `${(Number(value || 0) * 100).toFixed(1)}%`;

function metricClass(value) {
  if (value < 0.7) return "low";
  if (value < 1) return "warn";
  return "good";
}

function reductionClass(value) {
  const number = Number(value || 0);
  if (number <= -0.5) return "reduction-high";
  if (number < 0) return "reduction-low";
  return "reduction-none";
}

function getActivePlayers() {
  const threshold = CONFIG.activePlayerThreshold ?? 25000000;
  return players.filter(p => Number(p.power || 0) >= threshold);
}


const TRANSLATIONS = {
  "en": {
    "heroKicker": "Kingdom 3688",
    "heroSubtitle": "KvK contribution analytics, DKP tracking, and reward transparency",
    "navDashboard": "Dashboard",
    "navDetails": "Detailed Stats",
    "navInfo": "DKP Calculation Info",
    "dataset": "Dataset",
    "reloadData": "Reload Data",
    "loading": "Loading...",
    "loaded": "Loaded {count} players from {dataset}",
    "couldNotLoad": "Could not load Google Sheet",
    "searchPlaceholder": "Search by username or Character ID...",
    "quickSort": "Quick sort:",
    "totalPlayersOver25": "Total Players over 25M",
    "totalAdjustedDkp": "Total Adjusted DKP",
    "averageTotalGoal": "Average Total DKP Goal %",
    "below70Over25": "Below 70% Total Goal over 25M",
    "topAdjustedDkp": "Top Adjusted DKP",
    "topTotalGoal": "Top Total DKP Goal %",
    "topDeadGoal": "Top Dead DKP Goal %",
    "below70TotalGoal": "Below 70% Total DKP Goal",
    "rank": "Rank",
    "characterId": "Character ID",
    "username": "Username",
    "power": "Power",
    "highestPower": "Highest Power",
    "dkp": "DKP",
    "adjustedDkp": "Adjusted DKP",
    "dkpGoal": "DKP Goal",
    "totalDkpGoalPercent": "Total DKP Goal %",
    "deadDkpGoalPercent": "Dead DKP Goal %",
    "totalKp": "Total KP",
    "t5Deaths": "T5 Deaths",
    "t4Deaths": "T4 Deaths",
    "deadGoalT5Equiv": "Dead Goal (T5)",
    "reduction": "Reduction",
    "noActiveBelow70": "No active players below 70% Total DKP Goal.",
    "dkpGoalLabel": "DKP Goal",
    "infoTitle": "How DKP is calculated",
    "infoIntro": "This page explains how DKP is calculated in KD3688 and why the system is more detailed than a simple kill-point ranking. The goal is a fair and transparent evaluation of wartime contribution, reward distribution, and Autarch distribution.",
    "info1Title": "1) Basic DKP Calculation",
    "info1Text": "DKP is based on kills and deads during wartime.",
    "action": "Action",
    "dkpValue": "DKP Value",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "onePoint": "1 point",
    "twoPoints": "2 points",
    "deadDkpFromFiller": "Dead DKP from Filler",
    "sevenHalfPoints": "7.5 points",
    "fifteenPoints": "15 points",
    "info1Note": "Total DKP is the sum of kill DKP and dead DKP.",
    "info2Title": "2) Power-Based DKP Requirement",
    "info2Text": "DKP requirements scale with starting power. The system is progressive, meaning each power bracket is calculated separately. Higher-power players still benefit from the lower brackets, similar to a tax system.",
    "powerBracket": "Power Bracket",
    "multiplier": "Multiplier",
    "first45": "First 45M power",
    "from45to70": "45M to 70M power",
    "above70": "Above 70M power",
    "info2Note": "These values may be adjusted in future KvKs if needed.",
    "info3Title": "3) Minimum Dead Requirement",
    "info3Text": "At least <strong>20% of your DKP must come from deads</strong>. If this requirement is not met, your DKP can be reduced accordingly.",
    "info3Box": "Dead DKP matters because it shows actual sacrifice, not only kill farming.",
    "info3Example": "Example: if your deads are too low, your total DKP is capped based on your dead contribution. This helps prevent KP chasing and keeps the KvK burden fair.",
    "info4Title": "4) Rally and Garrison Leads",
    "info4Text": "Rally and garrison leads often have fewer open-field opportunities because they need to focus key marches, gear, and commander setups on kingdom objectives.",
    "info4Bullet1": "Rally leads can receive a DKP bonus.",
    "info4Bullet2": "Garrison leads can receive a higher DKP bonus.",
    "info4End": "This recognizes responsibility while keeping their evaluation fair.",
    "info5Title": "5) External Activity",
    "info5Text": "If a player is outside the kingdom during non-war periods, leeches Golden Chests elsewhere, or is less active in KD3688, their DKP requirement can be increased.",
    "info5End": "Being part of the kingdom means contributing to matchmaking and seed position. That comes with responsibility.",
    "info6Title": "6) Main Principle",
    "principle": "Equal rewards require equal contribution.",
    "info6Text": "DKP reflects meaningful participation:",
    "killsMatter": "Kills matter.",
    "deadsMatter": "Deads matter.",
    "activityMatter": "Activity matters.",
    "info6End": "For a fair and enjoyable environment for everyone.",
    "dataDisclaimer": "Data Disclaimer",
    "footerText": "All data, calculations, analysis and presentation on this website are provided and maintained by",
    "footerUnofficial": "This is an unofficial community project and is not affiliated with Lilith Games or Rise of Kingdoms.",
    "dkpDeads": "Dead DKP",
    "languageSelection": "Language selection"
  },
  "de": {
    "heroKicker": "Königreich 3688",
    "heroSubtitle": "KvK-Beitragsanalyse, DKP-Tracking und transparente Belohnungsverteilung",
    "navDashboard": "Dashboard",
    "navDetails": "Detaillierte Stats",
    "navInfo": "DKP-Berechnungsinfo",
    "dataset": "Datensatz",
    "reloadData": "Daten neu laden",
    "loading": "Lädt...",
    "deadDkpFromFiller": "Dead-DKP durch Filler",
    "loaded": "{count} Spieler aus {dataset} geladen",
    "couldNotLoad": "Google Sheet konnte nicht geladen werden",
    "searchPlaceholder": "Nach Username oder Character ID suchen...",
    "quickSort": "Schnellsortierung:",
    "totalPlayersOver25": "Spieler über 25M",
    "totalAdjustedDkp": "Gesamtes angepasstes DKP",
    "averageTotalGoal": "Ø Gesamt-DKP-Ziel %",
    "below70Over25": "Unter 70% Gesamtziel über 25M",
    "topAdjustedDkp": "Top angepasstes DKP",
    "topTotalGoal": "Top Gesamt-DKP-Ziel %",
    "topDeadGoal": "Top Dead-DKP-Ziel %",
    "below70TotalGoal": "Unter 70% Gesamt-DKP-Ziel",
    "rank": "Rang",
    "characterId": "Character ID",
    "username": "Username",
    "power": "Power",
    "highestPower": "Highest Power",
    "dkp": "DKP",
    "adjustedDkp": "Angepasstes DKP",
    "dkpGoal": "DKP-Ziel",
    "totalDkpGoalPercent": "Gesamt-DKP-Ziel %",
    "deadDkpGoalPercent": "Dead-DKP-Ziel %",
    "totalKp": "Gesamt-KP",
    "t5Deaths": "T5 Tote",
    "t4Deaths": "T4 Tote",
    "deadGoalT5Equiv": "Dead-Ziel (T5)",
    "reduction": "Reduktion",
    "noActiveBelow70": "Keine aktiven Spieler unter 70% Gesamt-DKP-Ziel.",
    "dkpGoalLabel": "DKP-Ziel",
    "infoTitle": "Wie DKP berechnet wird",
    "infoIntro": "Diese Seite erklärt, wie DKP in KD3688 berechnet wird und warum das System detaillierter ist als ein einfaches Killpoint-Ranking. Ziel ist eine faire und transparente Bewertung von Kriegsbeitrag, Belohnungsverteilung und Autarch-Verteilung.",
    "info1Title": "1) Grundlegende DKP-Berechnung",
    "info1Text": "DKP basiert während Kriegszeiten auf Kills und Deads.",
    "action": "Aktion",
    "dkpValue": "DKP-Wert",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "onePoint": "1 Punkt",
    "twoPoints": "2 Punkte",
    "sevenHalfPoints": "7,5 Punkte",
    "fifteenPoints": "15 Punkte",
    "info1Note": "Gesamt-DKP ist die Summe aus Kill-DKP und Dead-DKP.",
    "info2Title": "2) Power-basiertes DKP-Ziel",
    "info2Text": "DKP-Ziele skalieren mit der Start-Power. Das System ist progressiv, das heißt jede Power-Stufe wird separat berechnet. Spieler mit höherer Power profitieren teilweise weiterhin von den niedrigeren Stufen, ähnlich wie bei einem Steuersystem.",
    "powerBracket": "Power-Stufe",
    "multiplier": "Multiplikator",
    "first45": "Erste 45M Power",
    "from45to70": "45M bis 70M Power",
    "above70": "Über 70M Power",
    "info2Note": "Diese Werte können in zukünftigen KvKs bei Bedarf angepasst werden.",
    "info3Title": "3) Mindestanforderung an Deads",
    "info3Text": "Mindestens <strong>20% deines DKP müssen aus Deads kommen</strong>. Wenn diese Anforderung nicht erfüllt wird, kann dein DKP entsprechend reduziert werden.",
    "info3Box": "Dead-DKP ist wichtig, weil es echte Opferbereitschaft zeigt, nicht nur Kill-Farming.",
    "info3Example": "Beispiel: Wenn deine Deads zu niedrig sind, wird dein Gesamt-DKP basierend auf deinem Dead-Beitrag gedeckelt. Das verhindert KP-Chasing und hält die KvK-Last fair.",
    "info4Title": "4) Rally- und Garrison-Leads",
    "info4Text": "Rally- und Garrison-Leads haben oft weniger Open-Field-Möglichkeiten, weil sie wichtige Marches, Ausrüstung und Commander-Setups auf Königreichsziele fokussieren müssen.",
    "info4Bullet1": "Rally-Leads können einen DKP-Bonus erhalten.",
    "info4Bullet2": "Garrison-Leads können einen höheren DKP-Bonus erhalten.",
    "info4End": "Das erkennt Verantwortung an und hält die Bewertung fair.",
    "info5Title": "5) Externe Aktivität",
    "info5Text": "Wenn ein Spieler während Nicht-Kriegsphasen außerhalb des Königreichs ist, anderswo Golden Chests leecht oder in KD3688 weniger aktiv ist, kann sein DKP-Ziel erhöht werden.",
    "info5End": "Teil des Königreichs zu sein bedeutet, zum Matchmaking und zur Seed-Position beizutragen. Das bringt Verantwortung mit sich.",
    "info6Title": "6) Grundprinzip",
    "principle": "Gleiche Belohnungen erfordern gleiche Beiträge.",
    "info6Text": "DKP steht für sinnvolle Teilnahme:",
    "killsMatter": "Kills zählen.",
    "deadsMatter": "Deads zählen.",
    "dkpDeads": "Todes-DKP",
    "activityMatter": "Aktivität zählt.",
    "info6End": "Für ein faires und angenehmes Umfeld für alle.",
    "dataDisclaimer": "Datenhinweis",
    "footerText": "Alle Daten, Berechnungen, Analysen und Darstellungen auf dieser Website werden bereitgestellt und gepflegt von",
    "footerUnofficial": "Dies ist ein inoffizielles Community-Projekt und steht nicht in Verbindung mit Lilith Games oder Rise of Kingdoms.",
    "languageSelection": "Sprachauswahl"
  },
  "fr": {
    "heroKicker": "Royaume 3688",
    "heroSubtitle": "Analyse des contributions KvK, suivi DKP et transparence des récompenses",
    "navDashboard": "Tableau de bord",
    "navDetails": "Stats détaillées",
    "navInfo": "Informations sur le calcul du DKP",
    "dataset": "Données",
    "dkpDeads": "DKP des pertes",
    "reloadData": "Recharger",
    "loading": "Chargement...",
    "deadDkpFromFiller": "DKP de morts des fillers",
    "loaded": "{count} joueurs chargés depuis {dataset}",
    "couldNotLoad": "Impossible de charger la feuille Google.",
    "searchPlaceholder": "Rechercher par nom ou ID...",
    "quickSort": "Tri rapide:",
    "totalPlayersOver25": "Joueurs au-dessus de 25M",
    "totalAdjustedDkp": "DKP ajusté total",
    "averageTotalGoal": "Moy. objectif DKP total %",
    "below70Over25": "Sous 70% objectif total au-dessus de 25M",
    "topAdjustedDkp": "Top DKP ajusté",
    "topTotalGoal": "Top objectif DKP total %",
    "topDeadGoal": "Top objectif Dead DKP %",
    "below70TotalGoal": "Sous 70% objectif DKP total",
    "rank": "Rang",
    "characterId": "Character ID",
    "username": "Nom",
    "power": "Puissance",
    "highestPower": "Puissance max",
    "dkp": "DKP",
    "adjustedDkp": "DKP ajusté",
    "dkpGoal": "Objectif DKP",
    "totalDkpGoalPercent": "Objectif DKP total %",
    "deadDkpGoalPercent": "Objectif Dead DKP %",
    "totalKp": "KP total",
    "t5Deaths": "Morts T5",
    "t4Deaths": "Morts T4",
    "deadGoalT5Equiv": "Objectif morts (T5)",
    "reduction": "Réduction",
    "noActiveBelow70": "Aucun joueur actif sous 70% de l’objectif DKP total.",
    "dkpGoalLabel": "Objectif DKP",
    "infoTitle": "Comment le DKP est calculé",
    "infoIntro": "Cette page explique comment le DKP est calculé dans KD3688 et pourquoi le système est plus détaillé qu’un simple classement de kill points. Le but est une évaluation juste et transparente de la contribution en guerre et de la distribution des récompenses.",
    "info1Title": "1) Calcul de base du DKP",
    "info1Text": "Le DKP est basé sur les kills et les morts pendant la guerre.",
    "action": "Action",
    "dkpValue": "Valeur DKP",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "onePoint": "1 point",
    "twoPoints": "2 points",
    "sevenHalfPoints": "7,5 points",
    "fifteenPoints": "15 points",
    "info1Note": "Le DKP total est la somme du DKP des kills et du DKP des morts.",
    "info2Title": "2) Objectif DKP basé sur la puissance",
    "info2Text": "Les objectifs DKP augmentent avec la puissance de départ. Le système est progressif: chaque tranche de puissance est calculée séparément, comme un système fiscal.",
    "powerBracket": "Tranche de puissance",
    "multiplier": "Multiplicateur",
    "first45": "Premiers 45M de puissance",
    "from45to70": "45M à 70M de puissance",
    "above70": "Au-dessus de 70M de puissance",
    "info2Note": "Ces valeurs pourront être ajustées lors des prochains KvKs si nécessaire.",
    "info3Title": "3) Exigence minimale de morts",
    "info3Text": "Au moins <strong>20% de votre DKP doit venir des morts</strong>. Si ce minimum n’est pas atteint, votre DKP peut être réduit.",
    "info3Box": "Le Dead DKP est important car il reflète un véritable sacrifice, et pas uniquement du farming de kills.",
    "info3Example": "Exemple : si votre nombre de morts est insuffisant, votre DKP total sera plafonné en fonction de votre contribution en Dead DKP. Cela aide à limiter le KP chasing et à répartir équitablement la charge du KvK.",
    "info4Title": "4) Rally Leads et Garrison Leads",
    "info4Text": "Les rally leads et garrison leads ont souvent moins d’occasions de combattre en open field, car ils doivent concentrer leurs marches clés, leur équipement et leurs configurations de commandants sur les objectifs du royaume.",
    "info4Bullet1": "Les rally leads peuvent recevoir un bonus DKP.",
    "info4Bullet2": "Les garrison leads peuvent recevoir un bonus DKP plus élevé.",
    "info4End": "Cela reconnaît leur responsabilité tout en gardant leur évaluation équitable.",
    "info5Title": "5) Activité externe",
    "info5Text": "Si un joueur se trouve en dehors du royaume pendant les périodes hors guerre, profite des Coffres Dorés ailleurs ou est moins actif dans le KD3688, son exigence DKP peut être augmentée.",
    "info5End": "Faire partie du royaume signifie contribuer au matchmaking et à la position de seed. Cela implique des responsabilités.",
    "info6Title": "6) Principe fondamental",
    "principle": "Des récompenses égales nécessitent une contribution égale.",
    "info6Text": "Le DKP reflète une participation significative :",
    "killsMatter": "Les kills comptent.",
    "deadsMatter": "Les morts comptent.",
    "activityMatter": "L’activité compte.",
    "info6End": "Pour garantir un environnement équitable et agréable pour tous.",
    "dataDisclaimer": "Avertissement sur les données",
    "footerText": "Toutes les données, calculs, analyses et présentations de ce site sont fournis et maintenus par",
    "footerUnofficial": "Ceci est un projet communautaire non officiel et n’est pas affilié à Lilith Games ou Rise of Kingdoms.",
    "languageSelection": "Choix de langue"
  },
  "tr": {
    "heroKicker": "Krallık 3688",
    "heroSubtitle": "KvK katkı analizi, DKP takibi ve ödül şeffaflığı",
    "navDashboard": "Panel",
    "navDetails": "Detaylı İstatistikler",
    "navInfo": "DKP Hesaplama Bilgileri",
    "dataset": "Veri seti",
    "reloadData": "Veriyi Yenile",
    "loading": "Yükleniyor...",
    "loaded": "{dataset} içinden {count} oyuncu yüklendi",
    "couldNotLoad": "Google Sheet yüklenemedi.",
    "searchPlaceholder": "Kullanıcı adı veya Character ID ara...",
    "quickSort": "Hızlı sıralama:",
    "totalPlayersOver25": "25M üstü oyuncular",
    "deadDkpFromFiller": "Filler'dan Gelen Dead DKP",
    "totalAdjustedDkp": "Toplam Düzeltilmiş DKP",
    "averageTotalGoal": "Ort. Toplam DKP Hedef %",
    "below70Over25": "25M üstü %70 altı toplam hedef",
    "topAdjustedDkp": "En yüksek Düzeltilmiş DKP",
    "topTotalGoal": "En yüksek Toplam DKP Hedef %",
    "topDeadGoal": "En yüksek Dead DKP Hedef %",
    "below70TotalGoal": "%70 altı Toplam DKP Hedefi",
    "rank": "Sıra",
    "characterId": "Character ID",
    "username": "Oyuncu adı",
    "power": "Güç",
    "highestPower": "En yüksek güç",
    "dkp": "DKP",
    "adjustedDkp": "Düzeltilmiş DKP",
    "dkpGoal": "DKP hedefi",
    "totalDkpGoalPercent": "Toplam DKP Hedef %",
    "deadDkpGoalPercent": "Dead DKP Hedef %",
    "totalKp": "Toplam KP",
    "t5Deaths": "T5 Ölü",
    "t4Deaths": "T4 Ölü",
    "deadGoalT5Equiv": "Ölü hedefi (T5)",
    "reduction": "Azaltma",
    "noActiveBelow70": "%70 Toplam DKP Hedefi altında aktif oyuncu yok.",
    "dkpGoalLabel": "DKP hedefi",
    "infoTitle": "DKP nasıl hesaplanır",
    "infoIntro": "Bu sayfa KD3688’de DKP’nin nasıl hesaplandığını ve sistemin neden basit bir kill point sıralamasından daha detaylı olduğunu açıklar. Amaç savaş katkısı, ödüller ve Autarch dağıtımı için adil ve şeffaf bir değerlendirmedir.",
    "info1Title": "1) Temel DKP Hesabı",
    "info1Text": "DKP savaş zamanında kill ve ölü birliklere göre hesaplanır.",
    "action": "Aksiyon",
    "dkpValue": "DKP değeri",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "onePoint": "1 puan",
    "twoPoints": "2 puan",
    "sevenHalfPoints": "7.5 puan",
    "fifteenPoints": "15 puan",
    "info1Note": "Toplam DKP, kill DKP ve dead DKP toplamıdır.",
    "info2Title": "2) Güce bağlı DKP hedefi",
    "info2Text": "DKP hedefleri başlangıç gücüne göre artar. Sistem progresiftir: her güç aralığı ayrı hesaplanır, vergi sistemi gibi.",
    "powerBracket": "Güç aralığı",
    "multiplier": "Çarpan",
    "first45": "İlk 45M güç",
    "from45to70": "45M ile 70M güç arası",
    "above70": "70M güç üstü",
    "info2Note": "Bu değerler gerektiğinde gelecekteki KvK'larda ayarlanabilir.",
    "info3Title": "3) Minimum ölü birlik gereksinimi",
    "info3Text": "DKP’nizin en az <strong>%20’si ölü birliklerden gelmelidir</strong>. Bu sağlanmazsa DKP’niz azaltılabilir.",
    "info3Box": "Dead DKP önemlidir çünkü yalnızca kill topladığınızı değil, gerçek fedakârlık yaptığınızı gösterir.",
    "info3Example": "Örnek: Eğer dead sayınız çok düşükse, toplam DKP'niz dead katkınıza göre sınırlandırılır. Bu, KP peşinde koşmayı azaltır ve KvK yükünün adil paylaşılmasına yardımcı olur.",
    "info4Title": "4) Rally ve Garrison Liderleri",
    "info4Text": "Rally ve garrison liderleri genellikle daha az open-field fırsatına sahip olur, çünkü önemli marchlarını, ekipmanlarını ve komutan dizilimlerini krallık hedeflerine odaklamak zorundadırlar.",
    "info4Bullet1": "Rally liderleri DKP bonusu alabilir.",
    "info4Bullet2": "Garrison liderleri daha yüksek bir DKP bonusu alabilir.",
    "info4End": "Bu, sorumluluklarını kabul ederken değerlendirmeyi adil tutar.",
    "info5Title": "5) Krallık Dışı Aktivite",
    "info5Text": "Bir oyuncu savaş dışı dönemlerde krallığın dışında bulunuyorsa, başka yerlerde Altın Sandıkları topluyorsa veya KD3688 içinde daha az aktifse, DKP gereksinimi artırılabilir.",
    "info5End": "Krallığın bir parçası olmak, matchmaking ve seed pozisyonuna katkıda bulunmak anlamına gelir. Bu da beraberinde sorumluluk getirir.",
    "info6Title": "6) Temel İlke",
    "principle": "Eşit ödül eşit katkı gerektirir.",
    "info6Text": "DKP anlamlı katılımı yansıtır:",
    "killsMatter": "Kill önemlidir.",
    "deadsMatter": "Ölü birlik önemlidir.",
    "activityMatter": "Aktivite önemlidir.",
    "info6End": "Herkes için adil ve keyifli bir ortam sağlamak amacıyla.",
    "dataDisclaimer": "Veri açıklaması",
    "footerText": "Bu sitedeki tüm veriler, hesaplamalar, analizler ve sunumlar şu kişi tarafından sağlanır ve yönetilir:",
    "footerUnofficial": "Bu resmi olmayan bir topluluk projesidir ve Lilith Games veya Rise of Kingdoms ile bağlantılı değildir.",
    "languageSelection": "Dil seçimi",
    "dkpDeads": "Ölüm DKP"
  },
  "vi": {
    "heroKicker": "Vương quốc 3688",
    "heroSubtitle": "Phân tích đóng góp KvK, theo dõi DKP và minh bạch phần thưởng",
    "navDashboard": "Bảng điều khiển",
    "navDetails": "Thống kê chi tiết",
    "navInfo": "Thông tin tính DKP",
    "dataset": "Dữ liệu",
    "reloadData": "Tải lại dữ liệu",
    "loading": "Đang tải...",
    "loaded": "Đã tải {count} người chơi từ {dataset}",
    "couldNotLoad": "Không thể tải Google Sheet.",
    "searchPlaceholder": "Tìm theo tên hoặc Character ID...",
    "quickSort": "Sắp xếp nhanh:",
    "totalPlayersOver25": "Người chơi trên 25M",
    "totalAdjustedDkp": "Tổng DKP điều chỉnh",
    "averageTotalGoal": "TB mục tiêu DKP tổng %",
    "below70Over25": "Dưới 70% mục tiêu tổng trên 25M",
    "topAdjustedDkp": "Top DKP điều chỉnh",
    "deadDkpFromFiller": "Dead DKP từ tài khoản phụ",
    "topTotalGoal": "Top mục tiêu DKP tổng %",
    "topDeadGoal": "Top mục tiêu Dead DKP %",
    "below70TotalGoal": "Dưới 70% mục tiêu DKP tổng",
    "rank": "Hạng",
    "characterId": "Character ID",
    "username": "Tên người chơi",
    "power": "Sức mạnh",
    "highestPower": "Sức mạnh cao nhất",
    "dkp": "DKP",
    "adjustedDkp": "DKP điều chỉnh",
    "dkpGoal": "Mục tiêu DKP",
    "totalDkpGoalPercent": "Mục tiêu DKP tổng %",
    "deadDkpGoalPercent": "Mục tiêu Dead DKP %",
    "totalKp": "Tổng KP",
    "t5Deaths": "T5 chết",
    "t4Deaths": "T4 chết",
    "deadGoalT5Equiv": "Mục tiêu quân chết (T5)",
    "reduction": "Giảm",
    "noActiveBelow70": "Không có người chơi hoạt động dưới 70% mục tiêu DKP tổng.",
    "dkpGoalLabel": "Mục tiêu DKP",
    "infoTitle": "DKP được tính như thế nào",
    "infoIntro": "Trang này giải thích cách tính DKP trong KD3688 và vì sao hệ thống chi tiết hơn bảng xếp hạng kill point đơn giản. Mục tiêu là đánh giá công bằng và minh bạch đóng góp chiến tranh và phân phối phần thưởng.",
    "info1Title": "1) Cách tính DKP cơ bản",
    "info1Text": "DKP dựa trên kills và quân chết trong thời gian chiến tranh.",
    "action": "Hành động",
    "dkpValue": "Giá trị DKP",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "dkpDeads": "DKP từ quân chết",
    "onePoint": "1 điểm",
    "twoPoints": "2 điểm",
    "sevenHalfPoints": "7.5 điểm",
    "fifteenPoints": "15 điểm",
    "info1Note": "Tổng DKP là tổng DKP từ kills và DKP từ quân chết.",
    "info2Title": "2) Mục tiêu DKP theo sức mạnh",
    "info2Text": "Mục tiêu DKP tăng theo sức mạnh ban đầu. Hệ thống là lũy tiến: mỗi mốc sức mạnh được tính riêng, giống hệ thống thuế.",
    "powerBracket": "Mốc sức mạnh",
    "multiplier": "Hệ số",
    "first45": "45M sức mạnh đầu tiên",
    "from45to70": "Từ 45M đến 70M sức mạnh",
    "above70": "Trên 70M sức mạnh",
    "info2Note": "Các giá trị này có thể được điều chỉnh trong các KvK tương lai nếu cần thiết.",
    "info3Title": "3) Yêu cầu quân chết tối thiểu",
    "info3Text": "Ít nhất <strong>20% DKP của bạn phải đến từ quân chết</strong>. Nếu không đạt yêu cầu này, DKP của bạn có thể bị giảm.",
    "info3Box": "Dead DKP rất quan trọng vì nó thể hiện sự hy sinh thực sự, chứ không chỉ đơn thuần là farm kills.",
    "info3Example": "Ví dụ: nếu số lượng quân chết của bạn quá thấp, tổng DKP sẽ bị giới hạn dựa trên đóng góp Dead DKP của bạn. Điều này giúp hạn chế việc chạy theo KP và phân bổ gánh nặng KvK một cách công bằng.",
    "info4Title": "4) Người dẫn Rally và Garrison",
    "info4Text": "Người dẫn rally và garrison thường có ít cơ hội đánh open field hơn, vì họ phải tập trung các march quan trọng, trang bị và đội hình tướng vào các mục tiêu của vương quốc.",
    "info4Bullet1": "Người dẫn rally có thể nhận bonus DKP.",
    "info4Bullet2": "Người dẫn garrison có thể nhận bonus DKP cao hơn.",
    "info4End": "Điều này ghi nhận trách nhiệm của họ trong khi vẫn giữ việc đánh giá công bằng.",
    "info5Title": "5) Hoạt động bên ngoài Vương quốc",
    "info5Text": "Nếu một người chơi ở ngoài vương quốc trong thời gian không có chiến tranh, nhận Golden Chests ở nơi khác hoặc ít hoạt động hơn trong KD3688, yêu cầu DKP của họ có thể bị tăng lên.",
    "info5End": "Là một phần của vương quốc đồng nghĩa với việc đóng góp vào matchmaking và vị trí seed. Điều đó đi kèm với trách nhiệm.",
    "info6Title": "6) Nguyên tắc cốt lõi",
    "principle": "Phần thưởng ngang nhau cần đóng góp ngang nhau.",
    "info6Text": "DKP phản ánh sự tham gia có ý nghĩa:",
    "killsMatter": "Kills quan trọng.",
    "deadsMatter": "Quân chết quan trọng.",
    "activityMatter": "Hoạt động quan trọng.",
    "info6End": "Nhằm duy trì một môi trường công bằng và thú vị cho tất cả mọi người.",
    "dataDisclaimer": "Tuyên bố dữ liệu",
    "footerText": "Tất cả dữ liệu, tính toán, phân tích và hiển thị trên trang này được cung cấp và duy trì bởi",
    "footerUnofficial": "Đây là dự án cộng đồng không chính thức và không liên kết với Lilith Games hoặc Rise of Kingdoms.",
    "languageSelection": "Chọn ngôn ngữ"
  },
  "pl": {
    "heroKicker": "Królestwo 3688",
    "heroSubtitle": "Analiza wkładu KvK, śledzenie DKP i przejrzystość nagród",
    "navDashboard": "Panel",
    "navDetails": "Szczegółowe statystyki",
    "navInfo": "Informacje o obliczaniu DKP",
    "dataset": "Zestaw danych",
    "reloadData": "Odśwież dane",
    "loading": "Ładowanie...",
    "loaded": "Załadowano {count} graczy z {dataset}",
    "couldNotLoad": "Nie udało się załadować Google Sheet",
    "searchPlaceholder": "Szukaj według nazwy gracza lub Character ID...",
    "quickSort": "Szybkie sortowanie:",
    "totalPlayersOver25": "Gracze powyżej 25M",
    "totalAdjustedDkp": "Łączne skorygowane DKP",
    "averageTotalGoal": "Średni cel całkowity DKP %",
    "below70Over25": "Poniżej 70% celu całkowitego powyżej 25M",
    "topAdjustedDkp": "Top skorygowane DKP",
    "topTotalGoal": "Top całkowity cel DKP %",
    "topDeadGoal": "Top cel Dead DKP %",
    "below70TotalGoal": "Poniżej 70% całkowitego celu DKP",
    "rank": "Ranga",
    "characterId": "Character ID",
    "username": "Nazwa gracza",
    "power": "Moc",
    "deadDkpFromFiller": "Dead DKP od fillerów",
    "highestPower": "Najwyższa moc",
    "dkp": "DKP",
    "adjustedDkp": "Skorygowane DKP",
    "dkpGoal": "Cel DKP",
    "totalDkpGoalPercent": "Całkowity cel DKP %",
    "deadDkpGoalPercent": "Cel Dead DKP %",
    "totalKp": "Łączne KP",
    "t5Deaths": "Śmierci T5",
    "t4Deaths": "Śmierci T4",
    "deadGoalT5Equiv": "Cel deadów (T5)",
    "reduction": "Redukcja",
    "noActiveBelow70": "Brak aktywnych graczy poniżej 70% całkowitego celu DKP.",
    "dkpGoalLabel": "Cel DKP",
    "infoTitle": "Jak obliczane jest DKP",
    "infoIntro": "Ta strona wyjaśnia, jak DKP jest obliczane w KD3688 i dlaczego system jest bardziej szczegółowy niż zwykły ranking kill pointów. Celem jest uczciwa i przejrzysta ocena wkładu wojennego, podziału nagród i dystrybucji Autarch.",
    "info1Title": "1) Podstawowe obliczanie DKP",
    "info1Text": "DKP opiera się na killach i martwych jednostkach podczas wojny.",
    "action": "Akcja",
    "dkpValue": "Wartość DKP",
    "t4Kills": "T4 Kills",
    "t5Kills": "T5 Kills",
    "t4Deads": "T4 Deads",
    "t5Deads": "T5 Deads",
    "onePoint": "1 punkt",
    "twoPoints": "2 punkty",
    "sevenHalfPoints": "7,5 punktu",
    "fifteenPoints": "15 punktów",
    "info1Note": "Łączne DKP to suma DKP z killów i DKP z deadów.",
    "info2Title": "2) Wymaganie DKP oparte na mocy",
    "info2Text": "Wymagania DKP skalują się z początkową mocą. System jest progresywny, co oznacza, że każdy próg mocy jest liczony osobno. Gracze z wyższą mocą nadal częściowo korzystają z niższych progów, podobnie jak w systemie podatkowym.",
    "powerBracket": "Próg mocy",
    "multiplier": "Mnożnik",
    "first45": "Pierwsze 45M mocy",
    "from45to70": "45M do 70M mocy",
    "above70": "Powyżej 70M mocy",
    "info2Note": "Te wartości mogą zostać dostosowane w przyszłych KvK, jeśli będzie to potrzebne.",
    "info3Title": "3) Minimalne wymaganie deadów",
    "info3Text": "Co najmniej <strong>20% twojego DKP musi pochodzić z deadów</strong>. Jeśli ten wymóg nie zostanie spełniony, twoje DKP może zostać odpowiednio zredukowane.",
    "info3Box": "Dead DKP jest ważne, ponieważ pokazuje realne poświęcenie, a nie tylko farmienie KP.",
    "info3Example": "Przykład: jeśli twoje deady są zbyt niskie, twoje całkowite DKP zostanie ograniczone na podstawie wkładu z deadów. Pomaga to ograniczyć KP chasing i utrzymać sprawiedliwy ciężar KvK.",
    "info4Title": "4) Rally i Garrison Leads",
    "info4Text": "Rally i garrison leads często mają mniej okazji do open field, ponieważ muszą skupiać kluczowe marsze, ekwipunek i ustawienia dowódców na celach królestwa.",
    "info4Bullet1": "Rally leads mogą otrzymać bonus DKP.",
    "info4Bullet2": "Garrison leads mogą otrzymać wyższy bonus DKP.",
    "info4End": "To uznaje ich odpowiedzialność i utrzymuje ocenę fair.",
    "info5Title": "5) Aktywność zewnętrzna",
    "info5Text": "Jeśli gracz przebywa poza królestwem poza okresem wojny, korzysta z Golden Chests gdzie indziej albo jest mniej aktywny w KD3688, jego wymagania DKP mogą zostać zwiększone.",
    "info5End": "Bycie częścią królestwa oznacza wkład w matchmaking i pozycję seeda. To wiąże się z odpowiedzialnością.",
    "info6Title": "6) Główna zasada",
    "principle": "Równe nagrody wymagają równego wkładu.",
    "info6Text": "DKP odzwierciedla znaczący udział:",
    "killsMatter": "Kille mają znaczenie.",
    "deadsMatter": "Deady mają znaczenie.",
    "activityMatter": "Aktywność ma znaczenie.",
    "info6End": "Dla sprawiedliwego i przyjemnego środowiska dla wszystkich.",
    "dataDisclaimer": "Informacja o danych",
    "footerText": "Wszystkie dane, obliczenia, analizy i prezentacje na tej stronie są dostarczane i utrzymywane przez",
    "footerUnofficial": "To nieoficjalny projekt społecznościowy i nie jest powiązany z Lilith Games ani Rise of Kingdoms.",
    "languageSelection": "Wybór języka",
    "dkpDeads": "DKP za poległych"
  }
};

let currentLanguage = localStorage.getItem("kd3688Language") || "en";

function t(key, params = {}) {
  const dict = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en;
  let value = dict[key] || TRANSLATIONS.en[key] || key;
  Object.entries(params).forEach(([param, replacement]) => {
    value = value.replace(`{${param}}`, replacement);
  });
  return value;
}

function applyLanguage(lang) {
  currentLanguage = lang;
  localStorage.setItem("kd3688Language", lang);
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });

  document.querySelectorAll("[data-i18n-html]").forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll(".lang-button").forEach(button => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });

  renderDashboard();
  renderTable();
}

function setupLanguageSelector() {
  document.querySelectorAll(".lang-button").forEach(button => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });
  applyLanguage(currentLanguage);
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
      <span>
        ${player.username || player.characterId}
        <small class="ranking-subline">&nbsp;</small>
      </span>
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
        <small class="ranking-subline">
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
    container.innerHTML = `<p>${t("noActiveBelow70")}</p>`;
    return;
  }

  container.innerHTML = low.map((player, index) => `
    <div class="ranking-row">
      <span>#${index + 1}</span>
      <span>
        ${player.username || player.characterId}
        <small class="ranking-subline">
          ${t("dkpGoalLabel")}: ${formatNumber(player.dkpGoal)}
        </small>
      </span>
      <strong class="low">${formatPercent(player.goalPercent)}</strong>
    </div>
  `).join("");
}


function syncDetailsTableHeaders() {
  const headerRow = document.querySelector("#statsTable thead tr");
  if (!headerRow) return;

  headerRow.innerHTML = `
    <th data-i18n="rank">Rank</th>
    <th data-sort="characterId" data-i18n="characterId">Character ID</th>
    <th data-sort="username" data-i18n="username">Username</th>
    <th data-sort="power" data-i18n="power">Power</th>
    <th data-sort="dkp" data-i18n="dkp">DKP</th>
    <th data-sort="dkpDeads" data-i18n="dkpDeads">Dead DKP</th>
    <th data-sort="adjustedDkp" data-i18n="adjustedDkp">Adjusted DKP</th>
    <th data-sort="dkpGoal" data-i18n="dkpGoal">DKP Goal</th>
    <th data-sort="goalPercent" data-i18n="totalDkpGoalPercent">Total DKP Goal %</th>
    <th data-sort="deadDkpAchieved" data-i18n="deadDkpGoalPercent">Dead DKP Goal %</th>
    <th data-sort="totalKp" data-i18n="totalKp">Total KP</th>
    <th data-sort="t5Deaths" data-i18n="t5Deaths">T5 Deaths</th>
    <th data-sort="t4Deaths" data-i18n="t4Deaths">T4 Deaths</th>
    <th data-sort="deadDkpFromFiller" data-i18n="deadDkpFromFiller">Dead DKP from Filler</th>
    <th data-sort="reduction" data-i18n="reduction">Reduction</th>
    <th data-sort="deadGoalT5Equiv" data-i18n="deadGoalT5Equiv">Dead Goal (T5)</th>
  `;

  document.querySelectorAll("#statsTable th").forEach(header => {
    header.addEventListener("click", () => {
      const key = header.dataset.sort;
      if (key) setSort(key);
    });
  });

  applyLanguage(currentLanguage);
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

  tbody.innerHTML = filtered.map((player, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${player.characterId}</td>
      <td>${player.username}</td>
      <td>${formatNumber(player.power)}</td>
      <td>${formatNumber(player.dkp)}</td>
      <td>${formatNumber(player.dkpDeads)}</td>
      <td>${formatNumber(player.adjustedDkp)}</td>
      <td>${formatNumber(player.dkpGoal)}</td>
      <td class="${metricClass(player.goalPercent)}">${formatPercent(player.goalPercent)}</td>
      <td class="${metricClass(player.deadDkpAchieved)}">${formatPercent(player.deadDkpAchieved)}</td>
      <td>${formatNumber(player.totalKp)}</td>
      <td class="${player.zeroed ? 'zeroed-deaths' : ''}">
        ${formatNumber(player.t5Deaths)}
      </td>
      
      <td class="${player.zeroed ? 'zeroed-deaths' : ''}">
        ${formatNumber(player.t4Deaths)}
      </td>
      <td>${formatNumber(player.deadDkpFromFiller)}</td>
      <td class="${reductionClass(player.reduction)}">${formatPercent(player.reduction)}</td>
      <td>${formatNumber(player.deadGoalT5Equiv)}</td>
    </tr>
  `).join("");
}

function setupTable() {
  document.getElementById("searchInput").addEventListener("input", renderTable);

  syncDetailsTableHeaders();

  document.querySelectorAll(".details-sort").forEach(button => {
    button.addEventListener("click", () => {
      setSort(button.dataset.sort);
      document.querySelectorAll(".details-sort").forEach(b => b.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function setSort(key) {
  if (!key) return;

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
setupLanguageSelector();
loadDataset();
