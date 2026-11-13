import * as React from 'react';

import debounce from 'lodash/debounce';

import { Input } from '@wcpos/components/input';
import type { InputProps } from '@wcpos/components/input';

import { useQueryState, useQueryStateActions, useSearchResetNonce } from '../../../query';

import type { CollectionKey } from '../../../query';

// PROBE (throwaway branch e2e-probe/tablet-07-search-repro, never merged).
let probeSeq = 0;
const probe = (o: Record<string, unknown>) => {
	if (process.env.EXPO_PUBLIC_WCPOS_E2E === '1')
		console.warn('WCPOS_E2E_SEARCH ' + JSON.stringify({ t: Date.now(), ...o }));
};

interface Props<C extends CollectionKey> extends InputProps {
	collectionName: C;
}

function DebouncedSearchInput({
	committedSearch,
	searchResetNonce,
	setSearch,
	ref,
	...props
}: InputProps & {
	committedSearch: string;
	searchResetNonce: number;
	setSearch: (search: string) => void;
}) {
	const [draftSearch, setDraftSearch] = React.useState(committedSearch);
	// Last committed value this input has already accounted for — updated
	// optimistically in handleSearch so the input's own debounced commit echoing
	// back through the store is a no-op instead of resetting the draft.
	const lastCommittedRef = React.useRef(committedSearch);
	const lastResetRef = React.useRef(searchResetNonce);
	const idRef = React.useRef(++probeSeq);
	const draftRef = React.useRef(draftSearch);
	draftRef.current = draftSearch;
	React.useEffect(() => {
		probe({ ev: 'mount', id: idRef.current, committedSearch, searchResetNonce });
		return () => probe({ ev: 'unmount', id: idRef.current });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	const commitSearch = React.useMemo(() => debounce((v: string) => {
		probe({ ev: 'commit', id: idRef.current, v });
		setSearch(v);
	}, 250), [setSearch]);

	React.useEffect(() => () => commitSearch.cancel(), [commitSearch]);

	// Synchronize external searches/resets before paint, without remounting the input.
	// A pending draft commit would overwrite the external value, so cancel it.
	React.useLayoutEffect(() => {
		if (committedSearch !== lastCommittedRef.current || searchResetNonce !== lastResetRef.current) {
			probe({ ev: 'reset', id: idRef.current, committedSearch, searchResetNonce, lastCommitted: lastCommittedRef.current, lastReset: lastResetRef.current, draftWas: draftRef.current });
			commitSearch.cancel();
			lastResetRef.current = searchResetNonce;
			lastCommittedRef.current = committedSearch;
			setDraftSearch(committedSearch);
		}
	}, [committedSearch, commitSearch, searchResetNonce]);

	const handleSearch = React.useCallback(
		(search: string) => {
			probe({ ev: 'change', id: idRef.current, v: search, draftWas: draftRef.current });
			setDraftSearch(search);
			lastCommittedRef.current = search;
			commitSearch(search);
		},
		[commitSearch]
	);

	return (
		<Input
			ref={ref}
			value={draftSearch}
			onChangeText={handleSearch}
			onFocus={() => probe({ ev: 'focus', id: idRef.current })}
			onBlur={() => probe({ ev: 'blur', id: idRef.current })}
			clearable
			leftIcon="search"
			{...props}
		/>
	);
}

export function QuerySearchInput<C extends CollectionKey>({
	collectionName,
	ref,
	...props
}: Props<C>) {
	const committedSearch = useQueryState<typeof collectionName, string>((state) => state.search);
	const searchResetNonce = useSearchResetNonce();
	const { setSearch } = useQueryStateActions<typeof collectionName>();

	// Reset the draft in place: replacing the input node loses focus and queued keys.
	return (
		<DebouncedSearchInput
			searchResetNonce={searchResetNonce}
			ref={ref}
			committedSearch={committedSearch}
			setSearch={setSearch}
			{...props}
		/>
	);
}
