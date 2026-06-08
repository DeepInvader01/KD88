# KD3688 KingdomStats - Google Sheets Version v2

Changes in this version:
- Removed subtitle under title
- Removed Dashboard Focus buttons from Dashboard
- Dashboard Total Players ignores players below 25M Adjusted DKP
- Dashboard Below 70% Goal ignores players below 25M Adjusted DKP
- Improved German number parsing for values like 4.400.000.000

Upload these files to GitHub Pages:
- index.html
- style.css
- config.js
- script.js
- README.md


v3 changes:
- Dashboard Top Dead Goal % now shows T5 and T4 deaths.
- Dashboard Below 70% Goal now shows DKP Goal.
- Dashboard Below 70% Goal is sorted by highest DKP Goal first and shows top 10.


v4 changes:
- Added third page/tab: Info.
- Info page explains DKP calculation, progressive power requirement, dead requirement, rally/garrison bonuses, external activity, and reward principle.
- Renamed labels to Total DKP Goal % and Dead DKP Goal %.
- Dashboard active-player threshold now uses Power over 25M instead of Adjusted DKP over 25M.


v5 style changes:
- Centered hero header.
- Centered Dashboard / Detailed Stats / Info buttons.
- More color variance for navigation and quick-sort buttons.
- Blue/cyan/purple edge gradient background.
- More polished dashboard cards and panels.


v7 changes:
- Dashboard panels now use equal height.
- Top Adjusted DKP and Top Total DKP Goal % align visually.
- All dashboard panels have consistent row spacing.
- Added colored side accents to dashboard panels.
- Added subtle hover effect to ranking rows.
- Table remains wider with internal scrollbars.


v8 changes:
- Fixed inconsistent dashboard row heights.
- All Top lists now use the same two-line structure, even when the second line is empty.


v9 changes:
- Main site width increased to 1850px.
- Detailed Stats table now has its own `details-table` class and wider min-width.
- Info page tables are fixed so they do not inherit the wide detailed table layout.
- Reduction column is color-coded:
  - Green: no reduction
  - Yellow: reduced
  - Red: heavily reduced


v10 changes:
- Restored dynamic Rank column in Detailed Stats.
- Rank always displays 1, 2, 3, ... based on the current sort/filter.
- Fixed Dead DKP Goal % parsing by reading it as a raw number multiplier.


v11 changes:
- Added language selector: EN, DE, FR, TR, VI.
- Translates Dashboard, Detailed Stats headers, Info page and footer.
- Saves selected language in localStorage.
- Includes the percentage parsing fixes:
  - Total DKP Goal % uses parseNumber(...)
  - Dead DKP Goal % uses parseNumber(...)


v12 changes:
- Fixed JavaScript syntax error that prevented Google Sheet loading.
- Dataset selector setup order improved.


v13 changes:
- Added Polish language.
- Replaced short language codes with full language names.
- Added clear "Language selection" label above the language buttons.


v14 changes:
- Fixed missing French, Turkish, and Vietnamese translations for section 4: Rally and Garrison Leads.
