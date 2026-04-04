import * as React from 'react';

import { useComposedRefs } from '@rn-primitives/hooks';
import { useSubscription } from 'observable-hooks';

import { Input } from '@wcpos/components/input';
import type { InputProps } from '@wcpos/components/input';
import type { Query } from '@wcpos/query';

interface Props extends InputProps {
	query: Query<any>;
	// ref?: React.RefObject<unknown>;
}

/**
 *
 */
export function QuerySearchInput({ query, ref, ...props }: Props) {
	const [search, setSearch] = React.useState('');
	const localRef = React.useRef(null);
	const composedRef = useComposedRefs(ref, localRef);

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 * If barcode detection is enabled, we need to augment the ref to include a setSearch method.
	 */
	React.useImperativeHandle(ref, () =>
		Object.assign(localRef.current ?? {}, {
			setSearch: (search: string) => setSearch(search),
			onSearch: (search: string) => onSearch(search),
		})
	);

	/**
	 * Hack: I need to clear the search field when the collection is reset
	 */
	useSubscription(query.cancel$, () => {
		setSearch('');
	});

	/**
	 *
	 */
	return <Input ref={composedRef} value={search} onChangeText={onSearch} clearable {...props} />;
}
