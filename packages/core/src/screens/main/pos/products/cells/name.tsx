import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { MetaData } from './meta-data';
import { PlainAttributes, ProductAttributes } from '../../../components/product/attributes';
import { ProductCategories } from '../../../components/product/categories';
import GroupedNames from '../../../components/product/grouped-names';
import { ProductTags } from '../../../components/product/tags';
import { StockQuantity } from '../cells/stock-quantity';
import { ProductBrands } from '../../../components/product/brands';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function Name(props: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = props.row.original.document;
	const meta = props.column.columnDef.meta;
	const show = meta?.show ?? (() => false);
	const name = useObservableEagerState(product.name$!);

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<VStack space="xs" className="w-full">
			<Text className="font-bold" decodeHtml>
				{name}
			</Text>
			{show('sku') && <Text className="text-sm">{product.sku}</Text>}
			{show('barcode') && <Text className="text-sm">{product.barcode}</Text>}
			{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
			{show('stock_quantity') && <StockQuantity {...props} className="text-sm" withText />}
			{show('meta_data') && <MetaData product={product} />}
			{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
			{show('categories') && <ProductCategories {...props} />}
			{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
			{show('tags') && <ProductTags {...props} />}
			{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
			{show('brands') && <ProductBrands {...props} />}
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
}
