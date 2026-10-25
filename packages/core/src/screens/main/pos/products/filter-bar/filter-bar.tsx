import * as React from 'react';
import { type ScrollViewInstance, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useObservableSuspense } from 'observable-hooks';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { IconButton } from '@wcpos/components/icon-button';
import { useIsPhone } from '@wcpos/components/lib/device';
import { Icon } from '@wcpos/components/icon';
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
import { Skeleton } from '@wcpos/components/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { Text } from '@wcpos/components/text';
import { Suspense } from '@wcpos/components/suspense';
import { useDocField } from '@wcpos/query';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import { useEngineRecordsByWooId } from '@wcpos/query/record-readers';
import type { FiltersOf } from '@wcpos/query/query-state';

import { useFilterBarCommands } from './use-filter-bar-commands';
import { useT } from '../../../../../contexts/translations';
import { useQueryState, useQueryStateActions } from '../../../../../query';
import { ChipRow } from '../../../components/chip-row';
import { useUISettings } from '../../../contexts/ui-settings';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { TagSearch } from '../../../components/product/tag-select';
import { BrandSearch } from '../../../components/product/brand-select';
import {
	type FilterBarItem,
	getFilterPillIcon,
	normalizeFilterBar,
	type QuickFilter,
} from '../filter-bar/filter-bar-layout';
import {
	captureQuickFilter,
	isQuickFilterActive,
	quickFilterToQueryPatch,
} from '../filter-bar/apply-quick-filter';
import { clearConditions, isPlaceCondition, type LevelPlace } from '../browse/level-place';
import { DeleteQuickFilterDialog } from './delete-quick-filter-dialog';
import { getPOSProductSort } from '../pos-product-sort';

