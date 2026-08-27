import * as React from 'react';
import { Pressable, View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useProductsStockStatusFilter, VariationsPopover } from '../cells/variations-popover';
import { useT } from '../../../../../contexts/translations';
import { getVariablePrices } from '../../../components/product/get-variable-prices';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useAddVariation } from '../../hooks/use-add-variation';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { TileImage } from './tile-image';

type LineItem = NonNullable<import('@wcpos/database').OrderDocument['line_items']>[number];

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

interface VariableProductTileProps {
	record: EngineRecord<'products'>;
	gridFields: GridFields;
}

interface VariablePriceRangeProps {
	// Optional: the server omits a sub-range when no visible variation carries
	// that field (see get-variable-prices.ts).
	prices?: { min: string; max: string };
	taxStatus: 'taxable' | 'shipping' | 'none';
	taxClass: string;
	taxDisplay: 'text' | 'none';
	strikethrough?: boolean;
}

function VariablePriceRange({
	prices,
	taxStatus,
	taxClass,
	taxDisplay,
	strikethrough,
}: VariablePriceRangeProps) {
	if (!prices) {
		return null;
	}
	if (prices.min === prices.max) {
		return (
			<PriceWithTax
				price={prices.min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={taxDisplay}
				strikethrough={strikethrough}
			/>
		);
	}

	return (
		<HStack className="flex-wrap gap-1">
			<PriceWithTax
				price={prices.min}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={taxDisplay}
				strikethrough={strikethrough}
			/>
			<Text className={strikethrough ? 'line-through' : ''}>-</Text>
			<PriceWithTax
				price={prices.max}
				taxStatus={taxStatus}
				taxClass={taxClass}
				taxDisplay={taxDisplay}
				strikethrough={strikethrough}
			/>
		</HStack>
	);
}

/** Renders a variable product tile with the fields enabled for the product grid. */
export function VariableProductTile({ record, gridFields }: VariableProductTileProps) {
	const t = useT();
	const { addVariation } = useAddVariation();
	// Read here, inside the products QueryStateProvider — PopoverContent portals out of it
	// on native, so the popover itself cannot reach the products filter.
	const stockStatus = useProductsStockStatusFilter();
	const { format } = useCurrencyFormat();
	const triggerRef = React.useRef<{ close: () => void } | null>(null);

	const fields = useRecordField(record, ({ payload }) => ({
		name: payload.name,
		metaData: payload.meta_data,
		price: payload.price,
		regularPrice: payload.regular_price,
		salePrice: payload.sale_price,
		onSale: payload.on_sale,
		taxStatus: payload.tax_status,
		taxClass: payload.tax_class,
		categories: payload.categories ?? [],
		sku: payload.sku,
		barcode: payload.barcode,
		stockQuantity: payload.stock_quantity,
		costOfGoodsSold: payload.cost_of_goods_sold,
	}));
	const variablePrices = getVariablePrices(
		fields.metaData as { key?: string; value?: string }[] | undefined,
		{
			recordId: record.uuid,
			remoteId: record.remoteId,
			name: fields.name,
			sku: fields.sku,
			price: fields.price,
			regularPrice: fields.regularPrice,
			salePrice: fields.salePrice,
		}
	);

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

	const addToCart = React.useCallback(
		async (variation: EngineRecord<'variations'>, metaData: LineItem['meta_data']) => {
			await addVariation(variation, record, metaData as Parameters<typeof addVariation>[2]);
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[addVariation, record]
	);

	return (
		<Popover className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border">
			<PopoverTrigger ref={triggerRef as React.RefObject<never>} asChild>
				<Pressable className="flex-1" testID="variable-product-tile">
					{/* Id-bearing testID, mirroring ProductTile: most of a real catalogue is
					    variable, so without it no grid assertion can name WHICH product it means. */}
					<View
						className="aspect-square"
						testID={`variable-product-tile-${record.remoteId ?? record.uuid}`}
					>
						<TileImage record={record} />
						<View className="absolute top-1 right-1 rounded bg-black/50 px-1 py-0.5">
							<Text className="text-xs text-white">{t('common.variants')}</Text>
						</View>
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
									{variablePrices ? (
										showOnSale ? (
											<VStack space="xs">
												<VariablePriceRange
													prices={variablePrices.regular_price}
													taxStatus={safeTaxStatus}
													taxClass={fields.taxClass ?? ''}
													taxDisplay={taxDisplay}
													strikethrough
												/>
												<VariablePriceRange
													prices={variablePrices.price}
													taxStatus={safeTaxStatus}
													taxClass={fields.taxClass ?? ''}
													taxDisplay={taxDisplay}
												/>
											</VStack>
										) : (
											<VariablePriceRange
												prices={variablePrices.price}
												taxStatus={safeTaxStatus}
												taxClass={fields.taxClass ?? ''}
												taxDisplay={taxDisplay}
											/>
										)
									) : showOnSale ? (
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
			</PopoverTrigger>
			<PopoverContent side="right" align="center" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={record} addToCart={addToCart} stockStatus={stockStatus} />
			</PopoverContent>
		</Popover>
	);
}
