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
	const commitSearch = React.useMemo(() => debounce(setSearch, 250), [setSearch]);

	React.useEffect(() => () => commitSearch.cancel(), [commitSearch]);

	const handleSearch = React.useCallback(
		(search: string) => {
			setDraftSearch(search);
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

	return (
		<DebouncedSearchInput
			key={`${committedSearch}:${searchResetNonce}`}
			ref={ref}
			committedSearch={committedSearch}
			setSearch={setSearch}
			{...props}
		/>
	);
}
