import * as React from 'react';
import { View } from 'react-native';

import { type PosterMark, type PosterPicture, tintOf } from '@wcpos/components/poster-tile';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useDocField } from '@wcpos/query';

import { useT } from '../../../../../../contexts/translations';
import { getVariablePrices } from '../../../../components/product/get-variable-prices';
import { PriceWithTax, TaxLine } from '../../../../components/product/price-with-tax';
import { displayStockStatus } from '../../../../components/product/resolve-stock';
import { useCurrencyFormat } from '../../../../hooks/use-currency-format';
import { TileImage } from '../../grid/tile-image';

/*
 * What a product or a variation puts in the Poster tile's slots, from the record and the
 * grid's fields (wcpos/roadmap `docs/specs/2026-10-12-pos-product-tile-poster-spec.md` § Words,
 * slot by slot). A field that is switched off is not rendered.
 */

type T = ReturnType<typeof useT>;
type TaxStatus = 'taxable' | 'shipping' | 'none';

export interface GridFields {
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

/**
 * The money slot: the price, then the Sale pill and the struck regular price, then the tax
 * line, as one wrapping row. A tile that is out says "Sold out" instead, with no Sale pill.
 */
export function moneyRow({
	price,
	regularPrice,
	onSale,
	taxStatus,
	taxClass,
	gridFields,
	from,
	out,
	t,
}: {
	price?: string | null;
	regularPrice?: string | null;
	onSale?: boolean;
	taxStatus?: string;
	taxClass?: string;
	gridFields: GridFields;
	/** A variable product whose range has a width: its minimum is a "from" price. */
	from?: boolean;
	out?: boolean;
	t: T;
}): React.ReactNode {
	if (out) {
		return gridFields.price || gridFields.stock_quantity ? (
			<Text className="font-bold">{t('pos_products.sold_out')}</Text>
		) : null;
	}
	// A variable product's range may lack a sub-range: what is not there is not shown (never 0).
	const struck = gridFields.on_sale && onSale && regularPrice != null;
	if (!gridFields.price || (price == null && !struck)) return null;
	const tax = { taxStatus: (taxStatus || 'none') as TaxStatus, taxClass: taxClass ?? '' };
	return (
		<View className="flex-row flex-wrap items-baseline gap-x-1.5">
			{from && <Text className="text-foreground/70 text-xs">{t('common.from')}</Text>}
			{price != null && (
				<PriceWithTax price={price} {...tax} taxDisplay="none" className="font-bold" />
			)}
			{struck && (
				<>
					<View className="bg-foreground self-center rounded-full px-1.5 py-px">
						<Text className="text-card text-xs font-bold uppercase">{t('common.sale')}</Text>
					</View>
					<PriceWithTax
						price={regularPrice}
						{...tax}
						taxDisplay="none"
						className="text-foreground/70 text-xs"
						strikethrough
					/>
				</>
			)}
			{gridFields.tax && price != null && (
				<TaxLine price={price} {...tax} className="text-foreground/70 text-xs" />
			)}
		</View>
	);
}

/** The facts slot: Cost, SKU, barcode, categories, in that order, each only when on and set. */
export function factsRow({
	sku,
	barcode,
	categories,
	cost,
	gridFields,
	format,
	t,
}: {
	sku?: string;
	barcode?: string;
	categories?: { name?: string }[];
	cost?: { total_value?: number } | null;
	gridFields: GridFields;
	format: (value: number) => string;
	t: T;
}): React.ReactNode {
	const label = (text: string) => <Text className="text-foreground/65 text-xs">{text} </Text>;
	const names = (categories ?? []).map((category) => category.name ?? '').filter(Boolean);
	const facts = [
		gridFields.cost_of_goods_sold && cost != null && (
			<Text key="cost" className="text-xs" numberOfLines={1}>
				{label(t('common.cost'))}
				{format(cost.total_value ?? 0)}
			</Text>
		),
		gridFields.sku && !!sku && (
			<Text key="sku" className="text-xs" numberOfLines={1}>
				{label(t('common.sku'))}
				{sku}
			</Text>
		),
		gridFields.barcode && !!barcode && (
			<Text key="barcode" className="text-xs" numberOfLines={1}>
				{barcode}
			</Text>
		),
		gridFields.category && names.length > 0 && (
			<Text key="categories" className="w-full text-xs" numberOfLines={1} decodeHtml>
				{names.join(', ')}
			</Text>
		),
	].filter(Boolean);
	if (facts.length === 0) return null;
	// Three lines at most: three lines of `text-xs` at the scale step's own line height, and the
	// two 1 px gaps between them (0.125 rem).
	return (
		<View className="max-h-[calc(3*var(--text-xs--line-height)+0.125rem)] flex-row flex-wrap gap-x-2.5 gap-y-px overflow-hidden">
			{facts}
		</View>
	);
}

/**
 * The stock mark: the count when stock is managed and some is left (low at the record's own
 * threshold, as Woo has no low-stock status), a backorder clock when it sells at none, nothing
 * otherwise; and only when the grid shows stock.
 */
export function stockMark({
	gridFields,
	manageStock,
	stockQuantity,
	lowStockAmount,
	status,
	t,
}: {
	gridFields: GridFields;
	manageStock?: boolean;
	stockQuantity?: number | null;
	lowStockAmount?: number | null;
	status?: string;
	t: T;
}): { mark: PosterMark; label: string } | null {
	if (!gridFields.stock_quantity) return null;
	if (manageStock === true && Number.isFinite(stockQuantity) && (stockQuantity as number) > 0) {
		const count = stockQuantity as number;
		const low =
			status === 'lowstock' || (typeof lowStockAmount === 'number' && count <= lowStockAmount);
		return {
			mark: { kind: 'count', value: count, low },
			label: t('pos_products.n_left', { count }),
		};
	}
	if (status === 'onbackorder')
		return { mark: { kind: 'backorder' }, label: t('common.backorder') };
	return null;
}

/**
 * A product's picture: its image, or a tint when it has none or the image fails. The tint is
 * keyed by the first category, else the name, so the same product always gets the same one.
 */
export function useProductPicture(
	record: EngineRecord<'products'>,
	still?: boolean
): PosterPicture {
	const { src, key } = useDocField(record, ({ payload }) => ({
		src: (payload.images?.[0]?.src as string | undefined) ?? '',
		key: (payload.categories?.[0]?.id as number | undefined) ?? payload.name ?? '',
	}));
	// Keyed by the source: a new picture gets its own chance to load.
	const [failed, setFailed] = React.useState<string | null>(null);
	const onFailed = React.useCallback(() => setFailed(src), [src]);
	if (!src || failed === src) return { kind: 'tint', tint: tintOf(key) };
	return {
		kind: 'slot',
		children: <TileImage record={record} still={still} cover onFailed={onFailed} />,
	};
}

/**
 * A product's words and marks on the Poster, from `gridFields`. A variable product that drills
 * (`drill`) is the stack: a "from" price and its options, no stock of its own, never out as a
 * whole. Shared with the parent in slot 0, whose copy must read exactly as the tile it left.
 */
export function useProductWords(
	record: EngineRecord<'products'>,
	gridFields: GridFields,
	drill: boolean
) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const stock = useDocField(record, ({ payload }) => displayStockStatus(payload));
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
		options: payload.variations?.length ?? 0,
	}));
	const out = !drill && stock === 'outofstock';
	// Keep the old variable tile's metadata ranges, missing-subrange and parent-price behavior.
	const variablePrices = drill
		? getVariablePrices(fields.metaData, {
				recordId: record.uuid,
				remoteId: record.remoteId,
				...fields,
			})
		: null;
	const mark = drill
		? null
		: stockMark({
				gridFields,
				manageStock: fields.manageStock,
				stockQuantity: fields.stockQuantity,
				lowStockAmount: fields.lowStockAmount,
				status: stock,
				t,
			});
	return {
		t,
		format,
		stock,
		fields,
		out,
		mark,
		title: gridFields.name && (
			<Text className="leading-tight font-bold" numberOfLines={2} decodeHtml>
				{fields.name}
			</Text>
		),
		money: moneyRow({
			// A drill tile reads only its ranges: a missing sub-range is omitted, as before (ledger
			// `pos/products/grid` 8), never the parent's cleared price.
			price: variablePrices ? variablePrices.price?.min : fields.price,
			regularPrice: variablePrices ? variablePrices.regular_price?.min : fields.regularPrice,
			onSale: fields.onSale,
			taxStatus: fields.taxStatus,
			taxClass: fields.taxClass,
			gridFields,
			from: !!variablePrices?.price && variablePrices.price.min !== variablePrices.price.max,
			out,
			t,
		}),
		sub:
			drill && fields.options > 0 ? (
				<Text className="text-foreground/70 text-xs">
					{t('pos_products.n_options', { count: fields.options })}
				</Text>
			) : null,
		facts: factsRow({
			sku: fields.sku,
			barcode: fields.barcode,
			categories: fields.categories,
			cost: fields.costOfGoodsSold,
			gridFields,
			format,
			t,
		}),
	};
}
