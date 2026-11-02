# Behaviour ledger: `components/upgrade-notice`

Rehomed 2026-10-17 from `components/header/LEDGER.md` when the legacy drawer header was deleted (design-system decisions 6 and 7). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** The Free plan's dismissable upgrade strip: the app's topmost row on every page, above the rail and under the desktop title bar (Paul, 2026-11-02).

## Lines

1. Choose an upgrade-message index once, but derive its text from the current translator — rerenders must not randomize copy, and language changes must still translate it — evidence: “Pick a random message index once on mount” and “The text itself is derived from `t` so it stays translated.” (`components/upgrade-notice/index.tsx`, then `components/header/upgrade-notice.tsx:15–16`) — platform: all. — rehomed from `components/header` line 22.
2. Single mount in `(drawer)/_layout.tsx`; the six page mounts removed; Products/Customers/Coupons now show it — evidence: Paul 2026-11-02 “right across the top of every page … consistent”.
3. Tone splits on `isLightTheme`: light = Notice band wash (`bg-warning-bg`, `border-warning/45`); dark = solid `bg-warning` with `warning-foreground` ink and the `on-warning` button, because the dark `--warning-bg` is brown — evidence: Paul 2026-11-02 “yellow alert colour”, “for the dark mode … it should stay yellow”.
