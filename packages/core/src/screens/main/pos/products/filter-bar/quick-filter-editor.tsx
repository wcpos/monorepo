import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { decode } from 'html-entities';
import { useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Chip } from '@wcpos/components/chip';
// The deep path on purpose: the form barrel pulls the combobox into this jsdom-tested editor.
import { SavedFieldProvider, SavedMark, useMarkSaved } from '@wcpos/components/form/saved-mark';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Input } from '@wcpos/components/input';
import { ListRow } from '@wcpos/components/list-row';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import { VStack } from '@wcpos/components/vstack';
import type { Option } from '@wcpos/components/combobox/types';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { EngineRecord } from '@wcpos/query';
import { useEngineRecordsByWooId } from '@wcpos/query/record-readers';

import {
	createQuickFilterId,
	getQuickFilterSortLabel,
	isQuickFilterValid,
	SORT_FIELD_VALUES,
} from './filter-bar-layout';
import { DeleteQuickFilterDialog } from './delete-quick-filter-dialog';
import { QuickFilterPreview } from './quick-filter-preview';
import { CurrencyInput } from '../../../components/currency-input';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { BrandSelect } from '../../../components/product/brand-select';
import { TagSelect } from '../../../components/product/tag-select';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';
import { useT } from '../../../../../contexts/translations';

import type { QuickFilter, QuickFilterCondition } from './filter-bar-layout';
import type { ObservableResource } from 'observable-hooks';

type ConditionField = QuickFilterCondition['field'];
type ChangeCondition = (condition: QuickFilterCondition) => void;

const CONDITION_FIELDS: ConditionField[] = [
	'categories',
	'tags',
	'brands',
	'price',
	'on_sale',
	'featured',
	'stock_status',
	'type',
	'search',
];

/**
 * The "Default order" option's value. Radix Select (web) rejects an empty-string item value,
 * and no sort field is spelled this way, so it cannot collide with a real field.
 */
const DEFAULT_ORDER = 'default';

/**
 * A cleared, unparsable, or zero price input means "no bound".
 *
 * Zero is folded into "no bound" on purpose: the shared NumberInput emits 0 for a field
 * the cashier cleared, so a stored 0 would be a bound nobody meant (a max of 0 matches
 * nothing).
 */
const priceBound = (value: number): number | undefined =>
	Number.isFinite(value) && value !== 0 ? value : undefined;

const FIELD_LABEL_KEYS: Record<ConditionField, string> = {
	categories: 'common.category',
	tags: 'common.tag',
	brands: 'common.brand',
	price: 'common.price',
	on_sale: 'common.on_sale',
	featured: 'common.featured',
	stock_status: 'common.stock_status',
	type: 'common.type',
	search: 'common.search',
};

function createCondition(field: ConditionField): QuickFilterCondition {
	switch (field) {
		case 'categories':
		case 'tags':
		case 'brands':
			return { field, value: [] };
		case 'price':
			return { field, value: {} };
		case 'on_sale':
		case 'featured':
			return { field, value: true };
		case 'stock_status':
			return { field, value: 'instock' };
		case 'type':
			return { field, value: 'simple' };
		case 'search':
			return { field, value: '' };
	}
}

function CategoryValueEditor({
	condition,
	onChange,
}: {
	condition: Extract<QuickFilterCondition, { field: 'categories' }>;
	onChange: ChangeCondition;
}) {
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);
	const t = useT();
	const selected = condition.value.map((id) => {
		const option = options.find((entry) => entry.value === String(id));
		return { value: String(id), label: option?.label ?? t('common.loading') };
	});
	const names = selected
		.filter((option) => option.label !== t('common.loading'))
		.map((option) => option.label);

	return (
		<TreeCombobox
			options={options}
			multiple
			value={selected}
			onValueChange={(value: Option[]) =>
				onChange({ field: 'categories', value: value.map((option) => toNumber(option.value)) })
			}
		>
			<TreeComboboxTrigger asChild>
				<Button variant="outline" testID="quick-filter-categories" className="flex-1">
					<ButtonText decodeHtml>
						{names.length > 0 ? names.join(', ') : t('pos_products.quick_filter_choose_categories')}
					</ButtonText>
				</Button>
			</TreeComboboxTrigger>
			<TreeComboboxContent
				searchPlaceholder={t('common.search_categories')}
				emptyMessage={t('common.no_category_found')}
			>
				<CategoryTreeLoader onOptionsLoaded={setOptions} />
			</TreeComboboxContent>
		</TreeCombobox>
	);
}

