import * as React from 'react';

import { assignRef } from './assign-ref';

export function mergeRefs<T = any>(...refs: React.ForwardedRef<T>[]) {
	return (node: T | null) => {
		refs.forEach((ref) => assignRef(ref, node));
	};
}

export function useMergedRef<T = unknown>(...refs: React.ForwardedRef<T>[]) {
	const latestRefs = React.useRef(refs);
	const previousRefs = React.useRef<React.ForwardedRef<T>[]>(refs);
	const currentNode = React.useRef<T | null>(null);

	React.useLayoutEffect(() => {
		const prevRefs = previousRefs.current;
		latestRefs.current = refs;
		previousRefs.current = refs;

		if (currentNode.current === null) {
			return;
		}

		for (const ref of prevRefs) {
			if (!refs.includes(ref)) {
				assignRef(ref, null);
			}
		}

		for (const ref of refs) {
			if (!prevRefs.includes(ref)) {
				assignRef(ref, currentNode.current);
			}
		}
	});

	return React.useCallback((node: T | null) => {
		currentNode.current = node;
		latestRefs.current.forEach((ref) => assignRef(ref, node));
	}, []);
}
