/**
 * Default (web) variant: renders nothing and calls no hooks.
 *
 * The settled-closed hide is native-only (see `_layout.tsx`), so the reaction that re-asserts
 * it has nothing to do on web — and calling `useDrawerProgress()` there would be worse than
 * useless, because it throws when it cannot find `DrawerProgressContext`.
 *
 * A platform split (rather than a runtime `Platform.OS` branch or a defensive `useContext`)
 * is used because it is the only shape that keeps web from *bundling* the hook at all, it
 * mirrors how the repo already splits platform behaviour (`use-navigation-background`,
 * `add-printer`), and it leaves `panel-visibility.tsx` free of platform branches. It also
 * means jest — which has no platform-extension resolution — resolves this variant, so the
 * drawer-content test exercises the web path exactly as the browser does.
 */
export function DrawerProgressWatcher() {
	return null;
}
