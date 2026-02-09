import * as React from 'react';

/**
 *
 */
export const lazyWithDelay = (
	importFn: () => Promise<{ default: React.ComponentType<any> }>,
	delay: number
) => {
	return React.lazy(
		() =>
			new Promise<{ default: React.ComponentType<any> }>((resolve) =>
				setTimeout(() => importFn().then(resolve), delay)
			)
	);
};
