# Behaviour ledger: `slide-over`

Seeded 2026-10-01 from the owner's review of the open-orders list ("slide up really nicely… springing from the cart tabs to cover the cart"), after the products drill-in was rebuilt on `pane-stack`. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A cover that slides out of one edge of its frame, over what is there, and back into the same edge.

**Base:** React Native View and a Reanimated CSS transition on `transform` (`transitionProperty`, `cubicBezier`). On web the browser runs it off the main thread.

## Lines

1. The cover comes out of the named edge (`top`, `bottom`, `left` or `right`) and leaves through it; the frame clips, so it appears to come out of whatever sits against that edge — evidence: owner, 2026-10-01; the open-orders list previously appeared and vanished with no motion.
2. The cover stays mounted until it has slid out, and a close interrupted by a reopen does not unmount it — evidence: `pane-stack` line 1; test "a close interrupted by a reopen leaves the cover mounted".
3. Only `transform` animates; what is covered does not move. It arrives over `PANE` on the shared ease and leaves over `PANEL_SLIDE_OUT` on an accelerating curve — evidence: `pane-stack` line 3; filmed 2026-10-01, leaving on the shared (decelerating) ease left a sliver of the cover creeping at the edge for its last five frames.
4. The offset is a percentage of the cover's own size, so nothing is measured before the first frame; the cover is painted parked outside its frame for one frame and then lands — evidence: a measured size arrives through `onLayout`, which on web is asynchronous and can land after the first frame.
5. The slide is a CSS transition, not a shared value driven from JavaScript — evidence: filmed 2026-10-02 on the orders pane: the list beside the pane re-lays out on the same tap, the main thread stalls, and the JS-driven slide was skipped (the pane was absent in one frame and fully in place in the next). The first build (shared value, clamped in a worklet) was smooth only where nothing else rendered. Struck with it: the worklet clamp, which a transition does not need.
6. A cover that is leaving takes no presses — evidence: `pane-stack` line 7.
7. Reduce-motion: no travel, and a closed cover unmounts at once — evidence: `CODING_STANDARDS.md` § Design 6.
8. `onLeft` fires once the cover has slid out and unmounted, and not for a close that a reopen interrupted — evidence: Codex review on #2376, 2026-10-02: the orders list dropped its narrow rows the moment the selection cleared and reflowed behind the pane while it was still leaving; test "says when it has left, and not when the close was interrupted".
9. A cover that mounts already open is in place; nothing slides on mount. A cover that is leaving is hidden from the accessibility tree — evidence: Codex review on #2376, 2026-10-02 (a reloaded wide Orders view with an order selected slid its pane in after the page appeared); tests "a cover that mounts already open is in place" and "leaves faster…".
