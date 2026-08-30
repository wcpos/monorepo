import * as React from 'react';

/**
 * Keeps a closed drawer panel off the screen with a LAYOUT prop instead of an animation.
 *
 * `react-native-drawer-layout` never hides the panel: closing it only moves it off-screen
 * with a Reanimated transform, and the panel stays `display: 'flex'` and in the view
 * hierarchy the whole time. That transform is therefore the only thing keeping a closed
 * drawer out of sight — and the library itself documents that the transform is not what the
 * shadow tree holds (`Drawer.native.js` animates `zIndex` purely to "force the commit",
 * because "Reanimated skips committing to the shadow tree if no layout props are animated").
 * `zIndex` only changes as the drawer leaves/reaches the fully-open position, so for the rest
 * of a close the committed position stays near "open" while the on-screen view is moved
 * directly.
 *
 * That is fine while the animation is still producing frames — the next frame re-asserts the
 * real position. It stops being fine when the tap that closes the drawer also mounts an
 * expensive screen: once the close spring has settled, nothing re-asserts anything, and a
 * later React commit (the heavy screen finally landing) renders the panel back at the stale
 * position with the app already on the new route. That is monorepo#1691 — iOS flow 05, where
 * the drawer re-appears ~16 s after the tap with the Orders table rendered behind it, with no
 * touch and no drawer action in between (the tablet variant of the same run ends up stuck
 * part-way open, with the dim overlay at the matching partial opacity — a position no drawer
 * action can produce, since actions only ever spring to the two endpoints).
 *
 * So once the drawer has settled closed we hide the panel outright. `display: 'none'` is a
 * plain layout prop React owns; the transform can then be as stale as it likes and a closed
 * drawer still stays off the screen — and out of the accessibility tree, which is what a
 * closed drawer should be anyway.
 *
 * Note we cannot use the navigator's own `transitionEnd` event for this: the drawer emits it
 * with `target: state.key` (the navigator, not a route), and `useNavigationBuilder`'s emitter
 * bails out (`if (route == null) return`) for a target that matches no route, so neither
 * screen listeners nor `screenListeners` ever see it.
 */

/**
 * How long after the drawer's state says "closed" the panel is hidden.
 *
 * The close animation is `withSpring` with stiffness 1000 / damping 500 / mass 3, i.e.
 * zeta = 500 / (2 * sqrt(1000 * 3)) > 1, which Reanimated runs as critically damped with
 * omega0 = sqrt(1000 / 3) ≈ 18.3 rad/s. From a 200dp offset that is under a tenth of a dp
 * after ~0.5 s, so this leaves roughly double the animation's own settling time before the
 * panel is taken out of layout.
 */
export const DRAWER_CLOSE_SETTLE_MS = 1000;

export type DrawerPanelStatus = 'open' | 'closed';

/**
 * `false` (i.e. "visible") is the default so a tree without the provider behaves exactly as
 * it did before: nothing is ever hidden.
 */
const DrawerPanelHiddenContext = React.createContext(false);
const SetDrawerPanelHiddenContext = React.createContext<(hidden: boolean) => void>(() => {});
const ReassertDrawerPanelHiddenContext = React.createContext<() => void>(() => {});

export function DrawerPanelVisibilityProvider({ children }: { children: React.ReactNode }) {
	// Starts hidden: the drawer boots closed, and an un-hidden closed panel is exactly the
	// state this guard exists to prevent.
	const [hidden, setHidden] = React.useState(true);
	const [reassertsRequested, setReassertsRequested] = React.useState(0);
	const [reassertsServed, setReassertsServed] = React.useState(0);

	/**
	 * A swipe that starts opening a hidden drawer and is released below the opening threshold
	 * leaves `react-native-drawer-layout`'s own `display: 'flex'` written straight onto the panel
	 * by Reanimated, and springs back closed WITHOUT a navigation state change — so nothing
	 * re-renders and our `display: 'none'` is never re-applied. The guard would silently disarm.
	 *
	 * Re-asserting has to be a real prop change or the renderer diffs it away, so drop the hide
	 * for exactly one commit and put it straight back. The panel is at its closed transform by
	 * then, so the dropped frame shows nothing. A drawer that is already open is unaffected —
	 * the published value is `false` either way.
	 */
	const reassert = React.useCallback(() => {
		setReassertsRequested((requested) => requested + 1);
	}, []);

	const dropping = reassertsRequested !== reassertsServed;

	React.useEffect(() => {
		if (!dropping) return;
		// Deferred rather than set straight away: the drop has to land as its own commit, or
		// React batches it away with the restore and the renderer sees no change at all.
		const restore = setTimeout(() => setReassertsServed(reassertsRequested), 0);
		return () => clearTimeout(restore);
	}, [dropping, reassertsRequested]);

	return (
		<ReassertDrawerPanelHiddenContext.Provider value={reassert}>
			<SetDrawerPanelHiddenContext.Provider value={setHidden}>
				<DrawerPanelHiddenContext.Provider value={hidden && !dropping}>
					{children}
				</DrawerPanelHiddenContext.Provider>
			</SetDrawerPanelHiddenContext.Provider>
		</ReassertDrawerPanelHiddenContext.Provider>
	);
}

/**
 * Read by the drawer layout, which owns `drawerStyle`. True once the drawer has settled
 * closed.
 */
export function useDrawerPanelHidden(): boolean {
	return React.useContext(DrawerPanelHiddenContext);
}

/**
 * Re-applies `display: 'none'` to a panel that is already meant to be hidden. Called when the
 * drawer's animated progress returns to 0 without the navigation state having changed — see the
 * cancelled-swipe note on `reassert` above.
 */
export function useReassertDrawerPanelHidden(): () => void {
	return React.useContext(ReassertDrawerPanelHiddenContext);
}

/**
 * Rendered inside the drawer panel (it needs the navigator's state), reports upward.
 * Renders nothing.
 */
export function DrawerPanelVisibilityReporter({ status }: { status: DrawerPanelStatus }) {
	const setHidden = React.useContext(SetDrawerPanelHiddenContext);

	React.useEffect(() => {
		if (status === 'open') {
			// Un-hide immediately: the open animation has to have something to slide in.
			setHidden(false);
			return;
		}

		const timeout = setTimeout(() => setHidden(true), DRAWER_CLOSE_SETTLE_MS);
		return () => clearTimeout(timeout);
	}, [setHidden, status]);

	return null;
}
