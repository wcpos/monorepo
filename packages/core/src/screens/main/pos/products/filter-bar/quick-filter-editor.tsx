import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { decode } from 'html-entities';
import { useObservableSuspense } from 'observable-hooks';

import { Chip } from '@wcpos/components/chip';
// The deep path on purpose: the form barrel pulls the combobox into this jsdom-tested editor.
import { SavedFieldProvider, SavedMark, useMarkSaved } from '@wcpos/components/form/saved-mark';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Input } from '@wcpos/components/input';
import { ListRow } from '@wcpos/components/list-row';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectPrimitiveTrigger,
} from '@wcpos/components/select';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import { VStack } from '@wcpos/components/vstack';
import type { Option } from '@wcpos/components/combobox/types';
import type { HierarchicalOption } from '@wcpos/components/tree-combobox';
import type { EngineRecord } from '@wcpos/query';
import { useEngineRecordsByWooId } from '@wcpos/query/record-readers';

import {
	conditionWords,
	getNamedOrderLabel,
	isQuickFilterValid,
	NAMED_ORDERS,
} from './filter-bar-layout';
import { createQuickFilterId } from './quick-filter-id';
import { DeleteQuickFilterDialog } from './delete-quick-filter-dialog';
import { QUICK_FILTER_STARTERS } from './quick-filter-starters';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { QuickFilterBarPreview } from './quick-filter-bar-preview';
import { QuickFilterPreview } from './quick-filter-preview';
import { AmountField } from '../../../components/amount-field';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { CollectionSelect } from '../../../components/product/collection-search';
import { useStockStatusLabel } from '../../../hooks/use-stock-status-label';
import { useT } from '../../../../../contexts/translations';

import type { QuickFilter, QuickFilterCondition } from './filter-bar-layout';
import type { ObservableResource } from 'observable-hooks';

type ConditionField = QuickFilterCondition['field'];
type ChangeCondition = (condition: QuickFilterCondition) => void;

export const CONDITION_FIELDS: ConditionField[] = [
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
 * Zero is folded into "no bound" on purpose: the shared AmountField commits 0 for a field
 * the cashier cleared, so a stored 0 would be a bound nobody meant (a max of 0 matches
 * nothing).
 */
const priceBound = (value: number): number | undefined =>
	Number.isFinite(value) && value !== 0 ? value : undefined;

export const KIND_ICONS = {
	categories: 'category',
	tags: 'tag',
	brands: 'category',
	price: 'currency',
	on_sale: 'currency',
	featured: 'featured',
	stock_status: 'warehouse',
	type: 'viewGrid',
	search: 'search',
} as const;

function hasConditionValue(condition: QuickFilterCondition): boolean {
	if (Array.isArray(condition.value)) return condition.value.length > 0;
	if (condition.field === 'price')
		return condition.value.min !== undefined || condition.value.max !== undefined;
	if (condition.field === 'search') return condition.value.trim() !== '';
	return true;
}

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
	children,
}: {
	condition: Extract<QuickFilterCondition, { field: 'categories' }>;
	children: React.ReactElement;
	onChange: ChangeCondition;
}) {
	const [options, setOptions] = React.useState<HierarchicalOption[]>([]);
	const t = useT();
	const selected = condition.value.map((id) => {
		const option = options.find((entry) => entry.value === String(id));
		return { value: String(id), label: option?.label ?? t('common.loading') };
	});

	return (
		<TreeCombobox
			options={options}
			multiple
			value={selected}
			onValueChange={(value: Option[]) =>
				onChange({ field: 'categories', value: value.map((option) => toNumber(option.value)) })
			}
		>
			<TreeComboboxTrigger asChild>{children}</TreeComboboxTrigger>
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
			<CollectionSelect
				collection={taxonomy === 'tags' ? 'tag' : 'brand'}
				onValueChange={handlePick}
			/>
		</VStack>
	);
}

function TermNames<C extends 'categories' | 'tags' | 'brands'>({
	resource,
	ids,
}: {
	resource: ObservableResource<EngineRecord<C>[]>;
	ids: number[];
}) {
	const t = useT();
	const records = useObservableSuspense(resource);
	return ids
		.map((id) =>
			decode(records.find((entry) => entry.payload.id === id)?.payload.name ?? t('common.loading'))
		)
		.join(', ');
}

export function TermSummary({
	taxonomy,
	ids,
}: {
	taxonomy: 'categories' | 'tags' | 'brands';
	ids: number[];
}) {
	const t = useT();
	const resource = useEngineRecordsByWooId(taxonomy, ids);
	return (
		<Suspense fallback={t('common.loading')}>
			<TermNames resource={resource} ids={ids} />
		</Suspense>
	);
}