function BarSlot({
	item,
	dimmed,
	touched,
	onLayout,
	onRemove,
	resetState,
}: {
	item: FilterBarItem;
	dimmed: boolean;
	touched: () => void;
	onLayout: React.ComponentProps<typeof View>['onLayout'];
	onRemove: (item: QuickFilter) => void;
	resetState: Parameters<typeof isQuickFilterActive>[2];
}) {
	const t = useT();
	const router = useRouter();
	const { showPill } = useFilterBarCommands();
	const triggerRef = React.useRef<React.ComponentRef<typeof DropdownMenuTrigger>>(null);
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const onLongPress = () => triggerRef.current?.open?.();
	// A dimmed chip opens nothing: it is the tooltip's trigger itself (one pressable, no
	// menu around it; a trigger wrapping a chip renders a button inside a button on web).
	const content = dimmed ? (
		<DimmedChip item={item} />
	) : item.type === 'quick' ? (
		<QuickChip
			quickFilter={item}
			touched={touched}
			onLongPress={onLongPress}
			resetState={resetState}
		/>
	) : item.id === 'stock_status' ? (
		<StockChip touched={touched} onLongPress={onLongPress} />
	) : item.id === 'featured' || item.id === 'on_sale' ? (
		<Chip
			label={item.id === 'featured' ? t('common.featured') : t('common.on_sale')}
			icon={item.id === 'featured' ? 'featured' : 'currency'}
			on={!!state.filters[item.id]}
			dimmed={dimmed}
			testID={`filter-pill-${item.id}`}
			onLongPress={onLongPress}
			onPress={() => {
				const field = item.id as 'featured' | 'on_sale';
				if (state.filters[field]) actions.clearFilter(field);
				else actions.setFilter(field, true);
				touched();
			}}
		/>
	) : (
		// The chip reads its records before it can draw: it holds a chip's frame
		// meanwhile, so the chips beside it never shift.
		<Suspense fallback={<Skeleton shape="chip" />}>
			<SetChip field={item.id} dimmed={dimmed} touched={touched} onLongPress={onLongPress} />
		</Suspense>
	);
	if (dimmed)
		return (
			<View onLayout={onLayout}>
				<Tooltip>
					<TooltipTrigger asChild>{content}</TooltipTrigger>
					<TooltipContent>
						<Text>{t('pos_products.product_filter_not_in_variations')}</Text>
					</TooltipContent>
				</Tooltip>
			</View>
		);
	return (
		<View onLayout={onLayout}>
			<DropdownMenu>
				{content}
				<DropdownMenuTrigger
					ref={triggerRef}
					tabIndex={-1}
					aria-hidden
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				/>
				<DropdownMenuContent onCloseAutoFocus={(event) => event.preventDefault()}>
					{item.type === 'quick' ? (
						<>
							<DropdownMenuItem
								testID={`filter-bar-menu-edit-${item.id}`}
								onPress={() => router.push(`/(app)/(modals)/filter-bar?edit=${item.id}`)}
							>
								<Icon name="edit" />
								<Text>{t('pos_products.edit_quick_filter', { label: item.label })}</Text>
							</DropdownMenuItem>
						</>
					) : (
						<DropdownMenuItem
							testID={`filter-bar-menu-hide-${item.id}`}
							onPress={() => {
								const baselineValue = resetState.filters[item.id];
								if (JSON.stringify(state.filters[item.id]) !== JSON.stringify(baselineValue)) {
									if (baselineValue !== undefined) actions.setFilter(item.id, baselineValue);
									else actions.clearFilter(item.id);
								}
								void showPill(item.id, false);
							}}
						>
							<Icon name="hide" />
							<Text>{t('pos_products.hide_from_bar')}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						testID={`filter-bar-menu-customize-${item.id}`}
						onPress={() => router.push('/(app)/(modals)/filter-bar')}
					>
						<Icon name="filters" />
						<Text>{t('pos_products.customize_filter_bar')}</Text>
					</DropdownMenuItem>
					{item.type === 'quick' && (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								testID={`filter-bar-menu-remove-${item.id}`}
								variant="destructive"
								onPress={() => onRemove(item)}
							>
								<Icon name="delete" />
								<Text>{t('pos_products.remove_from_bar')}</Text>
							</DropdownMenuItem>
						</>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</View>
	);
}

function QuickChip({
	resetState,
	quickFilter,
	touched,
	onLongPress,
}: {
	quickFilter: QuickFilter;
	resetState: Parameters<typeof isQuickFilterActive>[2];
	touched: () => void;
	onLongPress?: () => void;
}) {
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const settingsSort = resetState.sort;
	const active = isQuickFilterActive(quickFilter, state, resetState);
	return (
		<Chip
			testID={`quick-filter-${quickFilter.id}`}
			onLongPress={onLongPress}
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
	onLongPress,
	field,
	dimmed,
	touched,
}: {
	field: 'categories' | 'tags' | 'brands';
	onLongPress?: () => void;
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
			icon="category"
			on={ids.length > 0}
			count={ids.length > 1 ? ids.length - 1 : undefined}
			dimmed={dimmed}
			testID={`filter-pill-${field}`}
			onLongPress={onLongPress}
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
function StockChip({ touched, onLongPress }: { touched: () => void; onLongPress?: () => void }) {
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
					icon="warehouse"
					on={!!selected}
					testID="filter-pill-stock_status"
					onLongPress={onLongPress}
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
	const icon = getFilterPillIcon(item.id);
	return <Chip testID={`filter-pill-${item.id}`} label={label} icon={icon} on={on} dimmed />;
}
export function POSFilterBar({
	level = 'products',
	initialFilters = { status: 'publish' },
	place = null,
}: {
	level?: 'products' | 'variations';
	/**
	 * The query's baseline filters (published, and in stock unless the setting shows
	 * out-of-stock). A group counts as "on" only when it differs from this baseline, so the
	 * hidden in-stock default never makes Clear all appear after a single chip.
	 */
	initialFilters?: Partial<FiltersOf<'products'>>;
	/**
	 * The place a browse level's crumb owns while one is open (a Categories level, a shortcut).
	 * The crumb is the place and the pills are the conditions, so the source's own pill folds
	 * away rather than saying the place a second time, the place's own conditions are not groups
	 * for Clear all, and Clear all leaves them — the level stays, its conditions go.
	 */
	place?: LevelPlace | null;
}) {
	const { uiSettings } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const state = useQueryState<'products'>();
	const actions = useQueryStateActions<'products'>();
	const t = useT();
	const router = useRouter();
	const isPhone = useIsPhone();
	const settingsSort = useDocField(uiSettings, (value) =>
		getPOSProductSort(value.sortBy, value.sortDirection)
	);
	const resetState = {
		filters: { categories: [], tags: [], brands: [], ...initialFilters },
		sort: settingsSort,
	};
	const capture = () =>
		router.push({
			pathname: '/(app)/(modals)/filter-bar',
			params: { capture: JSON.stringify(captureQuickFilter(state, initialFilters, settingsSort)) },
		});
	const scroll = React.useRef<ScrollViewInstance>(null);
	const positions = React.useRef(new Map<string, number>());
	const [deleting, setDeleting] = React.useState<QuickFilter | null>(null);
	const active = Object.entries(state.filters).filter(([key, value]) => {
		if (isPlaceCondition(place, key, value)) return false;
		const set = Array.isArray(value) ? value.length > 0 : !!value;
		return (
			set &&
			JSON.stringify(value) !== JSON.stringify(initialFilters[key as keyof typeof initialFilters])
		);
	}).length;
	return (
		<ChipRow ref={scroll}>
			{items.map((item) => {
				if (item.type === 'pill' && (!item.show || item.id === place?.field)) return null;
				const touched = () =>
					scroll.current?.scrollTo({ x: positions.current.get(item.id) ?? 0, animated: false });
				const dimmed = level === 'variations' && item.id !== 'stock_status';
				return (
					<BarSlot
						key={item.id}
						item={item}
						resetState={resetState}
						dimmed={dimmed}
						touched={touched}
						onLayout={(event) => positions.current.set(item.id, event.nativeEvent.layout.x)}
						onRemove={setDeleting}
					/>
				);
			})}
			{active >= 2 && (
				<Button
					variant="ghost"
					size="sm"
					testID="filter-bar-clear-all"
					onPress={() => clearConditions(actions, state.filters, place)}
				>
					<ButtonText>{t('pos_products.clear_all')}</ButtonText>
				</Button>
			)}
			{active >= 1 &&
				(isPhone ? (
					<IconButton
						name="bookmark"
						accessibilityLabel={t('pos_products.save_as_button')}
						testID="filter-bar-save-as-button"
						onPress={capture}
					/>
				) : (
					<Button
						variant="ghost"
						size="sm"
						leftIcon="bookmark"
						testID="filter-bar-save-as-button"
						onPress={capture}
					>
						<ButtonText>{t('pos_products.save_as_button')}</ButtonText>
					</Button>
				))}
			<DeleteQuickFilterDialog
				quickFilter={deleting}
				onClose={() => setDeleting(null)}
				onConfirm={() => {
					if (deleting && isQuickFilterActive(deleting, state, resetState)) {
						actions.resetFilters();
						actions.clearSearch();
						actions.setSort(settingsSort.field, settingsSort.direction);
					}
				}}
			/>
		</ChipRow>
	);
}
