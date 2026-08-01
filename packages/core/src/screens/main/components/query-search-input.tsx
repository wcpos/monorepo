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
	setSearch,
	ref,
	...props
}: InputProps & {
	committedSearch: string;
	setSearch: (search: string) => void;
}) {
	const [draftSearch, setDraftSearch] = React.useState(committedSearch);
	// Last committed value this input has already accounted for — updated
	// optimistically in handleSearch so the input's own debounced commit echoing
	// back through the store is a no-op instead of resetting the draft.
	const lastCommittedRef = React.useRef(committedSearch);
	const commitSearch = React.useMemo(() => debounce(setSearch, 250), [setSearch]);

	React.useEffect(() => () => commitSearch.cancel(), [commitSearch]);

	// Adopt committed changes that originate outside this input (e.g. programmatic
	// setSearch); a pending draft commit would be stale, so cancel it.
	React.useEffect(() => {
		if (committedSearch !== lastCommittedRef.current) {
			commitSearch.cancel();
			lastCommittedRef.current = committedSearch;
			setDraftSearch(committedSearch);
		}
	}, [committedSearch, commitSearch]);

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

	// Keyed on the nonce only: explicit resets (clearSearch) remount the input so
	// the draft drops and any pending commit cancels, but the input's own debounced
	// commits must not remount it — that would drop focus on every commit (#904).
	return (
		<DebouncedSearchInput
			key={searchResetNonce}
			ref={ref}
			committedSearch={committedSearch}
			setSearch={setSearch}
			{...props}
		/>
	);
}
