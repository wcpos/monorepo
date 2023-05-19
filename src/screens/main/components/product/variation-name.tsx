import * as React from 'react';
import { View } from 'react-native';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import StockQuantity from './stock-quantity';

interface Props {
	item: import('@wcpos/database').ProductVariationDocument;
	column: import('@wcpos/components/src/table').ColumnProps<
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
		<Box space="xSmall" style={{ width: '100%' }}>
			<View>
				{variation.attributes.map((attr: any) => (
					<Text key={`${attr.name}-${attr.id}`}>
						<Text type="secondary">{`${attr.name}: `}</Text>
						<Text weight="bold">{attr.option}</Text>
					</Text>
				))}
			</View>
			{show('sku') && <Text size="small">{variation.sku}</Text>}
			{show('stock_quantity') && <StockQuantity product={variation} size="small" />}
		</Box>
	);
};
