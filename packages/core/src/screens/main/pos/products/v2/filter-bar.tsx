import * as React from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import { Chip } from '@wcpos/components/chip';
import { Button, ButtonText } from '@wcpos/components/button';
import { Combobox, ComboboxContent, ComboboxTrigger } from '@wcpos/components/combobox';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { Text } from '@wcpos/components/text';
import { Suspense } from '@wcpos/components/suspense';
import { useDocField } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';

import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { useUISettings } from '../../../contexts/ui-settings';
import { useEngineRecordsByWooId } from '../../../hooks/use-engine-document';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { TagSearch } from '../../../components/product/tag-select';
import { BrandSearch } from '../../../components/product/brand-select';
import {
	type FilterBarItem,
	normalizeFilterBar,
	type QuickFilter,
} from '../filter-bar/filter-bar-layout';
import { isQuickFilterActive, quickFilterToQueryPatch } from '../filter-bar/apply-quick-filter';
import { getPOSProductSort } from '../pos-product-sort';

import type { FiltersOf } from '../../../../../query/query-state-types';

function QuickChip({ quickFilter, touched }: { quickFilter: QuickFilter; touched: () => void }) {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const { uiSettings } = useUISettings('pos-products');
	const settingsSort = useDocField(uiSettings, (value) =>
		getPOSProductSort(value.sortBy, value.sortDirection)
	);
	const showOutOfStock = useDocField(uiSettings, (value) => value.showOutOfStock);
	const active = isQuickFilterActive(quickFilter, state, {
		filters: {
			categories: [],
			tags: [],
			brands: [],
			status: 'publish',
			...(showOutOfStock ? {} : { stock_status: 'instock' }),
		},
		sort: settingsSort,
	});
	return (
		<Chip
			testID={`quick-filter-${quickFilter.id}`}
			label={quickFilter.label}
			count={quickFilter.conditions.length}
			on={active}
			onPress={() => {
				touched();
				actions.resetFilters();
				actions.clearSearch();
				if (active) {
					actions.setSort(settingsSort.field, settingsSort.direction);
					return;
				}
				const patch = quickFilterToQueryPatch(quickFilter);
				for (const [field, value] of Object.entries(patch.filters))
					actions.setFilter(field as keyof FiltersOf<'products'>, value as never);
				if (patch.search) actions.setSearch(patch.search);
				const sort = quickFilter.sort ?? settingsSort;
				actions.setSort(sort.field, sort.direction);
			}}
		/>
	);
}

