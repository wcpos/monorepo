import * as React from 'react';

import { assignRef } from './assign-ref';

type Ref<T> = React.Dispatch<React.SetStateAction<T>> | React.ForwardedRef<T>;

export function mergeRefs<T = any>(...refs: Ref<T>[]) {
	return (node: T | null) => {
		refs.forEach((ref) => assignRef(ref, node));
	};
}

export function useMergedRef<T = any>(...refs: Ref<T>[]) {
	return mergeRefs(...refs);
}
