# Behaviour ledger: `reports/chart`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Plot selected orders over the report period with platform-specific interaction.

**Composes:** `@wcpos/components/{text,vstack}` and `@wcpos/components/lib/utils`.

## Lines

1. Load the web chart lazily through Skia initialization, locating CanvasKit assets using the installed package version — preserves the web-specific rendering bootstrap — evidence: `72b86c5541 2025-03-06 add expo-font`; current entry point `reports/chart/index.web.tsx:17–23` — platform: web, Electron.
2. Memoize the web wrapper — protects against Skia’s null `rangeMin` error — evidence: `reports/chart/index.web.tsx:12–13`, “NOTE: wrap this component in memo to stop the Cannot read properties of null (reading 'rangeMin') error”, citing upstream react-native-skia issue 1629 — platform: web, Electron.
3. Mount the web canvas only while its screen is focused — retained drawer screens otherwise keep animation-frame loops and WebGL contexts alive — evidence: `7d05ddfdc8 2026-09-16 fix(web): mount Skia charts only while their screen is focused` — platform: web, Electron.
4. ~~Stack subtotal plus tax, not tax-inclusive total plus tax — prevents double-counting tax in bar heights — evidence: [^chart-intervals] — platform: all.~~ — Struck: the decided chart carries no tax and no refunds (build brief §1).
5. Trim single-day charts to the union of period sales and shifted comparison sales, expanded to instant-preserving hour boundaries; choose one clean minute interval targeting at most 12 steps; empty days retain the full day — evidence: [^chart-intervals]; `utils.test.ts` “should trim to order bounds (expanded to hour boundaries)”, “aligns Tuesday 09:00 with last Monday 09:00 and trims on their union”, and “uses the whole London day for an empty single-day chart” — platform: all.
6. Prepopulate zero-valued time buckets and exclude a minute interval beginning exactly at the range end — retains genuine gaps without an artificial trailing empty bar — evidence: [^chart-intervals]; `utils.test.ts` “should generate 30-minute intervals”, “should generate 60-minute (hourly) intervals”, “should generate 120-minute (2 hour) intervals”, and the missing-days/months cases — platform: all.
7. Detect single days by calendar-day equality and bucket dates in the viewed store zone — elapsed-time shortcuts and device dates misclassify report days — evidence: [^timezone]; `utils.test.ts` “should use isSameDay for single-day detection (calendar day comparison)”, London midnight and both DST cases; `chart.tsx` reads `useReportsPeriod().timezone` — platform: all.
8. Cap tick counts at available data, select only actual bucket positions and return an empty label for undefined labels — prevents interpolated ticks beyond the dataset and undefined axis text — evidence: [^chart-intervals]; `chart.tsx` `tickCount`, `ticks`, `formatXLabel`; `chart.test.tsx` “caps ticks at actual buckets and omits undefined labels” — platform: all.
9. Use hover on web, but a 100-ms long press with equally delayed pan activation on native — preserves mouse inspection and deliberate touch activation — evidence: `reports/chart/chart.tsx:112`, “Native: long press activates tooltip on touch, pan tracks movement”; `bf4403a2ea 2026-05-22 fix: address remaining PR blockers` — platform: web/Electron versus iOS/Android.
10. Store only raw touch position and derive the nearest plotted point inside the render callback — avoids retaining and reading chart-point refs during render — evidence: `reports/chart/chart.tsx:85–88`, “Track only the raw touch position in state” and “this avoids stashing chart points in a ref and reading that ref from gesture handlers during render.” — platform: all.
11. Anchor the tooltip to the bar top (or line point), choose above/below placement and constrain its horizontal position — keeps inspection attached to the sale and within chart bounds — evidence: original `chart.tsx:243–249` complete-stack positioning; now the bar is the total without a tax stack (build brief §1); `chart.tsx` `ToolTip` — platform: all.
12. ~~Accumulate absolute refund amounts separately, show them negatively only when nonzero, and enlarge/reflow the tooltip — refund information must not disappear or overlap order count — evidence: [^refunds], `reports/chart/chart.tsx:247–317` — platform: all.~~ — Struck: the decided chart carries no tax and no refunds (build brief §1).
13. Keep `getClosest` above the exported worklet helper — declaration order matters to worklet hoisting; the current chart separately uses its local nearest-point implementation — evidence: `reports/chart/findClosestPoint.ts:5`, “IMPORTANT! Keep this above findClosestPoint, for worklet/hoisting reasons” — platform: native worklet execution.

14. Bucket boundaries step the instant and are keyed by it; the wall-clock string is only the label, so a DST day keeps every sale's bucket and the repeated hour stays two buckets — evidence: wcpos/monorepo#2098 review, wcpos/roadmap#332 §7; `chart/utils.test.ts` names the spring-forward and fall-back cases — platform: all.
15. The comparison series lives on the period's grid: a day or week shifted back by the whole offset, a month by day-of-month; a bucket with no counterpart is null and the dashed line stops there — evidence: wcpos/roadmap#332 (PR 2 split comment); `chart/utils.test.ts` “aligns…” — platform: all.

## Evidence footnotes

[^chart-intervals]: `44317f7466 2026-01-22 fix: improve daily reports chart with smart time intervals`.
[^timezone]: `f2b5a84f70 2026-09-16 Date filters and reports follow the store's timezone, not the device's (#2098)`; body also names `wcpos/roadmap#324`.
[^refunds]: `4dd20a76a4 2026-03-13 feat: display refund information across cart, orders table, and reports (#189)`.
