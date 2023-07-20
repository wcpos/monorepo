import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../../lib/translations';
import Attributes from '../../../components/product/attributes';
import Categories from '../../../components/product/categories';
import GroupedNames from '../../../components/product/grouped-names';
import StockQuantity from '../../../components/product/stock-quantity';
import Tags from '../../../components/product/tags';
import { ProductsProvider } from '../../../contexts/products';
import { useUISettings } from '../../../contexts/ui-settings/use-ui-settings';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
	expandVariations?: () => void;
}

export const Name = ({ item: product, column, variationQuery, setVariationQuery }: Props) => {
	const name = useObservableState(product.name$, product.name);
	const grouped = useObservableState(product.grouped_products$, product.grouped_products);
	const groupedQuery = React.useMemo(() => ({ selector: { id: { $in: grouped } } }), [grouped]);
	const { uiSettings } = useUISettings('products');
	const { display } = column;

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */

	return (
		<Box space="xSmall" style={{ width: '100%' }}>
			<Text weight="bold">{name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{show('stock_quantity') && <StockQuantity product={product} size="small" />}
			{show('categories') && <Categories item={product} />}
			{show('tags') && <Tags item={product} />}

			{product.type === 'variable' && (
				<Attributes
					product={product}
					variationQuery={variationQuery}
					setVariationQuery={setVariationQuery}
				/>
			)}

			{product.type === 'grouped' && (
				<ProductsProvider initialQuery={groupedQuery} uiSettings={uiSettings}>
					<GroupedNames />
				</ProductsProvider>
			)}
		</Box>
	);
};
