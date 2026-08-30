import { useDrawerProgress } from 'expo-router/build/react-navigation/drawer';
import { useAnimatedReaction } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useReassertDrawerPanelHidden } from './panel-visibility';

/**
 * Watches the drawer panel's animated progress and re-asserts the settled-closed hide when it
 * returns to 0 — the cancelled-opening-swipe case, which springs back closed without any
 * navigation state change and so re-renders nothing (see `panel-visibility.tsx`).
 *
 * This MUST be a rendered element, not a hook called from `DrawerContent`'s body.
 * `DrawerView.renderDrawerContent` invokes `drawerContent({ state, navigation, descriptors })`
 * as a plain function, and `react-native-drawer-layout`'s `Drawer` calls `renderDrawerContent()`
 * inside its own render — so anything in `DrawerContent`'s body runs at `Drawer`'s position in
 * the tree, ABOVE the `DrawerProgressContext.Provider` that `Drawer` itself renders, and
 * `useDrawerProgress()` throws "Couldn't find a drawer" on every platform (#1691 follow-up).
 * As an element it renders where `renderDrawerContent()`'s output is mounted, which is inside
 * that provider.
 */
export function DrawerProgressWatcher() {
	const progress = useDrawerProgress();
	const reassert = useReassertDrawerPanelHidden();

	useAnimatedReaction(
		() => progress.value,
		(value, previous) => {
			if (previous !== null && previous !== value && value === 0) {
				scheduleOnRN(reassert);
			}
		},
		[reassert]
	);

	return null;
}
