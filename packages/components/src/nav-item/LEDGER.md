# Behaviour ledger: `nav-item`

Seeded 2026-10-17 by design-system decision 8 (ruling `ruling-design-system-decisions-2026-10-16`, board `design-system-gallery-2026-10-16.html` §5). Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** One navigation row: an area's page list (Settings, Store health), the front drawer's items and its notifications bell.

**Base:** `pressable-surface`, Icon, Text.

## Lines

1. A selected row lifts onto `bg-card`, the surface the content sits on; a press, and a hover on a fine pointer only, show the same lift; the label and icon are muted at rest and foreground when selected — evidence: `navigation-area/index.tsx` the lifted branch (2026-10-16); design-system decision 8.
2. Two sizes: `row` (40, `rounded-md`, `text-sm`) for an area's page list, `drawer` (48, `rounded-lg`) for the drawer, where the selected icon and label are `text-primary` and the rest `text-sidebar-foreground` — evidence: design-system decision 8; the drawer's `drawerIcon` colours in `apps/main/app/(app)/(drawer)/_layout.tsx`.
3. Retired 2026-10-16: the drawer's 4 px left border on the selected item, its `bg-white/10` tinted hover and press, and a `default` Button forced transparent to draw a drawer row; the card-surface rows' `bg-primary/10` tint went with the last area that sat on `card` — evidence: design-system decision 8.
4. The item renders on `pressable-surface` with the `card` wash (line 1's lift) and is always a `button`; `selected` is announced through the surface (`aria-selected`, which React Native maps onto the selected state), so the caller's `accessibilityState` is no longer merged by hand; it now gives the native press haptic — evidence: card 4 of the 2026-10-28 component-library review.
