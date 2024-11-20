import * as React from 'react';

import { useAugmentedRef } from '@rn-primitives/hooks';
import { useSubscription } from 'observable-hooks';

import { Input } from '@wcpos/components/src/input';
import type { InputProps } from '@wcpos/components/src/input';
import type { Query } from '@wcpos/query';

interface Props extends InputProps {
	query: Query<any>;
}

/**
 *
 */
export const QuerySearchInput = React.forwardRef<React.ElementRef<typeof Input>, Props>(
	({ query, ...props }, ref) => {
		const [search, setSearch] = React.useState('');

		/**
		 * If barcode detection is enabled, we need to augment the ref to include a setSearch method.
		 */
		const augmentedRef = useAugmentedRef({
			ref,
			methods: {
				setSearch: (search: string) => setSearch(search),
				onSearch: (search: string) => onSearch(search),
			},
			deps: [],
		});

		/**
		 * Hack: I need to clear the search field when the collection is reset
		 */
		useSubscription(query.cancel$, () => {
			setSearch('');
		});

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
		 *
		 */
		return <Input ref={augmentedRef} value={search} onChangeText={onSearch} clearable {...props} />;
	}
);
