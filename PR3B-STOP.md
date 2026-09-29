# PR 3B scope stop — incomplete, do not deploy

Implementation stopped at **397 changed non-test source lines** against `a98d278981e7`
(the parent of the pool-growth commit). This counts additions plus deletions, including
new untracked source files; excludes tests/probes, generated worker, lockfile and reports.
The initial target was 390. AGENTS.md declares a hard ceiling of 400; the brief says about
450. An explicit question requesting permission for up to 500 is outstanding.

Built: pool growth, tested live-tab protocol, write-hold callback, partial screen/gate and
existing engine/hydration teardown wiring. No push, PR, fetch, pull or rebase.

Why more is needed:
- Capture holds are not wired. The brief's tender hook starts asynchronous terminal legs;
  the actual awaited captures are now in `payments/server/server-leg.ts` and
  `payments/device/device-leg.ts`. The contract checkout and manual tender paths also
  need their holds and tests.
- A genuinely wedged write can leave `closeRegisteredDatabases()` waiting after the
  protocol's 15-second ceiling. The artificial test hold does not reproduce that. Reuse
  the existing terminal-storage/disposal primitive rather than claim the gate is bounded.
- The page-lifetime gate still needs provider-free real rendering, light/dark verification,
  SSR/Electron selection checks and lifecycle review. The protocol-only probe does not
  cover those app integration obligations.

What I would cut: the unfinished app integration can be excluded to deliver only pool
growth and the protocol primitive. I would NOT cut payment protection or wedged-write
teardown and label the result complete. Completing the original brief needs additional
scope permission, not a broader architecture.

See PR3B-NOTES.md for evidence, exact current copy and remaining work.
