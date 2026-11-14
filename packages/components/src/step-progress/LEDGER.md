# Behaviour ledger: `step-progress`

Seeded 2026-10-06 from the owner's review of the terminal payment pane (four rounds of live HTML in `~/Projects/wcpos-handoffs/terminal-pane-flat-boink-2026-10-06.html`). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A row of steps on one rail: what is done, where we are, what is to come.

**Base:** React Native View and Reanimated shared values (`useSharedValue`, `useAnimatedStyle`, `withTiming`, `withSpring`, `withSequence`, `withDelay`, `withRepeat`). Only `transform` and `opacity` animate.

## Lines

1. One badge, three states. To come is a hollow bead on the rail; here is the ring (the surface inside, the colour on the border, a dot in the middle); done is the same badge closed, the dot having grown to fill the ring, with the tick on the solid face — evidence: owner, 2026-10-06: "have the ring and the dot … show me how the ring turns into the tick: the closed filled-in circle".
2. Nothing travels ahead of where we are: the fill runs from the badge we leave to the next and stops; there is no pulse, halo or comet — evidence: owner, 2026-10-06: a travelling pulse made it "confusing which stage you're at. Are you going to the next one? Are you at this one?"; the first drawing's halo ("the shadow that goes outside") was struck in the same review.
3. Moving on is one hand-off: the ring we leave closes over 360 ms and its face goes solid at 260 ms; the tick pops at 260 ms; the fill sets off at 300 ms and arrives 400 ms later; the next ring boinks in at 600 ms — evidence: the slow-motion frames in the drawing, read by the owner ("Perfect! Let's go!").
4. The current ring boinks in (a loose spring from 0.55 of its size) and beats softly every 2.4 s while we wait — evidence: owner, 2026-10-06: "I like the expanding."
5. The tick pops past its size (1.4) and squashes back on a spring — evidence: owner, 2026-10-06: "the tick should have a nice expand before contracting back to its final size. A juicy bounce."
6. A closed badge is one flat disc: its face goes solid before the core reaches the border, because the two anti-alias against each other and leave a hairline of the surface — evidence: owner's screenshot, 2026-10-06: "a slight white circle visible where the ring meets the inner circle".
7. A failed step closes red with a cross and shakes once; a stopped step (cancelled, timed out, released) closes grey with a dash; the path behind either goes quiet, so the mark is the only colour left — evidence: design rule 5 (never colour alone) and the terminal pane's standing rule that nobody lost money on a cancel.
8. Complete turns the whole rail and every badge green — evidence: the drawing's Captured state; design rule 6's completion beat.
9. Nothing animates on mount: shared values start at the state's resting values, and the only transitions are state changes while mounted — evidence: CODING_STANDARDS § Design 6.
10. The step we are on carries `aria-selected`, whether it is open, failed or stopped there; each node takes a caller-supplied testID — evidence: `apps/main/e2e/checkout-terminal.spec.ts` polls `checkout-terminal-step-1[aria-selected]`.
11. Columns are equal and labels wrap under their own node; width never follows label length — evidence: design rule 4; five German labels in the drawing.
12. The next ring opens at 600 ms, as the fill (300–700 ms) reaches it, not after it stops; a node skipped by a multi-step jump opens on the same clock. A per-node schedule was declined on review (#2403): the terminal pane coalesces phases, so a two-step jump is rare, and the difference is 100 ms on a path nobody waits on — evidence: owner's frame-by-frame read of the drawing's hand-off; Codex thread on #2403, 2026-10-06.
13. A step that changes again inside its wait (failed before the ring arrived; forward two then back one) records when its badge would have arrived and waits out the remainder; the fill judges direction from where it is, not from the last target — evidence: Codex threads on #2403, rounds three to five.
