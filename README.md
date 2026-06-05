# KD3688 KingdomStats - Google Sheets Version

This starter website loads DKP data directly from your Google Sheet.

Google Sheet ID:

`11zMZAPm2tSrEebS4tdhYsG-eXEhre9LzokYL78V5yO4`

## Important

The Google Sheet needs to be accessible by visitors.

Recommended setting:

Google Sheets -> Share -> Anyone with the link can view

If the site cannot load the data, use:

File -> Share -> Publish to web

## Files

- `index.html` - website structure
- `style.css` - design
- `config.js` - Google Sheet settings and dataset tabs
- `script.js` - loading, parsing, dashboard, search, sorting

## Add future event/phase tabs

In `config.js`, add more datasets:

```js
datasets: [
  { label: "KvK6 Total", sheetName: "Overview" },
  { label: "KvK6 Zone5", sheetName: "KvK6_Zone5" },
  { label: "KvK6 Pass7 + KL", sheetName: "KvK6_Pass7_KL" }
]
```

## Expected headers

The site currently reads these headers:

- Character ID
- Username
- Power
- Highest Power
- DKP
- Adjusted DKP
- Reduction
- DKP Goal
- Normal DKP Goal
- Dead DKP Achieved
- Total KP
- T5 Deaths
- T4 Deaths

Character ID is used as the stable player key.
