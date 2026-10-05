import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { Image } from '@wcpos/components/image';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

import { useT } from '../../../../../../contexts/translations';
import { PriceWithTax } from '../../../../components/product/price-with-tax';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../../components/product/product-image-placeholder';
import { resolveImageSrc } from '../../../../components/product/resolve-image-src';
import { displayStockStatus } from '../../../../components/product/resolve-stock';
import { resolveVariationName } from '../../../../components/product/resolve-variation-name';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import { useImageAttachment } from '../../../../hooks/use-image-attachment';
import { useStockStatusLabel } from '../../../../hooks/use-stock-status-label';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useAddVariation } from '../../../hooks/use-add-variation';
import { TileImage } from '../../grid/tile-image';
import { InCartCount } from '../rows/in-cart-count';

import type { GridFields } from './product-tile';

type Attributes = import('@wcpos/database').ProductVariationDocument['attributes'];

// In a dealt cell the tile grows to its row's height; `flex-1` would give it no height of
// its own inside the cell.
const TILE = 'bg-card border-border active:bg-muted m-1 grow overflow-hidden rounded-lg border';

function useVariationCount(record: EngineRecord<'variations'>) {
	const { currentOrderRecord } = useCurrentOrder();
	return useDocField(currentOrderRecord, (value) =>
		record.remoteId == null
			? 0
			: (value.payload.line_items ?? [])
					.filter(
						(line: { variation_id?: number }) => line.variation_id === Number(record.remoteId)
					)
					.reduce((sum: number, line: { quantity?: number }) => sum + (line.quantity ?? 1), 0)
	);
}