function SetChip({
	field,
	dimmed,
	touched,
}: {
	field: 'categories' | 'tags' | 'brands';
	dimmed: boolean;
	touched: () => void;
}) {
	const ids = useQueryState<'products', number[]>((state) => state.filters[field]);
	const selected = useObservableSuspense(useEngineRecordsByWooId(field, ids));
	const actions = useQueryStateActions<'products'>();
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);
	const t = useT();
	const label =
		field === 'categories'
			? t('common.category')
			: field === 'tags'
				? t('common.tag')
				: t('common.brand');
	const chip = (
		<Chip
			label={selected[0]?.payload.name ?? label}
			icon="folder"
			on={ids.length > 0}
			count={ids.length > 1 ? ids.length - 1 : undefined}
			dimmed={dimmed}
			testID={`filter-pill-${field}`}
			clearTestID={`filter-pill-remove-${field}`}
			clearLabel={t('common.remove')}
			onClear={
				ids.length
					? () => {
							actions.clearFilter(field);
							touched();
						}
					: undefined
			}
			onPress={touched}
		/>
	);
	if (field === 'categories')
		return (
			<TreeCombobox
				options={options}
				multiple
				value={ids.map((id) => ({
					value: String(id),
					label: options.find((o) => o.value === String(id))?.label ?? t('common.loading'),
				}))}
				onValueChange={(selection) => {
					actions.setFilter(
						field,
						selection.map((option) => Number(option.value))
					);
					touched();
				}}
			>
				<TreeComboboxTrigger asChild>{chip}</TreeComboboxTrigger>
				<TreeComboboxContent
					searchPlaceholder={t('common.search_categories')}
					emptyMessage={t('common.no_category_found')}
				>
					<CategoryTreeLoader onOptionsLoaded={setOptions} />
				</TreeComboboxContent>
			</TreeCombobox>
		);
	return (
		<Combobox
			onValueChange={(option) => {
				if (option) {
					actions.setFilter(field, [Number(option.value)]);
					touched();
				}
			}}
		>
			<ComboboxTrigger asChild>{chip}</ComboboxTrigger>
			<ComboboxContent>{field === 'tags' ? <TagSearch /> : <BrandSearch />}</ComboboxContent>
		</Combobox>
	);
}
function StockChip({ touched }: { touched: () => void }) {
	const selected = useQueryState<'products', string | undefined>(
		(state) => state.filters.stock_status
	);
	const actions = useQueryStateActions<'products'>();
	const { items } = useStockStatusLabel();
	const t = useT();
	// NOTE: An empty Option clears Select's previous value; undefined does not.
	const value = items.find((item) => item.value === selected) ?? { value: '', label: '' };
	return (
		<Select
			value={value}
			onValueChange={(option) => {
				if (option) actions.setFilter('stock_status', option.value);
				touched();
			}}
		>
			<SelectPrimitiveTrigger asChild>
				<Chip
					label={value.label || t('common.stock_status')}
					icon="warehouseFull"
					on={!!selected}
					testID="filter-pill-stock_status"
					clearTestID="filter-pill-remove-stock_status"
					clearLabel={t('common.remove')}
					onPress={touched}
					onClear={
						selected
							? () => {
									actions.clearFilter('stock_status');
									touched();
								}
							: undefined
					}
				/>
			</SelectPrimitiveTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} {...item} testID={`stock-status-option-${item.value}`} />
				))}
			</SelectContent>
		</Select>
	);
}
function DimmedChip({ item }: { item: FilterBarItem }) {
	const state = useQueryState<'products'>();
	const t = useT();
	if (item.type === 'quick') {
		return (
			<Chip
				testID={`quick-filter-${item.id}`}
				label={item.label}
				count={item.conditions.length}
				dimmed
			/>
		);
	}
	const value = state.filters[item.id as keyof typeof state.filters] as unknown;
	const on = Array.isArray(value) ? value.length > 0 : !!value;
	const label =
		item.id === 'featured'
			? t('common.featured')
			: item.id === 'on_sale'
				? t('common.on_sale')
				: item.id === 'categories'
					? t('common.category')
					: item.id === 'tags'
						? t('common.tag')
						: item.id === 'brands'
							? t('common.brand')
							: t('common.stock_status');
	const icon =
		item.id === 'featured'
			? 'star'
			: item.id === 'on_sale'
				? 'badgeDollar'
				: item.id === 'stock_status'
					? 'warehouseFull'
					: 'folder';
	return <Chip testID={`filter-pill-${item.id}`} label={label} icon={icon} on={on} dimmed />;
}
export function POSFilterBar({
	level = 'products',
	initialFilters = { status: 'publish' },
}: {
	level?: 'products' | 'variations';
	/**
	 * The query's baseline filters (published, and in stock unless the setting shows
	 * out-of-stock). A group counts as "on" only when it differs from this baseline, so the
	 * hidden in-stock default never makes Clear all appear after a single chip.
	 */
	initialFilters?: Record<string, unknown>;
}) {
	const { uiSettings } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const router = useRouter();
	const scroll = React.useRef<ScrollViewInstance>(null);
	const positions = React.useRef(new Map<string, number>());
	const active = Object.entries(state.filters).filter(([key, value]) => {
		const set = Array.isArray(value) ? value.length > 0 : !!value;
		return set && JSON.stringify(value) !== JSON.stringify(initialFilters[key]);
	}).length;
	return (
		<ScrollView
			ref={scroll}
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerClassName="items-center gap-2"
		>
			{items.map((item) => {
				if (item.type === 'pill' && !item.show) return null;
				const touched = () =>
					scroll.current?.scrollTo({ x: positions.current.get(item.id) ?? 0, animated: false });
				const dimmed = level === 'variations' && item.id !== 'stock_status';
				// A dimmed chip opens nothing: it is the tooltip's trigger itself (one pressable, no
				// menu around it; a trigger wrapping a chip renders a button inside a button on web).
				const content = dimmed ? (
					<DimmedChip item={item} />
				) : item.type === 'quick' ? (
					<QuickChip quickFilter={item} touched={touched} />
				) : item.id === 'stock_status' ? (
					<StockChip touched={touched} />
				) : item.id === 'featured' || item.id === 'on_sale' ? (
					<Chip
						label={item.id === 'featured' ? t('common.featured') : t('common.on_sale')}
						icon={item.id === 'featured' ? 'star' : 'badgeDollar'}
						on={!!state.filters[item.id]}
						dimmed={dimmed}
						testID={`filter-pill-${item.id}`}
						onPress={() => {
							const field = item.id as 'featured' | 'on_sale';
							if (state.filters[field]) actions.clearFilter(field);
							else actions.setFilter(field, true);
							touched();
						}}
					/>
				) : (
					<Suspense>
						<SetChip field={item.id} dimmed={dimmed} touched={touched} />
					</Suspense>
				);
				return (
					<View
						key={item.id}
						onLayout={(event) => positions.current.set(item.id, event.nativeEvent.layout.x)}
					>
						{dimmed ? (
							<Tooltip>
								<TooltipTrigger asChild>{content}</TooltipTrigger>
								<TooltipContent>
									<Text>{t('pos_products.product_filter_not_in_variations')}</Text>
								</TooltipContent>
							</Tooltip>
						) : (
							content
						)}
					</View>
				);
			})}
			<Chip
				add
				label={t('pos_products.customise')}
				testID="filter-bar-customize"
				onPress={() => router.push('/(app)/(modals)/filter-bar')}
			/>
			{active >= 2 && (
				<Button
					variant="ghost"
					size="sm"
					testID="filter-bar-clear-all"
					onPress={() => {
						actions.resetFilters();
						actions.clearSearch();
					}}
				>
					<ButtonText>{t('pos_products.clear_all')}</ButtonText>
				</Button>
			)}
		</ScrollView>
	);
}
