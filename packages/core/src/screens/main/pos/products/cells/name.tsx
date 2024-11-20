import * as React from 'react';

import { decode } from 'html-entities';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { MetaData } from './meta-data';
import { ProductAttributes, PlainAttributes } from '../../../components/product/attributes';
import { ProductCategories } from '../../../components/product/categories';
import GroupedNames from '../../../components/product/grouped-names';
import { ProductTags } from '../../../components/product/tags';
import { StockQuantity } from '../cells/stock-quantity';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const Name = (props: CellContext<{ document: ProductDocument }, 'name'>) => {
	const product = props.row.original.document;
	const { show } = props.column.columnDef.meta;
	const name = useObservableEagerState(product.name$);

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<VStack space="xs" className="w-full">
			<Text className="font-bold">{decode(name)}</Text>
			{show('sku') && <Text className="text-sm">{product.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{show('stock_quantity') && <StockQuantity {...props} className="text-sm" withText />}
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
