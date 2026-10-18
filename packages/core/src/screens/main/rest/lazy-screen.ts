import * as React from 'react';

// Use the alias so route tests can mock the same module name.
import { loadRest } from '@wcpos/core/screens/main/rest/lazy';

type Rest = Awaited<ReturnType<typeof loadRest>>;

/** React.lazy caches rejected imports forever; Expo retries a fresh chunk import. */
export function lazyRest<P extends object>(
	pick: (rest: Rest) => React.ComponentType<P>
): React.ComponentType<P> {
	let Screen = createScreen();

	function createScreen(): React.LazyExoticComponent<React.ComponentType<P>> {
		return React.lazy(() =>
			loadRest()
				.then((rest) => ({ default: pick(rest) }))
				.catch((error) => {
					Screen = createScreen();
					throw error;
				})
		);
	}

	function RestScreen(props: P) {
		return React.createElement(Screen, props);
	}

	return RestScreen;
}
