import * as React from 'react';

/** React.lazy caches rejected imports forever; Expo retries a fresh chunk import. */

export function retryableLazy<T extends React.ComponentType<any>>(
	load: () => Promise<{ default: T }>
): T {
	let Lazy = create();

	function create(): React.LazyExoticComponent<T> {
		return React.lazy(() =>
			load().catch((error) => {
				Lazy = create();
				throw error;
			})
		);
	}

	function RetryableLazy(props: React.ComponentProps<T>) {
		return React.createElement(Lazy, props);
	}

	return RetryableLazy as unknown as T;
}
