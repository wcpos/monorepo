# Behaviour ledger: `pane-stack`

Seeded 2026-10-01 from the owner's review of the products drill-in (the reference was a desktop chat client's community push, studied frame by frame) and decision 32 of the language prototype. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** Two panes on one stage, pushed and popped as one motion.

**Base:** React Native View and Reanimated shared values (`useSharedValue`, `useAnimatedStyle`, `withTiming`) — the API Reanimated names for screen transitions and several animations orchestrated together.

## Lines

1. Both panes stay mounted for the whole transition and one shared value moves them together: the detail travels the full width while the root drifts 24% and dims to 0.35, over `PANE` on the shared ease; a pop is the same value running back — evidence: decision 32 (2026-09-16); the first build used `entering`/`exiting` layout animations, which unmount the old pane instead of sliding it off.
2. Nothing animates on mount — evidence: owner review; the first build's `entering` slid the products table in on every page load.
3. Only `transform` and `opacity` animate — evidence: Reanimated's performance guide (non-layout properties); measured 0 dropped frames over push, pop and an interrupted push on web.
4. The push answers the tap on the next frame and never waits for the detail's data. A detail that loads late loads into a frame of the same size, so what arrives mid-flight changes contents and not layout — evidence: a wait-for-content gate measured ~170 ms of nothing after the tap and still missed (resident variations took ~300 ms); `DataTableSkeleton` now mirrors the table's header, row cells and pinned footer (skeleton row and real row both measured 93 px at the same offset).
5. A covered root keeps its layout and its scroll position, and leaves the tab order and accessibility tree (`visibility: hidden` on web, `aria-hidden` everywhere) only once the push has landed; a pop uncovers it at once — evidence: the root is what the cashier returns to, at the row they left.
6. Progress is clamped to 0–1 inside the worklet — evidence: a first frame stamped a hair before the animation's start asks the bezier for a negative time and it extrapolates; measured as one frame of the pane stepping backwards (334 → 354 px).
7. An exiting pane takes no presses, and the root takes none while a detail is on stage — evidence: both panes are on screen for 280 ms.
8. A detail must not suspend on data that is a frame away. React holds a committed Suspense fallback for 300 ms before revealing what replaces it, so a query that answers 9 ms after mount still showed its skeleton for a third of a second — past the end of the slide. The variations pane awaits the first answer outside Suspense (`resource.valueRef$$`), where the swap is immediate and happens while the pane is still off-stage — evidence: filmed frame by frame 2026-10-01; table rendered at +14 ms, committed at +290 ms; after the change the pane's first on-screen frame carries its real rows.
9. A detail that is leaving is hidden from the accessibility tree, and focus goes back to what had it when the detail was pushed — evidence: Codex review on #2376, 2026-10-02: for the length of every pop a screen reader could reach both the restored root and the obsolete detail, and focus sat on a control about to unmount; test "hides a leaving detail from the accessibility tree and gives focus back to what opened it".
