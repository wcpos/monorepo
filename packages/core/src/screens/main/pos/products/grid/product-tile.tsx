import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useAddProduct } from '../../hooks/use-add-product';
import { TileImage } from './tile-image';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface GridFields {
	name: boolean;
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

interface ProductTileProps {
	product: ProductDocument;
	record: EngineRecord<'products'>;
	gridFields: GridFields;
}

/** Renders a product tile with the fields enabled for the product grid. */
export function ProductTile({ product, record, gridFields }: ProductTileProps) {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { format } = useCurrencyFormat();
	const fields = useRecordField(record, ({ payload }) => ({
		name: payload.name,
		price: payload.price,
		regularPrice: payload.regular_price,
		onSale: payload.on_sale,
		taxStatus: payload.tax_status,
		taxClass: payload.tax_class,
		categories: payload.categories ?? [],
		sku: payload.sku,
		barcode: payload.barcode,
		stockQuantity: payload.stock_quantity,
		costOfGoodsSold: payload.cost_of_goods_sold,
	}));

	const safeTaxStatus = (fields.taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('none' as const);
	const showOnSale = gridFields.on_sale && fields.onSale;
	const hasAnyField =
		gridFields.name ||
		gridFields.price ||
		gridFields.sku ||
		gridFields.barcode ||
		gridFields.category ||
		gridFields.stock_quantity ||
		gridFields.cost_of_goods_sold;

	const handlePress = React.useCallback(async () => {
		await addProduct(record);
	}, [addProduct, record]);

	return (
		<Pressable
			onPress={handlePress}
			className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border"
			testID="product-tile"
		>
			<View className="aspect-square" testID={`product-tile-${record.remoteId ?? record.uuid}`}>
				<TileImage product={product} record={record} />
			</View>
			{hasAnyField && (
				<VStack className="p-2" space="xs">
					{gridFields.name && (
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{fields.name}
						</Text>
					)}
					{gridFields.price && (
						<>
							{showOnSale ? (
								<VStack space="xs">
									<PriceWithTax
										price={fields.regularPrice ?? ''}
										taxStatus={safeTaxStatus}
										taxClass={fields.taxClass ?? ''}
										taxDisplay={taxDisplay}
										strikethrough
									/>
									<PriceWithTax
										price={fields.price ?? ''}
										taxStatus={safeTaxStatus}
										taxClass={fields.taxClass ?? ''}
										taxDisplay={taxDisplay}
									/>
								</VStack>
							) : (
								<PriceWithTax
									price={fields.price ?? ''}
									taxStatus={safeTaxStatus}
									taxClass={fields.taxClass ?? ''}
									taxDisplay={taxDisplay}
								/>
							)}
						</>
					)}
					{gridFields.sku && fields.sku ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.sku')}: {fields.sku}
						</Text>
					) : null}
					{gridFields.barcode && fields.barcode ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.barcode')}: {fields.barcode}
						</Text>
					) : null}
					{gridFields.category && fields.categories.length > 0 && (
						<Text className="text-muted-foreground text-xs" numberOfLines={1} decodeHtml>
							{fields.categories.map((c) => c.name ?? '').join(', ')}
						</Text>
					)}
					{gridFields.stock_quantity && fields.stockQuantity != null && (
						<Text className="text-muted-foreground text-xs">
							{t('common.stock')}: {fields.stockQuantity}
						</Text>
					)}
					{gridFields.cost_of_goods_sold && fields.costOfGoodsSold != null ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.cogs')}: {format(fields.costOfGoodsSold?.total_value ?? 0)}
						</Text>
					) : null}
				</VStack>
			)}
		</Pressable>
	);
}