function TermChips<C extends 'tags' | 'brands'>({
	resource,
	ids,
	onRemove,
}: {
	resource: ObservableResource<EngineRecord<C>[]>;
	ids: number[];
	onRemove: (id: number) => void;
}) {
	const t = useT();
	const records = useObservableSuspense(resource);
	return (
		<HStack className="flex-wrap">
			{ids.map((id) => {
				const record = records.find((entry) => entry.payload.id === id);
				return (
					<Chip
						key={id}
						label={decode(record?.payload.name ?? String(id))}
						// The whole chip removes the term, as the button it replaced did; the label
						// half is never a focusable button that does nothing.
						onPress={() => onRemove(id)}
						onClear={() => onRemove(id)}
						clearLabel={t('common.remove')}
						clearTestID={`quick-filter-term-remove-${id}`}
					/>
				);
			})}
		</HStack>
	);
}

function TermValueEditor<C extends 'tags' | 'brands'>({
	taxonomy,
	ids,
	onChange,
}: {
	taxonomy: C;
	ids: number[];
	onChange: (ids: number[]) => void;
}) {
	const resource = useEngineRecordsByWooId(taxonomy, ids);
	const handlePick = (option: Option | undefined) => {
		if (!option) return;
		const id = toNumber(option.value);
		if (!ids.includes(id)) onChange([...ids, id]);
	};
	return (
		<VStack className="flex-1 gap-1">
			<Suspense>
				<TermChips
					resource={resource}
					ids={ids}
					onRemove={(id) => onChange(ids.filter((value) => value !== id))}
				/>
			</Suspense>
			{taxonomy === 'tags' ? (
				<TagSelect onValueChange={handlePick} />
			) : (
				<BrandSelect onValueChange={handlePick} />
			)}
		</VStack>
	);
}

