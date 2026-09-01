# Log Level Rubric

The level of a persisted log row is read by non-technical merchants in the Store
health → Logs screen. A level is a promise about **how the operation ended**, not
about the loudest moment inside it (issue #899): a 401 that the token-refresh
layer absorbs and successfully retries is part of a healthy cycle, and stamping
it `warn` when the response lands — before the story's ending is known — tells
the user something is broken when nothing is.

Every new producer is reviewed against this rubric:

| Level   | Promise to the reader                       | Examples |
| ------- | ------------------------------------------- | -------- |
| `error` | Needs user action now.                      | Refresh token exhausted/forbidden (re-login required), payment declined, order save failed. |
| `warn`  | Will need attention **if it persists**.     | Retryable server 5xx, storage nearing quota, repeated slow queries. |
| `info`  | Lifecycle — normal, meaningful state change. | "Session renewed automatically", sync completed, user logged in. |
| `debug` | Forensic detail for diagnosis only.          | Individual request attempts, retries, state transitions — including transient failures that later **recovered**. |

## Terminal-outcome rule

Where one layer can see a whole arc (attempt → recovery → settle), that layer
decides the level once the arc settles:

- A transient failure the system healed on its own → `debug` with
  `outcome: 'recovered'` in the terminal fields, sharing the ORIGINAL attempt's
  `operationId` so the Logs ledger can chain attempt → recovery → success.
- One `info` lifecycle row per recovery cycle (not per absorbed request).
- Only the **settled** failure (`AuthRefreshExhaustedError`,
  `AuthForbiddenError`, retries exhausted) earns `warn`/`error`.

Producers that cannot see the ending (fire-and-forget transports) must not
guess: log the attempt at `debug` and let the arc-owning layer write the
terminal row.

## Repeat-collapse escalation (future)

Identical rows recurring within 60 seconds collapse into one row with
`count`/`firstSeen`/`lastSeen`, even when other identities interleave (spec §7).
A *recurring* recovered failure can indicate pathological
churn (e.g. token refresh cycling many times per hour); when the collapse
writer grows threshold promotion, a collapsed `outcome: 'recovered'` row whose
`count` crosses a threshold within a window may be promoted to `warn`. The
current writer only folds `count`/`lastSeen` and has no threshold mechanism —
do NOT hand-roll per-producer escalation; add it to the collapse writer when it
is needed.
