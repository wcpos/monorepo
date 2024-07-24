import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { MetaData } from './meta-data';
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
		<VStack space="xs">
			<Text className="font-bold">{name}</Text>
			{show('sku') && <Text className="text-small">{product.sku}</Text>}
			{show('barcode') && <Text className="text-small">{product.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity product={product} size="small" />}
			{show('meta_data') && <MetaData product={product} />}
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
		</VStack>
	);
};
