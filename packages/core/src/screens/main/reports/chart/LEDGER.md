# Behaviour ledger: `reports/chart`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Plot selected orders over the report period with platform-specific interaction.

**Composes:** `@wcpos/components/{text,vstack}` and `@wcpos/components/lib/utils`.

## Lines

1. Load the web chart lazily through Skia initialization, locating CanvasKit assets using the installed package version — preserves the web-specific rendering bootstrap — evidence: `72b86c5541 2025-03-06 add expo-font`; current entry point `reports/chart/index.web.tsx:17–23` — platform: web, Electron.
2. Memoize the web wrapper — protects against Skia’s null `rangeMin` error — evidence: `reports/chart/index.web.tsx:12–13`, “NOTE: wrap this component in memo to stop the Cannot read properties of null (reading 'rangeMin') error”, citing upstream react-native-skia issue 1629 — platform: web, Electron.
3. Mount the web canvas only while its screen is focused — retained drawer screens otherwise keep animation-frame loops and WebGL contexts alive — evidence: `7d05ddfdc8 2026-09-16 fix(web): mount Skia charts only while their screen is focused` — platform: web, Electron.
4. Stack subtotal plus tax, not tax-inclusive total plus tax — prevents double-counting tax in bar heights — evidence: [^chart-intervals] — platform: all.
5. Trim single-day charts to the first/last sale’s hour boundaries and choose clean minute intervals targeting at most 12 steps; empty days retain the full day — avoids long empty margins and overcrowded bars — evidence: [^chart-intervals]; `reports/chart/utils.ts:194–196`, “Trims empty hours before first sale and after last sale. Falls back to full day if no orders.” — platform: all.
6. Prepopulate zero-valued time buckets and exclude an interval beginning exactly at the range end — retains genuine gaps without an artificial trailing empty bar — evidence: `reports/chart/utils.ts:184`, “Use < instead of <= to avoid generating an empty interval at the exact end time”; `:263`, “Initialize all intervals with zero values” — platform: all.
7. Detect single days by calendar-day equality and bucket dates in the store zone — elapsed-time shortcuts and device dates misclassify report days — evidence: `7d4bf7101c 2026-01-22 feat: add CI test workflow and timezone audit for chart utils`; [^timezone] — platform: all.
8. Cap tick counts at available data and return an empty label for undefined labels — prevents interpolated ticks beyond the dataset and undefined axis text — evidence: `reports/chart/chart.tsx:130`, “Limit to actual data length to prevent victory-native from interpolating beyond our data”; [^chart-intervals] — platform: all.
9. Use hover on web, but a 100-ms long press with equally delayed pan activation on native — preserves mouse inspection and deliberate touch activation — evidence: `reports/chart/chart.tsx:112`, “Native: long press activates tooltip on touch, pan tracks movement”; `bf4403a2ea 2026-05-22 fix: address remaining PR blockers` — platform: web/Electron versus iOS/Android.
10. Store only raw touch position and derive the nearest plotted point inside the render callback — avoids retaining and reading chart-point refs during render — evidence: `reports/chart/chart.tsx:85–88`, “Track only the raw touch position in state” and “this avoids stashing chart points in a ref and reading that ref from gesture handlers during render.” — platform: all.
11. Anchor the tooltip to the top of the complete stack, choose above/below placement and constrain its horizontal position — keeps inspection attached to the bar and within chart bounds — evidence: `reports/chart/chart.tsx:243`, “Top of stack = totalY - taxHeight”; `:249`, “Calculate tooltip position to keep it on screen” — platform: all.
12. Accumulate absolute refund amounts separately, show them negatively only when nonzero, and enlarge/reflow the tooltip — refund information must not disappear or overlap order count — evidence: [^refunds], `reports/chart/chart.tsx:247–317` — platform: all.
13. Keep `getClosest` above the exported worklet helper — declaration order matters to worklet hoisting; the current chart separately uses its local nearest-point implementation — evidence: `reports/chart/findClosestPoint.ts:5`, “IMPORTANT! Keep this above findClosestPoint, for worklet/hoisting reasons” — platform: native worklet execution.

## Evidence footnotes

[^chart-intervals]: `44317f7466 2026-01-22 fix: improve daily reports chart with smart time intervals`.
[^timezone]: `f2b5a84f70 2026-09-16 Date filters and reports follow the store's timezone, not the device's (#2098)`; body also names `wcpos/roadmap#324`.
[^refunds]: `4dd20a76a4 2026-03-13 feat: display refund information across cart, orders table, and reports (#189)`.
