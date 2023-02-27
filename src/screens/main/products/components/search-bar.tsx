import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Pill from '@wcpos/components/src/pill';
import TextInput from '@wcpos/components/src/textinput';
import { useDetectBarcode } from '@wcpos/hooks/src/use-hotkeys';

import { t } from '../../../../lib/translations';
import useProducts from '../../contexts/products';

const SearchBar = () => {
	const { query$, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	useDetectBarcode((barcode) => {
		setQuery('barcode', barcode);
	});

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search: string) => {
			setQuery('search', search);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const filters = React.useMemo(() => {
		const categoryID = get(query, ['selector', 'categories', '$elemMatch', 'id']);
		if (categoryID) {
			return (
				<Box paddingLeft="small">
					<Pill
						removable
						onRemove={() => setQuery('selector.categories', null)}
					>{`Cat ${categoryID}`}</Pill>
				</Box>
			);
		}

		const barcode = get(query, ['barcode']);
		if (barcode) {
			return (
				<Box paddingLeft="small">
					<Pill removable onRemove={() => setQuery('barcode', null)}>{`Barcode ${barcode}`}</Pill>
					{/* <Pill removable onRemove={() => setQuery('barcode', null)}>
						<Icon name="barcode" /> {barcode}
					</Pill> */}
				</Box>
			);
		}
	}, [query, setQuery]);

	/**
	 *
	 */
	return (
		<TextInput
			placeholder={t('Search Products', { _tags: 'core' })}
			value={query.search}
			onChangeText={onSearch}
			leftAccessory={filters}
			containerStyle={{ flex: 1 }}
			clearable
		/>
	);
};

export default SearchBar;
