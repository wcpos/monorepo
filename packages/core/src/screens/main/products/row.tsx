import * as React from 'react';
import { Pressable, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { map, type Observable } from 'rxjs';

import { Image } from '@wcpos/components/image';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useProAccess } from '../contexts/pro-access';
import { useUserCapabilities } from '../hooks/use-user-capabilities';
import { useImageAttachment } from '../hooks/use-image-attachment';
import { ProductStockBadge } from './cells/stock-status';
import { displayStockStatus } from '../components/product/resolve-stock';
import { resolveImageSrc } from '../components/product/resolve-image-src';
import { resolveVariationName } from '../components/product/resolve-variation-name';
import { PriceWithTax } from '../components/product/price-with-tax';
import { getVariablePrices } from '../components/product/get-variable-prices';
import { PRODUCT_IMAGE_PLACEHOLDER } from '../components/product/product-image-placeholder';
import { VariationRowProvider } from '../components/product/variable-product-row/context';
import { VariationsFilterBar } from '../components/product/variable-product-row/variations/filters';
import { VariationTableFooter } from '../components/product/variable-product-row/variations/footer';
import { matchesStockStatusFilter } from '../components/product/stock-filter';
import { useCollectionBinding, useQueryState, useQueryStateActions } from '../../../query';

import type { Row, Table } from '../../../table-types';
import type { DataTableFeatures } from '../components/data-table/v2';

