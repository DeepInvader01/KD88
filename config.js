// KD3688 KingdomStats configuration

const CONFIG = {
  spreadsheetId: "11zMZAPm2tSrEebS4tdhYsG-eXEhre9LzokYL78V5yO4",

  // Add more tabs later, for example:
  // { label: "KvK6 Zone5", sheetName: "KvK6_Zone5" },
  // { label: "KvK6 Pass7 + KL", sheetName: "KvK6_Pass7_KL" },
  datasets: [
    { label: "KvK6 Total", sheetName: "Overview" }
  ],

  // This site expects the Google Sheet tab to have headers in row 1.
  // Your important headers:
  // Character ID, Username, Power, Highest Power, DKP, Adjusted DKP,
  // DKP Goal, Normal DKP Goal, Dead DKP Achieved, Total KP, T5 Deaths, T4 Deaths
};