function VariationImageInner({ record, src }: { record: EngineRecord<'variations'>; src: string }) {
	const { uri, error } = useImageAttachment(record, src);
	return (
		<Image
			source={{ uri: !uri || error ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
			recyclingKey={record.uuid}
			className="h-full w-full"
		/>
	);
}

// The attachment hook suspends while the image loads; the rest of the tile must not wait.
function VariationImage({ record }: { record: EngineRecord<'variations'> }) {
	const src = useRecordField(record, (variation) => resolveImageSrc(variation.payload));
	return (
		<Suspense
			fallback={
				<Image source={{ uri: undefined }} recyclingKey={record.uuid} className="h-full w-full" />
			}
		>
			<VariationImageInner record={record} src={src ?? ''} />
		</Suspense>
	);
}

/** One variation as a tile: the tile is the add control, as a product tile is. */
export function VariationTile({
	record,
	parent,
	gridFields,
}: {
	record: EngineRecord<'variations'>;
	parent: EngineRecord<'products'>;
	gridFields: GridFields;
}) {
	const t = useT();
	const count = useVariationCount(record);
	const { getLabel } = useStockStatusLabel();
	const { format } = useCurrencyFormat();
	const { addVariation } = useAddVariation();
	const payload = useDocField(record, (value) => value.payload);
	const stock = displayStockStatus(payload);
	const name = resolveVariationName(payload);
	const id = record.remoteId ?? record.uuid;

	// The same reading of stock as the product tile: the pill counts what is left, nothing
	// left is a status, and low is the record's own threshold.
	const showStockPill =
		gridFields.stock_quantity &&
		payload.manage_stock === true &&
		Number.isFinite(payload.stock_quantity) &&
		(payload.stock_quantity as number) > 0;
	const lowStock =
		showStockPill &&
		(stock === 'lowstock' ||
			(typeof payload.low_stock_amount === 'number' &&
				(payload.stock_quantity as number) <= payload.low_stock_amount));
	const taxStatus = (payload.tax_status || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('none' as const);
	const hasAnyField =
		gridFields.name ||
		gridFields.price ||
		gridFields.sku ||
		gridFields.barcode ||
		gridFields.stock_quantity ||
		gridFields.cost_of_goods_sold;

	const add = () =>
		addVariation(
			record,
			parent,
			((sanitizeVariationAttributesRead(payload.attributes) as Attributes) ?? []).map(
				(attribute) => ({
					attr_id: attribute.id ?? 0,
					display_key: attribute.name,
					display_value: attribute.option,
				})
			)
		);

	return (
		<Pressable
			onPress={add}
			accessibilityRole="button"
			accessibilityLabel={name}
			className={TILE}
			testID="variation-tile"
		>
			<View className="aspect-square" testID={`variation-tile-${id}`}>
				<VariationImage record={record} />
				{showStockPill && (
					<View
						className={`absolute top-2 left-2 h-5 justify-center rounded-full px-2 ${lowStock ? 'bg-warning' : 'bg-foreground'}`}
						testID={`variation-tile-stock-${id}`}
					>
						<Text
							className={`text-xs font-bold ${lowStock ? 'text-warning-foreground' : 'text-background'}`}
						>
							{t('pos_products.n_left', { count: payload.stock_quantity as number })}
						</Text>
					</View>
				)}
				{/* Always mounted: the count has to be there before the first add to show it land. */}
				<View className="absolute top-2 right-2">
					<InCartCount product={record.uuid} count={count} />
				</View>
			</View>
			{hasAnyField && (
				<VStack className="p-2" space="xs">
					{gridFields.name && (
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{name}
						</Text>
					)}
					{gridFields.price && (
						<VStack space="xs">
							{gridFields.on_sale && payload.on_sale && (
								<View className="flex-row flex-wrap items-center gap-1">
									<PriceWithTax
										price={payload.regular_price ?? ''}
										taxStatus={taxStatus}
										taxClass={payload.tax_class ?? ''}
										taxDisplay={taxDisplay}
										strikethrough
									/>
								</View>
							)}
							<View className="flex-row flex-wrap items-center gap-1">
								<PriceWithTax
									price={payload.price ?? ''}
									taxStatus={taxStatus}
									taxClass={payload.tax_class ?? ''}
									taxDisplay={taxDisplay}
								/>
							</View>
						</VStack>
					)}
					{gridFields.sku && payload.sku ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.sku')}: {payload.sku}
						</Text>
					) : null}
					{gridFields.barcode && payload.barcode ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.barcode')}: {payload.barcode}
						</Text>
					) : null}
					{gridFields.stock_quantity && !showStockPill && (
						<StatusBadge
							label={getLabel(stock ?? 'instock')}
							variant={
								stock === 'lowstock' ? 'warning' : stock === 'outofstock' ? 'error' : 'success'
							}
						/>
					)}
					{gridFields.cost_of_goods_sold && payload.cost_of_goods_sold != null ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.cogs')}: {format(payload.cost_of_goods_sold?.total_value ?? 0)}
						</Text>
					) : null}
				</VStack>
			)}
		</Pressable>
	);
}

/**
 * The product whose variations are out on the grid. It is the tile that was tapped, moved to
 * the first slot, and tapping it is the way back.
 */
export function ParentTile({
	record,
	onPress,
}: {
	record: EngineRecord<'products'>;
	onPress: () => void;
}) {
	const t = useT();
	const name = useDocField(record, (value) => value.payload.name);
	const count = useDocField(record, (value) => value.payload.variations?.length ?? 0);
	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={t('common.back')}
			className={TILE}
			testID="variations-parent-tile"
		>
			<View className="aspect-square">
				{/* The same picture the tapped tile was showing: it moves, it does not arrive. */}
				<TileImage record={record} still />
				<View className="bg-card absolute top-2 right-2 size-6 items-center justify-center rounded-full">
					<Icon name="chevronLeft" size="sm" className="text-muted-foreground" />
				</View>
			</View>
			<VStack className="p-2" space="xs">
				<Text className="font-bold" numberOfLines={2} decodeHtml>
					{name}
				</Text>
				<Text className="text-muted-foreground">{t('pos_products.n_variations', { count })}</Text>
			</VStack>
		</Pressable>
	);
}

/** A variation that has not arrived yet: its slot is held, in a tile's own shape. */
export function VariationPlaceholder() {
	return (
		<View className="bg-muted m-1 grow rounded-lg" aria-busy testID="variation-placeholder">
			<View className="aspect-square" />
		</View>
	);
}
