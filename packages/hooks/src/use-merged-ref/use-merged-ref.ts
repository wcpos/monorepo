import * as React from 'react';

import { assignRef } from './assign-ref';

export function mergeRefs<T = any>(...refs: React.ForwardedRef<T>[]) {
	return (node: T | null) => {
		refs.forEach((ref) => assignRef(ref, node));
	};
}

export function useMergedRef<T = any>(...refs: React.ForwardedRef<T>[]) {
	const latestRefs = React.useRef(refs);

	// Keep the stored refs current at commit time instead of during render, so
	// the ref is never written while rendering (react-hooks/refs). Reading the
	// updated value happens later in the callback ref, also at commit time.
	React.useEffect(() => {
		latestRefs.current = refs;
	});

	// A callback ref runs at commit time (not during render), so reading
	// latestRefs.current here is safe. Keeping a single stable callback preserves
	// the ref-merge behavior across renders.
	return React.useCallback((node: T | null) => {
		latestRefs.current.forEach((ref) => assignRef(ref, node));
	}, []);
}
