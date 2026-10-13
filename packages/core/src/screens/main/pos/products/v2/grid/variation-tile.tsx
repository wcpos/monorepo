import * as React from 'react';
import { View } from 'react-native';

import { useAnimatedStyle } from 'react-native-reanimated';

import { Image } from '@wcpos/components/image';
import {
	type PosterPicture,
	PosterPlaceholder,
	PosterTile,
	tintOf,
} from '@wcpos/components/poster-tile';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { sanitizeVariationAttributesRead } from '@wcpos/query/collection-map';

import { useT } from '../../../../../../contexts/translations';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../../../../components/product/product-image-placeholder';
import { resolveImageSrc } from '../../../../components/product/resolve-image-src';
import { displayStockStatus } from '../../../../components/product/resolve-stock';
import { resolveVariationName } from '../../../../components/product/resolve-variation-name';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import { useImageAttachment } from '../../../../hooks/use-image-attachment';
import { useCurrentOrder } from '../../../contexts/current-order';
import { useAddVariation } from '../../../hooks/use-add-variation';
import { useDealCards } from '../deal-stack';
import { InCartCount } from '../rows/in-cart-count';
import {
	factsRow,
	type GridFields,
	moneyRow,
	stockMark,
	useProductPicture,
	useProductWords,
} from './tile-words';

type Attributes = import('@wcpos/database').ProductVariationDocument['attributes'];

// The Poster cover, as the product tile's picture.
const COVER = { contentFit: 'cover' } as const;

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

function VariationImageInner({
	record,
	src,
	onFailed,
}: {
	record: EngineRecord<'variations'>;
	src: string;
	onFailed: () => void;
}) {
	const { uri, error } = useImageAttachment(record, src);
	const failed = !uri || !!error;
	// Before the paint: the tile falls back to its tint without showing the placeholder.
	React.useLayoutEffect(() => {
		if (failed) onFailed();
	}, [failed, uri, onFailed]);
	return (
		<Image
			source={{ uri: failed ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
			recyclingKey={record.uuid}
			className="h-full w-full"
			onError={onFailed}
			{...COVER}
		/>
	);
}

/**
 * A variation's own picture, or its parent's tint when it has none or it fails. The
 * attachment hook suspends while the image loads; the rest of the tile must not wait.
 */
function useVariationPicture(
	record: EngineRecord<'variations'>,
	parent: EngineRecord<'products'>
): PosterPicture {
	const src = useRecordField(record, (variation) => resolveImageSrc(variation.payload)) ?? '';
	const key = useDocField(
		parent,
		({ payload }) => (payload.categories?.[0]?.id as number | undefined) ?? payload.name ?? ''
	);
	const [failed, setFailed] = React.useState<string | null>(null);
	const onFailed = React.useCallback(() => setFailed(src), [src]);
	if (!src || failed === src) return { kind: 'tint', tint: tintOf(key) };
	return {
		kind: 'slot',
		children: (
			<Suspense
				fallback={
					<Image source={{ uri: undefined }} recyclingKey={record.uuid} className="h-full w-full" />
				}
			>
				<VariationImageInner record={record} src={src} onFailed={onFailed} />
			</Suspense>
		),
	};
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
	const { format } = useCurrencyFormat();
	const { addVariation } = useAddVariation();
	const payload = useDocField(record, (value) => value.payload);
	const parentName = useDocField(parent, (value) => value.payload.name);
	const picture = useVariationPicture(record, parent);
	const stock = displayStockStatus(payload);
	const name = resolveVariationName(payload);
	const id = record.remoteId ?? record.uuid;
	const attributes = (sanitizeVariationAttributesRead(payload.attributes) as Attributes) ?? [];
	const options = attributes
		.map((attribute) => (typeof attribute.option === 'string' ? attribute.option.trim() : ''))
		.filter((option) => option !== '');
	const out = stock === 'outofstock';
	const mark = stockMark({
		gridFields,
		manageStock: payload.manage_stock,
		stockQuantity: payload.stock_quantity,
		lowStockAmount: payload.low_stock_amount,
		status: stock,
		t,
	});

	const add = () =>
		addVariation(
			record,
			parent,
			attributes.map((attribute) => ({
				attr_id: attribute.id ?? 0,
				display_key: attribute.name,
				display_value: attribute.option,
			}))
		);

	return (
		<PosterTile
			picture={picture}
			mark={mark?.mark}
			markLabel={mark?.label}
			markTestID={`variation-tile-stock-${id}`}
			// Always mounted: the count has to be there before the first add to show it land.
			corner={<InCartCount product={record.uuid} count={count} />}
			title={
				gridFields.name && (
					<View className="gap-0.5">
						<Text className="text-foreground/70 text-xs" numberOfLines={1} decodeHtml>
							{parentName}
						</Text>
						<View className="flex-row flex-wrap gap-1">
							{(options.length > 0 ? options : [name]).map((option, index) => (
								<Text
									key={index}
									className="bg-foreground/12 rounded px-1.5 py-px text-xs font-bold"
									numberOfLines={1}
									decodeHtml
								>
									{option}
								</Text>
							))}
						</View>
					</View>
				)
			}
			money={moneyRow({
				price: payload.price,
				regularPrice: payload.regular_price,
				onSale: payload.on_sale,
				taxStatus: payload.tax_status,
				taxClass: payload.tax_class,
				gridFields,
				out,
				t,
			})}
			facts={factsRow({
				sku: payload.sku,
				barcode: payload.barcode,
				cost: payload.cost_of_goods_sold,
				gridFields,
				format,
				t,
			})}
			out={out}
			grow
			onPress={add}
			accessibilityLabel={name}
			testID="variation-tile"
			squareTestID={`variation-tile-${id}`}
		/>
	);
}

/**
 * The product whose variations are out on the grid. It is the tile that was tapped, moved to
 * the first slot, and tapping it is the way back: the same words and picture as that tile, the
 * back badge where its cart count was. On the Deal's copy its cards leave the stack as the
 * variations are dealt and come back as they gather (`useDealCards`).
 */
export function ParentTile({
	record,
	gridFields,
	onPress,
}: {
	record: EngineRecord<'products'>;
	gridFields: GridFields;
	onPress: () => void;
}) {
	const { t, title, money, sub, facts } = useProductWords(record, gridFields, true);
	// The same picture the tapped tile was showing: it moves, it does not arrive.
	const picture = useProductPicture(record, true);
	const cards = useDealCards();
	const stackStyle = useAnimatedStyle(() => ({
		opacity: cards ? Math.min(1, Math.max(0, cards.value)) : 1,
	}));
	return (
		<PosterTile
			picture={picture}
			back
			stacked
			stackStyle={stackStyle}
			title={title}
			money={money}
			sub={sub}
			facts={facts}
			grow
			onPress={onPress}
			accessibilityLabel={t('common.back')}
			testID="variations-parent-tile"
		/>
	);
}

/** A variation that has not arrived yet: its slot is held, in a tile's own shape. */
export function VariationPlaceholder() {
	return <PosterPlaceholder grow testID="variation-placeholder" />;
}
