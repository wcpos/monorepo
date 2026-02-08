import * as React from 'react';

import { assignRef } from './assign-ref';

export function mergeRefs<T = any>(...refs: React.ForwardedRef<T>[]) {
	return (node: T | null) => {
		refs.forEach((ref) => assignRef(ref, node));
	};
}

export function useMergedRef<T = any>(...refs: React.ForwardedRef<T>[]) {
	const stableRefs = React.useRef(refs);
	stableRefs.current = refs;

	return React.useMemo(
		() => (node: T | null) => {
			stableRefs.current.forEach((ref) => assignRef(ref, node));
		},
		[stableRefs]
	);
}
