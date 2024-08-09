import * as React from 'react';

import find from 'lodash/find';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import StockQuantity from '../../../components/product/stock-quantity';

interface Props {
	item: import('@wcpos/database').ProductVariationDocument;
	column: import('@wcpos/tailwind/src/table').ColumnProps<
		import('@wcpos/database').ProductVariationDocument
	>;
	expandVariations?: () => void;
}

export const ProductVariationName = ({ item: variation, column }: Props) => {
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
			{variation.attributes.map((attr: any) => (
				<Text key={`${attr.name}-${attr.id}`}>
					<Text className="text-secondary-foreground">{`${attr.name}: `}</Text>
					<Text className="font-bold">{attr.option}</Text>
				</Text>
			))}
			{show('sku') && <Text size="small">{variation.sku}</Text>}
			{show('barcode') && <Text size="small">{variation.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity product={variation} size="small" />}
		</VStack>
	);
};