function SimpleSelect({
	value,
	items,
	testID,
	onChange,
}: {
	value: string;
	items: { value: string; label: string }[];
	testID: string;
	onChange: (value: string) => void;
}) {
	const selected = items.find((item) => item.value === value);
	return (
		<Select value={selected} onValueChange={(option) => option && onChange(option.value)}>
			<SelectTrigger testID={testID} className="flex-1">
				<SelectValue placeholder={selected?.label ?? ''} />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map((item) => (
						<SelectItem key={item.value} {...item} testID={`${testID}-option-${item.value}`} />
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}

function ConditionValueEditor({
	condition,
	onChange,
}: {
	condition: QuickFilterCondition;
	onChange: ChangeCondition;
}) {
	const t = useT();
	const { items: stockStatuses } = useStockStatusLabel();
	if (condition.field === 'categories')
		return <CategoryValueEditor condition={condition} onChange={onChange} />;
	if (condition.field === 'tags' || condition.field === 'brands') {
		return (
			<TermValueEditor
				taxonomy={condition.field}
				ids={condition.value}
				onChange={(value) => onChange({ field: condition.field, value })}
			/>
		);
	}
	if (condition.field === 'price') {
		return (
			<HStack className="flex-1 items-end">
				<VStack className="flex-1 gap-1">
					<Text>{t('pos_products.quick_filter_min')}</Text>
					<CurrencyInput
						value={condition.value.min}
						onChangeText={(min) =>
							onChange({ field: 'price', value: { ...condition.value, min: priceBound(min) } })
						}
						testID="quick-filter-price-min"
					/>
				</VStack>
				<VStack className="flex-1 gap-1">
					<Text>{t('pos_products.quick_filter_max')}</Text>
					<CurrencyInput
						value={condition.value.max}
						onChangeText={(max) =>
							onChange({ field: 'price', value: { ...condition.value, max: priceBound(max) } })
						}
						testID="quick-filter-price-max"
					/>
				</VStack>
			</HStack>
		);
	}
	if (condition.field === 'on_sale' || condition.field === 'featured') {
		return (
			<SegmentedControl
				value={condition.value ? 'yes' : 'no'}
				testID={`quick-filter-toggle-${condition.field}`}
				onValueChange={(value) =>
					value && onChange({ field: condition.field, value: value === 'yes' })
				}
				segments={
					[
						{
							value: 'yes',
							label: t('common.yes'),
							testID: `quick-filter-toggle-${condition.field}-yes`,
						},
						{
							value: 'no',
							label: t('common.no'),
							testID: `quick-filter-toggle-${condition.field}-no`,
						},
					] satisfies [Segment, Segment]
				}
			/>
		);
	}
	if (condition.field === 'stock_status') {
		return (
			<SimpleSelect
				value={condition.value}
				items={stockStatuses}
				testID="quick-filter-stock-status"
				onChange={(value) =>
					onChange({ field: 'stock_status', value: value as typeof condition.value })
				}
			/>
		);
	}
	if (condition.field === 'type') {
		const items = ['simple', 'variable', 'grouped', 'external'].map((value) => ({
			value,
			label: t(`common.${value}`),
		}));
		return (
			<SimpleSelect
				value={condition.value}
				items={items}
				testID="quick-filter-product-type"
				onChange={(value) => onChange({ field: 'type', value: value as typeof condition.value })}
			/>
		);
	}
	return (
		<Input
			value={condition.value}
			onChangeText={(value) => onChange({ field: 'search', value })}
			placeholder={t('pos_products.quick_filter_search_placeholder')}
			testID="quick-filter-search-term"
			className="flex-1"
		/>
	);
}

export function QuickFilterEditor(props: React.ComponentProps<typeof QuickFilterEditorBody>) {
	return (
		<SavedFieldProvider>
			<QuickFilterEditorBody {...props} />
		</SavedFieldProvider>
	);
}

function QuickFilterEditorBody({
	initial,
	onDraftChange,
	flushRef,
	onChange,
}: {
	initial: QuickFilter | null;
	onDraftChange?: (draft: QuickFilter) => void;
	flushRef?: React.Ref<() => void>;
	onChange?: (quickFilter: QuickFilter) => void | Promise<unknown>;
}) {
	const t = useT();
	const [draft, setDraft] = React.useState<QuickFilter>(
		() => initial ?? { id: createQuickFilterId(), type: 'quick', label: '', conditions: [] }
	);
	const [deleting, setDeleting] = React.useState(false);
	const markSaved = useMarkSaved();
	const pending = React.useRef<{
		timer: ReturnType<typeof setTimeout>;
		write: () => Promise<void>;
	} | null>(null);
	const flush = React.useCallback(() => {
		const queued = pending.current;
		if (!queued) return;
		clearTimeout(queued.timer);
		pending.current = null;
		void queued.write();
	}, []);
	React.useImperativeHandle(flushRef, () => flush, [flush]);
	// Closing the host must land the pending text edit, even without pressing Close.
	React.useEffect(() => flush, [flush]);
	const updateDraft = (update: (value: QuickFilter) => QuickFilter, text = false) => {
		const next = update(draft);
		setDraft(next);
		onDraftChange?.(next);
		if (!initial || !onChange) return;
		// An edit that leaves the draft invalid is held, not written; the valid edit still pending
		// (a rename before an unfinished condition) lands now rather than being dropped with it.
		if (!isQuickFilterValid(next)) {
			flush();
			return;
		}
		if (pending.current) clearTimeout(pending.current.timer);
		pending.current = null;
		const section =
			next.label !== draft.label
				? 'label'
				: next.conditions !== draft.conditions
					? 'conditions'
					: 'sort';
		const write = async () => {
			try {
				await onChange({ ...next, label: next.label.trim() });
				markSaved([section]);
			} catch {
				// patchSettings has reported it; the section is simply not marked saved.
			}
		};
		if (text) pending.current = { timer: setTimeout(flush, 300), write };
		else void write();
	};
	const usedFields = draft.conditions.map((condition) => condition.field);
	const firstUnused = CONDITION_FIELDS.find((field) => !usedFields.includes(field));
	const updateCondition = (index: number, condition: QuickFilterCondition, text = false) =>
		updateDraft(
			(value) => ({
				...value,
				conditions: value.conditions.map((entry, row) => (row === index ? condition : entry)),
			}),
			text
		);

	return (
		<VStack className="gap-4">
			<VStack className="gap-1">
				<HStack className="justify-between">
					<Text>{t('pos_products.quick_filter_button_name')}</Text>
					<SavedMark name="label" label={t('settings.saved')} />
				</HStack>
				<Input
					value={draft.label}
					onChangeText={(label) => updateDraft((value) => ({ ...value, label }), true)}
					placeholder={t('pos_products.quick_filter_name_placeholder')}
					testID="quick-filter-name"
				/>
			</VStack>
			<VStack className="gap-2">
				<HStack className="justify-between">
					<Text className="font-medium">{t('pos_products.quick_filter_conditions_heading')}</Text>
					<SavedMark name="conditions" label={t('settings.saved')} />
				</HStack>
				{draft.conditions.map((condition, index) => (
					<React.Fragment key={`${index}-${condition.field}`}>
						{index > 0 && (
							<Text className="text-muted-foreground">{t('pos_products.quick_filter_and')}</Text>
						)}
						<HStack className="items-center">
							<Select
								value={{ value: condition.field, label: t(FIELD_LABEL_KEYS[condition.field]) }}
								onValueChange={(option) =>
									option && updateCondition(index, createCondition(option.value as ConditionField))
								}
							>
								<SelectTrigger testID={`quick-filter-condition-field-${index}`} className="w-40">
									<SelectValue placeholder={t(FIELD_LABEL_KEYS[condition.field])} />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{CONDITION_FIELDS.filter(
											(field) => field === condition.field || !usedFields.includes(field)
										).map((field) => (
											<SelectItem
												key={field}
												value={field}
												label={t(FIELD_LABEL_KEYS[field])}
												testID={`quick-filter-condition-option-${index}-${field}`}
											/>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
							<ConditionValueEditor
								condition={condition}
								onChange={(value) => updateCondition(index, value, value.field === 'search')}
							/>
							<IconButton
								name="close"
								accessibilityLabel={t('common.remove')}
								testID={`quick-filter-condition-remove-${index}`}
								onPress={() =>
									updateDraft((value) => ({
										...value,
										conditions: value.conditions.filter((_, row) => row !== index),
									}))
								}
							/>
						</HStack>
					</React.Fragment>
				))}
				<Button
					variant="outline"
					size="sm"
					testID="quick-filter-add-condition"
					disabled={!firstUnused}
					onPress={() =>
						firstUnused &&
						updateDraft((value) => ({
							...value,
							conditions: [...value.conditions, createCondition(firstUnused)],
						}))
					}
				>
					<ButtonText>{t('pos_products.quick_filter_add_condition')}</ButtonText>
				</Button>
			</VStack>
			<VStack className="gap-2">
				<HStack className="justify-between">
					<Text className="font-medium">{t('pos_products.quick_filter_order_by')}</Text>
					<SavedMark name="sort" label={t('settings.saved')} />
				</HStack>
				<Select
					value={
						draft.sort
							? { value: draft.sort.field, label: getQuickFilterSortLabel(draft.sort.field, t) }
							: { value: DEFAULT_ORDER, label: t('pos_products.quick_filter_default_order') }
					}
					onValueChange={(option) =>
						updateDraft((value) => ({
							...value,
							sort:
								option?.value && option.value !== DEFAULT_ORDER
									? {
											field: option.value as NonNullable<QuickFilter['sort']>['field'],
											direction: value.sort?.direction ?? 'asc',
										}
									: undefined,
						}))
					}
				>
					<SelectTrigger testID="quick-filter-sort-field">
						<SelectValue placeholder={t('pos_products.quick_filter_default_order')} />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem
								value={DEFAULT_ORDER}
								label={t('pos_products.quick_filter_default_order')}
								testID="quick-filter-sort-option-default"
							/>
							{SORT_FIELD_VALUES.map((field) => (
								<SelectItem
									key={field}
									value={field}
									label={getQuickFilterSortLabel(field, t)}
									testID={`quick-filter-sort-option-${field}`}
								/>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
				{draft.sort && (
					<SegmentedControl
						value={draft.sort.direction}
						testID="quick-filter-sort-direction"
						onValueChange={(direction) =>
							direction &&
							updateDraft((value) =>
								value.sort
									? { ...value, sort: { ...value.sort, direction: direction as 'asc' | 'desc' } }
									: value
							)
						}
						segments={
							[
								{
									value: 'asc',
									label: t('common.ascending'),
									testID: 'quick-filter-sort-direction-asc',
								},
								{
									value: 'desc',
									label: t('common.descending'),
									testID: 'quick-filter-sort-direction-desc',
								},
							] satisfies [Segment, Segment]
						}
					/>
				)}
			</VStack>
			<QuickFilterPreview draft={draft} />
			{initial && (
				<>
					<ListRow
						size="sm"
						testID={`filter-bar-delete-${initial.id}`}
						onPress={() => setDeleting(true)}
					>
						<Text className="text-destructive font-medium">
							{t('pos_products.remove_from_bar')}
						</Text>
					</ListRow>
					<DeleteQuickFilterDialog
						quickFilter={deleting ? initial : null}
						onClose={() => setDeleting(false)}
					/>
				</>
			)}
		</VStack>
	);
}
