import * as React from 'react';
import { TextInput as RNTextInput } from 'react-native';

import { useComposedRefs } from '@rn-primitives/hooks';
import debounce from 'lodash/debounce';
import { useSubscription } from 'observable-hooks';

import { Input } from '@wcpos/components/input';
import type { InputProps } from '@wcpos/components/input';
import type { Query } from '@wcpos/query';

import { useQueryState, useQueryStateActions, useSearchResetNonce } from '../../../query';

import type { CollectionKey } from '../../../query';

interface LegacyProps extends InputProps {
	query: Query<any>;
	collectionName?: never;
}

interface BindingProps<C extends CollectionKey> extends InputProps {
	query?: never;
	collectionName: C;
}

type Props<C extends CollectionKey> = LegacyProps | BindingProps<C>;

function isBindingProps<C extends CollectionKey>(props: Props<C>): props is BindingProps<C> {
	return props.collectionName !== undefined;
}

function LegacyQuerySearchInput({ query, ref, ...props }: LegacyProps) {
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
		Object.assign(localRef.current ?? ({} as RNTextInput), {
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

function BindingQuerySearchInput<C extends CollectionKey>({
	collectionName,
	ref,
	...props
}: BindingProps<C>) {
	const committedSearch = useQueryState<typeof collectionName, string>((state) => state.search);
	const searchResetNonce = useSearchResetNonce();
	const { setSearch } = useQueryStateActions<typeof collectionName>();

	return (
		<DebouncedBindingSearchInput
			key={`${committedSearch}:${searchResetNonce}`}
			ref={ref}
			committedSearch={committedSearch}
			setSearch={setSearch}
			{...props}
		/>
	);
}

function DebouncedBindingSearchInput({
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

	React.useEffect(() => {
		// The keyed draft is replaced by committed query-state changes; cancel its queued commit
		// when that replacement or an unmount disposes this local keystroke layer.
		return () => commitSearch.cancel();
	}, [commitSearch]);

	const handleSearch = React.useCallback(
		(search: string) => {
			setDraftSearch(search);
			commitSearch(search);
		},
		[commitSearch]
	);

	return <Input ref={ref} value={draftSearch} onChangeText={handleSearch} clearable {...props} />;
}

/**
 * Search input for legacy Query consumers and query-state collection bindings.
 */
export function QuerySearchInput<C extends CollectionKey>(props: Props<C>) {
	return isBindingProps(props) ? (
		<BindingQuerySearchInput {...props} />
	) : (
		<LegacyQuerySearchInput {...props} />
	);
}