function SimpleSelect({
	children,
	value,
	items,
	testID,
	onChange,
}: {
	children: React.ReactElement;
	value: string;
	items: { value: string; label: string }[];
	testID: string;
	onChange: (value: string) => void;
}) {
	const selected = items.find((item) => item.value === value) ?? { value, label: '' };
	return (
		<Select value={selected} onValueChange={(option) => option && onChange(option.value)}>
			<SelectPrimitiveTrigger asChild>{children}</SelectPrimitiveTrigger>
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
					<AmountField
						kind="money"
						value={condition.value.min}
						onCommit={(min) =>
							onChange({ field: 'price', value: { ...condition.value, min: priceBound(min) } })
						}
						testID="quick-filter-price-min"
					/>
				</VStack>
				<VStack className="flex-1 gap-1">
					<Text>{t('pos_products.quick_filter_max')}</Text>
					<AmountField
						kind="money"
						value={condition.value.max}
						onCommit={(max) =>
							onChange({ field: 'price', value: { ...condition.value, max: priceBound(max) } })
						}
						testID="quick-filter-price-max"
					/>
				</VStack>
			</HStack>
		);
	}
	if (condition.field !== 'search') return null;

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

function ConditionRow({
	field,
	condition,
	waiting,
	expanded,
	onToggle,
	onChange,
}: {
	field: ConditionField;
	condition?: QuickFilterCondition;
	waiting: boolean;
	expanded: boolean;
	onToggle: () => void;
	onChange: (condition?: QuickFilterCondition) => void;
}) {
	const t = useT();
	const { format } = useCurrencyFormat();
	const { items: stockStatuses } = useStockStatusLabel();
	const words = conditionWords(t);
	const set = !!condition && hasConditionValue(condition);
	let summary: React.ReactNode =
		field === 'price'
			? t('pos_products.kind_value_any_price')
			: field === 'on_sale' || field === 'featured'
				? t('pos_products.kind_value_either')
				: field === 'search'
					? t('pos_products.kind_value_nothing_typed')
					: t('pos_products.kind_value_any');
	if (set && condition) {
		if (
			condition.field === 'categories' ||
			condition.field === 'tags' ||
			condition.field === 'brands'
		) {
			summary = <TermSummary taxonomy={condition.field} ids={condition.value} />;
		} else if (condition.field === 'price') {
			const { min, max } = condition.value;
			summary =
				min !== undefined && max !== undefined
					? t('pos_products.kind_price_between', { min: format(min), max: format(max) })
					: min !== undefined
						? t('pos_products.kind_price_from', { min: format(min) })
						: t('pos_products.kind_price_up_to', { max: format(max!) });
		} else if (condition.field === 'on_sale' || condition.field === 'featured') {
			summary = condition.value ? t('common.yes') : t('common.no');
		} else if (condition.field === 'stock_status') {
			summary = stockStatuses.find((item) => item.value === condition.value)?.label;
		} else if (condition.field === 'type') summary = words.value[condition.value];
		else summary = `“${condition.value}”`;
	}
	const inline = field === 'tags' || field === 'brands' || field === 'price' || field === 'search';
	const row = (
		<ListRow
			size="sm"
			testID={`quick-filter-row-${field}`}
			className={waiting ? 'bg-muted' : undefined}
			leading={<Icon name={KIND_ICONS[field]} />}
			onPress={inline ? onToggle : undefined}
			trailing={
				<HStack className="max-w-[55%] items-center gap-2">
					<Text
						numberOfLines={1}
						className={
							waiting
								? 'text-primary shrink'
								: set
									? 'text-foreground shrink font-medium'
									: 'text-muted-foreground shrink'
						}
					>
						{waiting ? t('pos_products.kind_value_choose') : summary}
					</Text>
					<Icon
						name={expanded ? 'chevronDown' : 'chevronRight'}
						className="text-muted-foreground"
					/>
				</HStack>
			}
		>
			<Text>{words.kind[field]}</Text>
		</ListRow>
	);
	const change = (next: QuickFilterCondition) =>
		onChange(hasConditionValue(next) ? next : undefined);
	if (field === 'categories')
		return (
			<CategoryValueEditor
				condition={
					(condition as Extract<QuickFilterCondition, { field: 'categories' }>) ?? {
						field,
						value: [],
					}
				}
				onChange={change}
			>
				{row}
			</CategoryValueEditor>
		);
	if (inline)
		return (
			<>
				{row}
				{expanded && (
					<VStack className="border-border border-b px-3 py-2">
						<ConditionValueEditor
							condition={condition ?? createCondition(field)}
							onChange={change}
						/>
					</VStack>
				)}
			</>
		);
	const boolean = field === 'on_sale' || field === 'featured';
	const unset = boolean ? 'either' : 'any';
	const items = boolean
		? [
				{ value: 'yes', label: t('common.yes') },
				{ value: 'no', label: t('common.no') },
				{ value: unset, label: t('pos_products.kind_value_either') },
			]
		: [
				{ value: unset, label: t('pos_products.kind_value_any') },
				...(field === 'stock_status'
					? stockStatuses
					: ['simple', 'variable', 'grouped', 'external'].map((value) => ({
							value,
							label: words.value[value],
						}))),
			];
	return (
		<SimpleSelect
			value={
				condition ? (boolean ? (condition.value ? 'yes' : 'no') : String(condition.value)) : unset
			}
			items={items}
			testID={`quick-filter-${field === 'stock_status' ? 'stock-status' : field}`}
			onChange={(value) =>
				onChange(
					value === unset
						? undefined
						: ({
								...createCondition(field),
								value: boolean ? value === 'yes' : value,
							} as QuickFilterCondition)
				)
			}
		>
			{row}
		</SimpleSelect>
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
	const [started, setStarted] = React.useState(false);
	const [waiting, setWaiting] = React.useState<ConditionField>();
	const [expanded, setExpanded] = React.useState<ConditionField>();
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
	const updateCondition = (field: ConditionField, condition?: QuickFilterCondition) => {
		if (condition && waiting === field) setWaiting(undefined);
		updateDraft(
			(value) => ({
				...value,
				conditions: condition
					? value.conditions.some((entry) => entry.field === field)
						? value.conditions.map((entry) => (entry.field === field ? condition : entry))
						: [...value.conditions, condition]
					: value.conditions.filter((entry) => entry.field !== field),
			}),
			field === 'search'
		);
	};
	if (!initial && !started && !draft.label && !draft.conditions.length && !draft.sort)
		return (
			<VStack className="gap-2">
				<Text className="text-muted-foreground">{t('pos_products.starters_hint')}</Text>
				{QUICK_FILTER_STARTERS.map((starter) => (
					<ListRow
						key={starter.id}
						testID={`quick-filter-starter-${starter.id}`}
						leading={<Icon name={starter.icon} />}
						trailing={<Icon name="chevronRight" className="text-muted-foreground" />}
						onPress={() => {
							setStarted(true);
							setWaiting(starter.waiting);
							updateDraft((value) => ({
								...value,
								label: starter.sort ? starter.title(t) : '',
								conditions: starter.conditions,
								sort: starter.sort,
							}));
						}}
					>
						<Text>{starter.title(t)}</Text>
						<Text className="text-muted-foreground text-sm">{starter.line(t)}</Text>
					</ListRow>
				))}
				<ListRow
					size="sm"
					testID="quick-filter-start-scratch"
					leading={<Icon name="plus" className="text-primary" />}
					onPress={() => setStarted(true)}
				>
					<Text className="text-primary font-medium">{t('pos_products.start_from_scratch')}</Text>
				</ListRow>
			</VStack>
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
			<QuickFilterBarPreview draft={draft} />
			<VStack className="gap-2">
				<HStack className="justify-between">
					<Text className="font-medium">{t('pos_products.quick_filter_conditions_heading')}</Text>
					<SavedMark name="conditions" label={t('settings.saved')} />
				</HStack>
				<VStack className="gap-0">
					{CONDITION_FIELDS.map((field) => (
						<ConditionRow
							key={field}
							field={field}
							condition={draft.conditions.find((condition) => condition.field === field)}
							waiting={waiting === field}
							expanded={expanded === field}
							onToggle={() => setExpanded(expanded === field ? undefined : field)}
							onChange={(condition) => updateCondition(field, condition)}
						/>
					))}
				</VStack>
			</VStack>
			<VStack className="gap-2">
				<HStack className="justify-between">
					<Text className="font-medium">{t('pos_products.then')}</Text>
					<SavedMark name="sort" label={t('settings.saved')} />
				</HStack>
				<SimpleSelect
					value={draft.sort ? `${draft.sort.field}-${draft.sort.direction}` : DEFAULT_ORDER}
					items={NAMED_ORDERS.map((order) => ({ value: order.value, label: order.label(t) }))}
					testID="quick-filter-sort"
					onChange={(selected) =>
						updateDraft((value) => ({
							...value,
							sort: NAMED_ORDERS.find((order) => order.value === selected)?.sort,
						}))
					}
				>
					<ListRow
						size="sm"
						testID="quick-filter-sort-field"
						leading={<Icon name="arrowDown" />}
						trailing={
							<HStack className="max-w-[55%] items-center gap-2">
								<Text
									numberOfLines={1}
									className={
										draft.sort
											? 'text-foreground shrink font-medium'
											: 'text-muted-foreground shrink'
									}
								>
									{getNamedOrderLabel(draft.sort, t)}
								</Text>
								<Icon name="chevronRight" className="text-muted-foreground" />
							</HStack>
						}
					>
						<Text>{t('pos_products.quick_filter_order_by')}</Text>
					</ListRow>
				</SimpleSelect>
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
