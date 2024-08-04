import * as React from 'react';

import { useSubscription } from 'observable-hooks';

import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection, useBarcodeSearch } from '../../hooks/barcodes';
import { useCollection } from '../../hooks/use-collection';
import { SearchInput } from '../search-input';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 * Barcode Pill
 */
// const BarcodePill = () => {
// 	const barcode = get(query, ['selector', 'barcode']);

// 	return (
// 		<Pill
// 			key="barcode"
// 			removable
// 			onRemove={() => setQuery('selector.barcode', null)}
// 			icon="barcode"
// 		>
// 			{barcode}
// 		</Pill>
// 	);
// };

/**
 * Search field
 */
const ProductSearch = ({ query }) => {
	const [search, setSearch] = React.useState('');
	const t = useT();

	/**
	 *
	 */
	const onSearch = React.useCallback(
		(search) => {
			setSearch(search);
			query.debouncedSearch(search);
		},
		[query]
	);

	/**
	 * Hack: If I set the search directly on the query, I need to update the state
	 */
	useSubscription(query.params$, (params) => {
		setSearch(params.search);
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
	return (
		<SearchInput
			placeholder={t('Search Products', { _tags: 'core' })}
			value={search}
			onSearch={onSearch}
		/>
	);
};

export default ProductSearch;
