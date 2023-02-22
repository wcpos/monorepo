import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import Categories from '../../../components/product/categories';
import StockQuantity from '../../../components/product/stock-quantity';
import Tags from '../../../components/product/tags';

interface Props {
	item: import('@wcpos/database').ProductDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
		import('@wcpos/database').ProductDocument
	>;
}

export const Name = ({ item: product, column }: Props) => {
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
		<Box space="xSmall">
			<Text weight="bold">{product.name}</Text>
			{show('sku') && <Text size="small">{product.sku}</Text>}
			{show('stock_quantity') && <StockQuantity product={product} size="small" />}
			{show('categories') && <Categories item={product} />}
			{show('tags') && <Tags item={product} />}

			{product.type === 'variable' && (
				<View>
					{product.attributes
						.filter((attr: any) => attr.variation)
						.map((attr: any) => (
							<Text key={`${attr.name}-${attr.id}`}>
								<Text size="small" type="secondary">{`${attr.name}: `}</Text>
								<Text size="small">{attr.options.join(', ')}</Text>
							</Text>
						))}
				</View>
			)}
		</Box>
	);
};
