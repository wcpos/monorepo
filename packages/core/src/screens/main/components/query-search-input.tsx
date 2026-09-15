import * as React from 'react';

import debounce from 'lodash/debounce';

import { Input } from '@wcpos/components/input';
import type { InputProps } from '@wcpos/components/input';

import { useQueryState, useQueryStateActions, useSearchResetNonce } from '../../../query';

import type { CollectionKey } from '../../../query';

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
	const commitSearch = React.useMemo(() => debounce(setSearch, 250), [setSearch]);

	React.useEffect(() => () => commitSearch.cancel(), [commitSearch]);

	// Synchronize external searches/resets before paint, without remounting the input.
	// A pending draft commit would overwrite the external value, so cancel it.
	React.useLayoutEffect(() => {
		if (committedSearch !== lastCommittedRef.current || searchResetNonce !== lastResetRef.current) {
			commitSearch.cancel();
			lastResetRef.current = searchResetNonce;
			lastCommittedRef.current = committedSearch;
			setDraftSearch(committedSearch);
		}
	}, [committedSearch, commitSearch, searchResetNonce]);

	const handleSearch = React.useCallback(
		(search: string) => {
			setDraftSearch(search);
			lastCommittedRef.current = search;
			commitSearch(search);
		},
		[commitSearch]
	);

	return <Input ref={ref} value={draftSearch} onChangeText={handleSearch} clearable {...props} />;
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
