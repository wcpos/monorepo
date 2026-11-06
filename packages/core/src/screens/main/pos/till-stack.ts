import type {
	EventArg,
	NavigationProp,
	NavigationState,
	ParamListBase,
} from 'expo-router/react-navigation';

/** A (pos) sheet: checkout, receipt, add-misc-product. Everything else in the (pos) stack is a till. */
export const isPosSheetRoute = (name: string) => name.startsWith('(modals)/');

/**
 * Keeps the newest till and every sheet above it. Older tills and the sheets beneath
 * the newest till belonged to the abandoned session; null means there is nothing to settle.
 */
export function settleTillStack<R extends { name: string }>(routes: readonly R[]): R[] | null {
	let newestTill = -1;
	routes.forEach((route, index) => {
		if (!isPosSheetRoute(route.name)) newestTill = index;
	});
	if (newestTill <= 0) return null;
	return routes.slice(newestTill);
}

/** Resets the (pos) stack whenever a second till appears, preserving the survivor's identity. */
export function tillStackScreenListeners({
	navigation,
}: {
	navigation: Pick<NavigationProp<ParamListBase>, 'reset'>;
}) {
	return {
		state: (event: EventArg<'state', false, { state: NavigationState }>) => {
			const settled = settleTillStack(event.data.state.routes);
			// The router requires a complete reset state; retain its identity and key sequence.
			if (settled)
				navigation.reset({ ...event.data.state, index: settled.length - 1, routes: settled });
		},
	};
}