type Product = {
	record: EngineRecord<'products'>;
	childrenSearchCount?: number;
	parentSearchTerm?: string;
};
export function ProductRow({
	record,
	expanded,
	onToggle,
}: {
	record: EngineRecord<'products'> | EngineRecord<'variations'>;
	expanded?: boolean;
	onToggle?: () => void;
}) {
	const product = useRecordField(record, ({ payload }) => payload);
	const router = useRouter();
	const { readOnly } = useProAccess();
	const { caps } = useUserCapabilities();
	const variable = product.type === 'variable';
	const variation = product.type === 'variation';
	const editable = !readOnly && (variation ? caps.canEditVariations : caps.canEditProducts);
	const source = resolveImageSrc(product);
	const { uri, error } = useImageAttachment(record, source ?? '');
	const range = variable
		? getVariablePrices(product.meta_data, {
				recordId: record.uuid,
				remoteId: record.remoteId,
				name: product.name,
				sku: product.sku,
				price: product.price,
			})?.price
		: undefined;
	const price = (value: string) => (
		<PriceWithTax
			price={value}
			taxClass={product.tax_class ?? ''}
			taxStatus={product.tax_status || 'none'}
			taxDisplay="none"
		/>
	);
	return (
		<Pressable
			testID={`products-row-${record.uuid}`}
			accessibilityRole="button"
			accessibilityState={{
				disabled: !variable && !editable,
				...(variable ? { expanded: !!expanded } : {}),
			}}
			onPress={() => {
				if (variable) onToggle?.();
				else if (editable)
					router.push(
						variation
							? {
									pathname: '/(app)/(drawer)/products/(modals)/edit/variation/[variationId]',
									params: { variationId: record.uuid },
								}
							: {
									pathname: '/(app)/(drawer)/products/(modals)/edit/product/[productId]',
									params: { productId: record.uuid },
								}
					);
			}}
			className="border-border active:bg-muted min-h-14 flex-row items-center gap-3 border-b px-3"
		>
			<Image
				source={{ uri: error || !uri ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
				recyclingKey={record.uuid}
				className="size-10 rounded"
			/>
			<View className="min-w-0 flex-1">
				<Text decodeHtml numberOfLines={1}>
					{variation ? resolveVariationName(product) : product.name}
				</Text>
				<Text className="text-muted-foreground text-sm" numberOfLines={1}>
					{product.sku}
				</Text>
			</View>
			<View className="items-end gap-1 tabular-nums">
				<View className="flex-row items-center gap-1">
					{price(range?.min ?? product.price ?? '')}
					{range && range.min !== range.max && (
						<>
							<Text>–</Text>
							{price(range.max)}
						</>
					)}
				</View>
				<ProductStockBadge
					status={displayStockStatus(product)}
					quantity={product.manage_stock === true ? product.stock_quantity : undefined}
				/>
			</View>
			<Icon
				name={variable ? (expanded ? 'chevronUp' : 'chevronDown') : 'chevronRight'}
				className="text-muted-foreground"
			/>
		</Pressable>
	);
}

type VariableRowProps = {
	item: Row<Product, DataTableFeatures>;
	table: Table<Product, DataTableFeatures>;
};
export function VariableRow(props: VariableRowProps) {
	const meta = props.table.options.meta as unknown as {
		setRowExpanded: (id: string, expanded: boolean) => void;
	};
	return (
		<VariationRowProvider row={props.item} setRowExpanded={meta.setRowExpanded}>
			<VariableRowContent {...props} />
		</VariationRowProvider>
	);
}
function VariableRowContent({ item, table }: VariableRowProps) {
	const meta = table.options.meta as unknown as {
		expanded$: Observable<Record<string, boolean>>;
		setRowExpanded: (id: string, expanded: boolean) => void;
		variationStockStatus?: string;
	};
	const expanded$ = React.useMemo(
		() => meta.expanded$.pipe(map((value) => !!value[item.id])),
		[meta, item.id]
	);
	const expanded = useObservableEagerState(expanded$);
	const actions = useQueryStateActions<'variations'>();
	const toggle = () => {
		if (!expanded && (item.original.childrenSearchCount ?? 0) > 0) {
			actions.setSearch(item.original.parentSearchTerm ?? '');
			actions.clearFilter('attributeMatches');
		}
		meta.setRowExpanded(item.id, !expanded);
	};
	return (
		<>
			<ProductRow record={item.original.record} expanded={expanded} onToggle={toggle} />
			{expanded && <InlineVariations row={item} stockStatus={meta.variationStockStatus} />}
		</>
	);
}
function InlineVariations({
	row,
	stockStatus,
}: {
	row: Row<Product, DataTableFeatures>;
	stockStatus?: string;
}) {
	const state = useQueryState<'variations'>();
	const actions = useQueryStateActions<'variations'>();
	const ids = useRecordField(row.original.record, ({ payload }) => payload.variations) ?? [];
	const binding = useCollectionBinding('variations', state, {
		remoteIds: ids.map(remoteIdOrNull).filter((id) => id !== null),
	});
	const initialBinding = React.useRef(binding);
	React.useEffect(() => {
		// Same expansion refresh and row-scoped cleanup as the shared inline variations view.
		void initialBinding.current.sync().catch(() => undefined);
		return () => {
			actions.clearSearch();
			actions.resetFilters();
		};
	}, [actions]);
	return (
		<View>
			<VariationsFilterBar row={row} />
			<Suspense>
				<VariationRows binding={binding} parent={row.original.record} stockStatus={stockStatus} />
			</Suspense>
		</View>
	);
}
function VariationRows({
	binding,
	parent,
	stockStatus,
}: {
	binding: ReturnType<typeof useCollectionBinding<'variations'>>;
	parent: EngineRecord<'products'>;
	stockStatus?: string;
}) {
	const result = useObservableSuspense(binding.resource);
	const hits = result.hits.filter((hit) =>
		matchesStockStatusFilter(hit.record.payload, stockStatus)
	);
	return (
		<View>
			{hits.map(({ record }) => (
				<View
					key={record.uuid}
					testID={`data-table-row-variation-${record.remoteId ?? record.uuid}`}
				>
					<ProductRow record={record} />
				</View>
			))}
			<VariationTableFooter binding={binding} parent={parent} count={hits.length} />
		</View>
	);
}
