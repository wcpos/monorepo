# Behaviour ledger: `edge-surface`

Seeded 2026-10-28 by card 18 of the component-library review. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence.

**Job:** Pad the safe-area insets of the screen edges a surface touches, once.

**Base:** `react-native` View; `useSafeAreaInsets` from `react-native-safe-area-context`.

## Lines

1. A surface names the edges it touches (`edges`) and pads each one's inset inside its own background, so the background runs under the status bar and the home indicator and the content stays inside the safe area (Apple's layout rule) — evidence: owner, iPad landscape, 2026-10-14 (the POS root padded both insets under a grey band; `pos/columns` line 6); test "pads the edges it touches" — platform: iOS and Android.
2. An edge with no inset writes no padding, so the surface's own class padding stands on web, the desktop and a phone without a home indicator — evidence: the sites it replaced (`ListPage`, Support, Reports) each wrote `bottom || undefined`; test "writes no padding for an edge with no inset" — platform: all.
3. Everything inside a surface reads its edges as padded: an inset is padded once however deep the surfaces nest, so a bar inside a column that padded the top pads nothing and needs no opt-out prop (`PageBar insetTop` went); edges the surface does not touch are left to what is inside it (the phone till's tab bar pads the home indicator under a container that pads the status bar) — evidence: card 18; tests "pads an edge once" and "leaves the edges it does not touch" — platform: iOS and Android.
4. `useEdgeInsets` is the same padding as a style, for a surface a View cannot wrap: a scroll view's content (the page scrolls under the home indicator and its last row stops above it), the drawer's panel. The overlays read the window's insets, not this, so a sheet opened from inside a surface still sits on the screen's edges — evidence: card 18; `lib/overlay` reads `useSafeAreaInsets` — platform: all.
