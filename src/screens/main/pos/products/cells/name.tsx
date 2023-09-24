import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import Attributes, { PlainAttributes } from '../../../components/product/attributes';
import Categories from '../../../components/product/categories';
import GroupedNames from '../../../components/product/grouped-names';
import StockQuantity from '../../../components/product/stock-quantity';
import Tags from '../../../components/product/tags';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const Name = ({ item: product, column }: Props) => {
	const name = useObservableState(product.name$, product.name);
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
			{show('barcode') && <Text size="small">{product.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity product={product} size="small" />}
			{show('categories') && <Categories item={product} />}
			{show('tags') && <Tags item={product} />}
			{show('attributes') && <PlainAttributes product={product} />}

			{product.type === 'variable' && (
				<Attributes
					product={product}
					// variationQuery={variationQuery}
					// setVariationQuery={setVariationQuery}
				/>
			)}

			{product.type === 'grouped' && <GroupedNames parent={product} />}
		</Box>
	);
};
