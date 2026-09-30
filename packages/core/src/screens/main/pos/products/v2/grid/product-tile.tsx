import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Icon } from '@wcpos/components/icon';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { InCartCount, useProductCount } from '../rows/product-row';
import { displayStockStatus } from '../../../../components/product/resolve-stock';
import { useStockStatusLabel } from '../../../../hooks/use-stock-status-label';
import { useT } from '../../../../../../contexts/translations';
import { getVariablePrices } from '../../../../components/product/get-variable-prices';
import { PriceWithTax } from '../../../../components/product/price-with-tax';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import { useAddProduct } from '../../../hooks/use-add-product';
import { TileImage } from '../../grid/tile-image';

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
	record: EngineRecord<'products'>;
	gridFields: GridFields;
	onDrill?: (record: EngineRecord<'products'>) => void;
}

/** Renders a product tile with the fields enabled for the product grid. */
export function ProductTile({ record, gridFields, onDrill }: ProductTileProps) {
	const t = useT();
	const count = useProductCount(record);
	const { getLabel } = useStockStatusLabel();
	const stock = useDocField(record, ({ payload }) => displayStockStatus(payload));
	const { addProduct } = useAddProduct();
	const { format } = useCurrencyFormat();
	const fields = useDocField(record, ({ payload }) => ({
		name: payload.name,
		price: payload.price,
		regularPrice: payload.regular_price,
		salePrice: payload.sale_price,
		metaData: payload.meta_data,
		onSale: payload.on_sale,
		taxStatus: payload.tax_status,
		taxClass: payload.tax_class,
		categories: payload.categories ?? [],
		sku: payload.sku,
		barcode: payload.barcode,
		stockQuantity: payload.stock_quantity,
		manageStock: payload.manage_stock,
		lowStockAmount: payload.low_stock_amount,
		costOfGoodsSold: payload.cost_of_goods_sold,
	}));

	// The pill counts what is left; nothing left is a status (the badge under the name), not "0 left".
	const showStockPill =
		gridFields.stock_quantity &&
		fields.manageStock === true &&
		Number.isFinite(fields.stockQuantity) &&
		(fields.stockQuantity as number) > 0;
	// Woo has no low-stock status: low is the product's own threshold (or a plugin's status).
	const lowStock =
		showStockPill &&
		(stock === 'lowstock' ||
			(typeof fields.lowStockAmount === 'number' &&
				(fields.stockQuantity as number) <= fields.lowStockAmount));
	const safeTaxStatus = (fields.taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('none' as const);
	const showOnSale = gridFields.on_sale && fields.onSale;
	// Keep the old variable tile's metadata ranges, missing-subrange and parent-price behavior.
	const variablePrices = onDrill
		? getVariablePrices(fields.metaData, {
				recordId: record.uuid,
				remoteId: record.remoteId,
				...fields,
			})
		: null;
	const prices: { range?: { min: string; max: string }; strikethrough?: boolean }[] = [
		...(showOnSale
			? [
					{
						range: variablePrices
							? variablePrices.regular_price
							: { min: fields.regularPrice ?? '', max: fields.regularPrice ?? '' },
						strikethrough: true,
					},
				]
			: []),
		{
			range: variablePrices
				? variablePrices.price
				: { min: fields.price ?? '', max: fields.price ?? '' },
		},
	];
	const hasAnyField =
		gridFields.name ||
		gridFields.price ||
		gridFields.sku ||
		gridFields.barcode ||
		gridFields.category ||
		gridFields.stock_quantity ||
		gridFields.cost_of_goods_sold;

	const handlePress = React.useCallback(async () => {
		if (onDrill) onDrill(record);
		else await addProduct(record);
	}, [addProduct, record, onDrill]);

	return (
		<Pressable
			onPress={handlePress}
			className="bg-card border-border active:bg-muted m-1 flex-1 overflow-hidden rounded-lg border"
			testID={onDrill ? 'variable-product-tile' : 'product-tile'}
		>
			<View
				className="aspect-square"
				testID={`${onDrill ? 'variable-product-tile' : 'product-tile'}-${record.remoteId ?? record.uuid}`}
			>
				<TileImage record={record} />
				{showStockPill && (
					<View
						className={`absolute top-2 left-2 h-5 justify-center rounded-full px-2 ${lowStock ? 'bg-warning' : 'bg-foreground'}`}
						testID={`product-tile-stock-${record.remoteId ?? record.uuid}`}
					>
						<Text
							className={`text-xs font-bold ${lowStock ? 'text-warning-foreground' : 'text-background'}`}
						>
							{t('pos_products.n_left', { count: fields.stockQuantity as number })}
						</Text>
					</View>
				)}
				{onDrill && count <= 0 && (
					<View className="bg-card absolute top-2 right-2 size-6 items-center justify-center rounded-full">
						<Icon name="chevronRight" size="sm" className="text-muted-foreground" />
					</View>
				)}
				{count > 0 && (
					<View className="absolute top-2 right-2">
						<InCartCount count={count} />
					</View>
				)}
			</View>
			{hasAnyField && (
				<VStack className="p-2" space="xs">
					{gridFields.name && (
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{fields.name}
						</Text>
					)}
					{gridFields.price && (
						<VStack space="xs">
							{prices.map(
								({ range, strikethrough }, index) =>
									range && (
										<View key={index} className="flex-row flex-wrap items-center gap-1">
											{onDrill && range.min !== range.max && (
												<Text className="text-muted-foreground">{t('common.from')}</Text>
											)}
											<PriceWithTax
												price={range.min}
												taxStatus={safeTaxStatus}
												taxClass={fields.taxClass ?? ''}
												taxDisplay={taxDisplay}
												strikethrough={strikethrough}
											/>
										</View>
									)
							)}
						</VStack>
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
							{fields.categories.map((c: { name?: string }) => c.name ?? '').join(', ')}
						</Text>
					)}
					{gridFields.stock_quantity && !showStockPill && (
						<StatusBadge
							label={getLabel(stock ?? 'instock')}
							variant={
								stock === 'lowstock' ? 'warning' : stock === 'outofstock' ? 'error' : 'success'
							}
						/>
					)}
					{gridFields.stock_quantity && !showStockPill && fields.stockQuantity != null && (
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
