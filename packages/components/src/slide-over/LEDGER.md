# Behaviour ledger: `slide-over`

Seeded 2026-10-01 from the owner's review of the open-orders list ("slide up really nicely… springing from the cart tabs to cover the cart"), after the products drill-in was rebuilt on `pane-stack`. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A cover that slides out of one edge of its frame, over what is there, and back into the same edge.

**Base:** React Native View and Reanimated shared values (`useSharedValue`, `useAnimatedStyle`, `withTiming`), as `pane-stack`.

## Lines

1. The cover comes out of the named edge (`top` or `bottom`) and leaves through it; the frame clips, so it appears to come out of whatever sits against that edge — evidence: owner, 2026-10-01; the open-orders list previously appeared and vanished with no motion.
2. The cover stays mounted until it has slid out, and a close interrupted by a reopen does not unmount it — evidence: `pane-stack` line 1; test "a close interrupted by a reopen leaves the cover mounted".
3. Only `transform` animates; what is covered does not move. It arrives over `PANE` on the shared ease and leaves over `PANEL_SLIDE_OUT` on an accelerating curve — evidence: `pane-stack` line 3; filmed 2026-10-01, leaving on the shared (decelerating) ease left a sliver of the cover creeping at the edge for its last five frames.
4. The offset is a percentage of the cover's own height, so nothing is measured before the first frame; the slide starts one frame after mount, from a painted position outside the frame — evidence: a measured height arrives through `onLayout`, which on web is asynchronous and can land after the first frame.
5. Progress is clamped to 0–1 inside the worklet — evidence: `pane-stack` line 6.
6. A cover that is leaving takes no presses — evidence: `pane-stack` line 7.
