import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { MetaData } from './meta-data';
import { PlainAttributes, ProductAttributes } from '../../../components/product/attributes';
import { ProductCategories } from '../../../components/product/categories';
import { GroupedNames } from '../../../components/product/grouped-names';
import { ProductTags } from '../../../components/product/tags';
import { StockQuantity } from '../cells/stock-quantity';
import { ProductBrands } from '../../../components/product/brands';

/**
 *
 */
export function Name(props: CellContext<{ record: EngineRecord<'products'> }, 'name'>) {
	const record = props.row.original.record;
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const meta = props.column.columnDef.meta;
	const show = meta?.show ?? (() => false);
	const fields = useRecordField(record, ({ payload }) => ({
		name: payload.name,
		sku: payload.sku,
		barcode: payload.barcode,
		type: payload.type,
		options: payload.variations?.length ?? 0,
	}));

	/**
	 * Sometimes the product name from WooCommerce is encoded in html entities
	 */
	return (
		<VStack space="xs" className="w-full">
			<Text className="font-bold" numberOfLines={2} decodeHtml>
				{fields.name}
			</Text>
			{fields.type === 'variable' &&
				((uiSettings.variationsStyle ?? 'drill') === 'drill' ? (
					<Text className="text-muted-foreground text-sm">
						{t('pos_products.n_options', { count: fields.options })}
					</Text>
				) : (
					<ProductAttributes {...props} />
				))}
			<View className="flex-row flex-wrap items-center gap-x-2.5 gap-y-px">
				{show('stock_quantity') && <StockQuantity {...props} />}
				{show('sku') && !!fields.sku && (
					<Text className="text-sm">
						<Text className="text-muted-foreground">{t('common.sku')} </Text>
						{fields.sku}
					</Text>
				)}
				{show('barcode') && !!fields.barcode && <Text className="text-sm">{fields.barcode}</Text>}
				{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
				{show('categories') && <ProductCategories {...props} />}
				{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
				{show('tags') && <ProductTags {...props} />}
				{/* @ts-expect-error: CellContext column type differs but components only use row/table */}
				{show('brands') && <ProductBrands {...props} />}
				{show('attributes') && <PlainAttributes {...props} />}
				{show('meta_data') && <MetaData record={record} />}
				{fields.type === 'grouped' && <GroupedNames {...props} />}
			</View>
		</VStack>
	);
}
