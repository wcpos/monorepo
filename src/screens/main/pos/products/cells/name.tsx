import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

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
export const Name = ({ row, column }: CellContext<ProductDocument, 'name'>) => {
	const product = row.original;
	const name = useObservableEagerState(product.name$);

	/**
	 *
	 */

	return (
		<VStack space="xs">
			<Text className="font-bold">{name}</Text>
			{column.columnDef.meta.show('sku') && <Text className="text-small">{product.sku}</Text>}
			{column.columnDef.meta.show('barcode') && (
				<Text className="text-small">{product.barcode}</Text>
			)}
			{column.columnDef.meta.show('stock_quantity') && (
				<StockQuantity product={product} size="small" />
			)}
			{column.columnDef.meta.show('meta_data') && <MetaData product={product} />}
			{column.columnDef.meta.show('categories') && <ProductCategories row={row} />}
			{column.columnDef.meta.show('tags') && <ProductTags row={row} />}
			{column.columnDef.meta.show('attributes') && <PlainAttributes product={product} />}

			{product.type === 'variable' && (
				<ProductAttributes
					product={product}
					// variationQuery={variationQuery}
					// setVariationQuery={setVariationQuery}
				/>
			)}

			{product.type === 'grouped' && <GroupedNames parent={product} />}
		</VStack>
	);
};
