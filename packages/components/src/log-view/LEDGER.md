# Behaviour ledger: `log-view`

Seeded 2026-10-06 from the owner's review of the terminal payment pane's details (`~/Projects/wcpos-handoffs/step-progress-and-log-view-2026-10-06.html`, then the flat round). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** A log as a read-only text box that reads clearly and copies cleanly.

**Base:** React Native View, ScrollView and Text; the Clipboard API on web, `Share` on native.

## Lines

1. Fixed-width columns: the time in one column, the message in the next, an event's ids as aligned label/value lines under it — evidence: owner, 2026-10-05: the previous pile of unaligned label/value rows was "slop"; references PlanetScale, AWS, Resend.
2. One Copy, in the header row, and what it copies is the same plain text a drag-select would give (`logToText`) — evidence: owner, 2026-10-05: "the logs should look like they're in a text area type situation for the web so that they can be copied easily".
3. On native the control is Share; where neither the clipboard nor the share sheet can work (an insecure web context) there is no control at all — evidence: the terminal pane's standing rule: a dead button explains nothing.
4. A level is never colour alone: a warning or error line says `warn` / `error` in the text and carries a tinted row with a coloured edge; `ok` is a word in green; `info` is plain — evidence: design rule 5.
5. `frame="none"` is the text on whatever surface it sits on; `box` draws the border and header — evidence: owner, 2026-10-06: "I'm not sure about boxes within boxes (ever)"; the flat pane was the pick.
6. Long ids wrap and are never cut off; the box scrolls inside itself past `maxHeight` — evidence: a UUID does not fit a phone column at 12 px mono.
