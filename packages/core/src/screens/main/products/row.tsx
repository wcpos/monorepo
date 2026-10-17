import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { map, type Observable } from 'rxjs';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Image } from '@wcpos/components/image';
import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { Suspense } from '@wcpos/components/suspense';
import { type EngineRecord, type QueryHandle, useRecordField } from '@wcpos/query';
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
import {
	useCollectionQueryHandle,
	useDrawnHandle,
	useQuerySnapshot,
	useQueryState,
	useQueryStateActions,
} from '../../../query';

import type { SnapshotFields } from '../../../query';
import type { Row, Table } from '../../../table-types';
import type { DataTableFeatures } from '../components/data-table';

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
		<ListRow
			testID={`products-row-${record.uuid}`}
			// `aria-*`, not `accessibilityState`: react-native-web drops the latter, so the web build
			// lost the expanded state of a variable product.
			aria-disabled={!variable && !editable}
			aria-expanded={variable ? !!expanded : undefined}
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
			leading={
				<Image
					source={{ uri: error || !uri ? PRODUCT_IMAGE_PLACEHOLDER : uri }}
					recyclingKey={record.uuid}
					className="size-10 rounded"
				/>
			}
			trailing={
				<>
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
				</>
			}
		>
			<Text decodeHtml numberOfLines={1}>
				{variation ? resolveVariationName(product) : product.name}
			</Text>
			<Text className="text-muted-foreground text-sm" numberOfLines={1}>
				{product.sku}
			</Text>
		</ListRow>
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
	const handle = useCollectionQueryHandle('variations', state, {
		remoteIds: ids.map(remoteIdOrNull).filter((id) => id !== null),
	});
	// The expansion's handle, not a later one: the refresh runs once per expansion.
	const initialHandle = React.useRef(handle);
	React.useEffect(() => {
		// Same expansion refresh and row-scoped cleanup as the shared inline variations view.
		void initialHandle.current.sync().catch(() => undefined);
		return () => {
			actions.clearSearch();
			actions.resetFilters();
		};
	}, [actions]);
	return (
		<View>
			<VariationsFilterBar row={row} />
			{/* A failed variations read stays inside the row: past here it would reach the products
			    list's boundary, replace the whole list, retry the products handle (which has not
			    failed) and remount the list collapsed. A changed query clears it on its own. */}
			<ErrorBoundary onReset={() => handle.retry()} resetKeys={[handle]}>
				<Suspense>
					<VariationRows handle={handle} parent={row.original.record} stockStatus={stockStatus} />
				</Suspense>
			</ErrorBoundary>
		</View>
	);
}
// The rows re-render for the answer only; the footer reads its own fields.
const ANSWER_ONLY: SnapshotFields = [];

function VariationRows({
	handle,
	parent,
	stockStatus,
}: {
	handle: QueryHandle;
	parent: EngineRecord<'products'>;
	stockStatus?: string;
}) {
	// A changed search keeps the current variations while the new handle answers.
	const shown = useDrawnHandle(handle);
	const { result } = useQuerySnapshot(shown, ANSWER_ONLY);
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
			<VariationTableFooter handle={handle} shown={shown} parent={parent} count={hits.length} />
		</View>
	);
}
