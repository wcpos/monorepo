import * as React from 'react';

/** React.lazy caches rejected imports forever; Expo retries a fresh chunk import. */

export function retryableLazy<P extends object>(
	load: () => Promise<{ default: React.ComponentType<P> }>
): React.ComponentType<P> {
	let Lazy = create();

	function create(): React.LazyExoticComponent<React.ComponentType<P>> {
		return React.lazy(() =>
			load().catch((error) => {
				Lazy = create();
				throw error;
			})
		);
	}

	function RetryableLazy(props: P) {
		return React.createElement(Lazy, props);
	}

	return RetryableLazy;
}
