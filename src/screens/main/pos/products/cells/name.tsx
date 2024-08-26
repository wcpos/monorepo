import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { MetaData } from './meta-data';
import { ProductAttributes, PlainAttributes } from '../../../components/product/attributes';
import { ProductCategories } from '../../../components/product/categories';
import GroupedNames from '../../../components/product/grouped-names';
import StockQuantity from '../../../components/product/stock-quantity';
import { ProductTags } from '../../../components/product/tags';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Name = (props: CellContext<ProductDocument, 'name'>) => {
	const product = props.row.original;
	const show = props.column.columnDef.meta.show;
	const name = useObservableEagerState(product.name$);

	/**
	 *
	 */

	return (
		<VStack space="xs">
			<Text className="font-bold">{name}</Text>
			{show('sku') && <Text className="text-small">{product.sku}</Text>}
			{show('barcode') && <Text className="text-small">{product.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity {...props} className="text-sm" />}
			{show('meta_data') && <MetaData product={product} />}
			{show('categories') && <ProductCategories {...props} />}
			{show('tags') && <ProductTags {...props} />}
			{show('attributes') && <PlainAttributes {...props} />}

			{product.type === 'variable' && (
				<ProductAttributes
					{...props}
					// variationQuery={variationQuery}
					// setVariationQuery={setVariationQuery}
				/>
			)}

			{product.type === 'grouped' && <GroupedNames {...props} />}
		</VStack>
	);
};
