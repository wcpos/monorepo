import * as React from 'react';

/**
 * Keeps a closed drawer panel off the screen with a LAYOUT prop instead of an animation.
 *
 * `react-native-drawer-layout` never hides the panel: closing it only moves it off-screen
 * with a Reanimated transform, and the panel stays `display: 'flex'` and in the view
 * hierarchy the whole time. That transform is therefore the only thing keeping a closed
 * drawer out of sight.
 *
 * Why that was not enough — the actual mechanism, verified against the Reanimated 4.5.1
 * source and upstream trackers (2026-09-03): on Fabric every animated frame IS committed to
 * the shadow tree, and a commit hook re-applies the animated props from Reanimated's registry
 * on every React commit. A JS-side collector then syncs settled values back into React state
 * and evicts registry entries idle for more than ~2 s. If the JS thread is stalled (a heavy
 * screen mounting) when the close settles, the entry is evicted before React absorbed the
 * closed value, and the next React commit lands React's stale static props — the last state
 * it did absorb, i.e. OPEN. That is software-mansion/react-native-reanimated#9965, fixed by
 * #9527 (shipped in 4.5.3); react-navigation#13186 is the same symptom on the drawer. It is
 * monorepo#1691 — iOS flow 05, the drawer re-appearing ~16 s after the tap with the Orders
 * table rendered behind it, no touch and no drawer action in between — and the Android flow
 * 05 recurrence (run 33725936595, 13 s after the Customers tap). The drawer library's own
 * zIndex FIXME ("Reanimated skips committing to the shadow tree…") dates from RN 0.76 and does
 * not describe Reanimated 4.x; earlier revisions of this comment built on it and were wrong.
 *
 * The repo now runs Reanimated 4.5.5, which carries the fix. This guard stays because it is
 * cheap and independent of that fix: once the drawer has settled closed we hide the panel
 * outright with `display: 'none'`, a plain layout prop React owns, so a closed drawer stays
 * off the screen — and out of the accessibility tree, which is what a closed drawer should be
 * anyway — whatever an animated value does.
 *
 * The hide is honoured by the library's own animated style as well (patch on
 * `react-native-drawer-layout`, `patches/react-native-drawer-layout@4.2.10.patch`), so the
 * registry and React's static prop give the same answer for a settled-closed panel. There is
 * deliberately NO "drop the hide for one commit and re-apply it" path here: an earlier version
 * re-asserted the hide by dropping it whenever the animated progress returned to 0 — i.e.
 * after EVERY close — via `scheduleOnRN` + `setTimeout(0)`, which on a stalled JS thread
 * landed seconds after the close as a commit with no hide and the stale transform above. A
 * cancelled opening swipe is covered by the patch instead: the panel shows while the gesture
 * is active and hides again once fully closed.
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

export function DrawerPanelVisibilityProvider({ children }: { children: React.ReactNode }) {
	// Starts hidden: the drawer boots closed, and an un-hidden closed panel is exactly the
	// state this guard exists to prevent.
	const [hidden, setHidden] = React.useState(true);

	return (
		<SetDrawerPanelHiddenContext.Provider value={setHidden}>
			<DrawerPanelHiddenContext.Provider value={hidden}>
				{children}
			</DrawerPanelHiddenContext.Provider>
		</SetDrawerPanelHiddenContext.Provider>
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
