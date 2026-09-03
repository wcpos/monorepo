import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { Input } from '@wcpos/components/input';
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
import { ToggleGroup, ToggleGroupItem } from '@wcpos/components/toggle-group';
import {
	TreeCombobox,
	TreeComboboxContent,
	TreeComboboxTrigger,
} from '@wcpos/components/tree-combobox';
import { VStack } from '@wcpos/components/vstack';
import type { Option } from '@wcpos/components/combobox/types';
import type { HierarchicalOption } from '@wcpos/components/lib/use-hierarchy';
import type { EngineRecord } from '@wcpos/query';

import {
	createQuickFilterId,
	getQuickFilterSortLabel,
	isQuickFilterValid,
	SORT_FIELD_VALUES,
} from './filter-bar-layout';
import { QuickFilterPreview } from './quick-filter-preview';
import { CurrencyInput } from '../../../components/currency-input';
import { CategoryTreeLoader } from '../../../components/product/category-select';
import { BrandSelect } from '../../../components/product/brand-select';
import { TagSelect } from '../../../components/product/tag-select';
import { useEngineRecordsByWooId } from '../../../hooks/use-engine-document';
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
 * Zero is folded into "no bound" on purpose: the shared NumberInput renders a numeric 0 as an
 * empty field, and on web its numpad returns 0 when Done is pressed without typing — so a
 * stored 0 would be an invisible bound (a max of 0 matches nothing).
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
	const records = useObservableSuspense(resource);
	return (
		<HStack className="flex-wrap">
			{ids.map((id) => {
				const record = records.find((entry) => entry.payload.id === id);
				return (
					<Button
						key={id}
						variant="muted"
						size="xs"
						rightIcon="xmark"
						testID={`quick-filter-term-remove-${id}`}
						onPress={() => onRemove(id)}
					>
						<ButtonText decodeHtml>{record?.payload.name ?? String(id)}</ButtonText>
					</Button>
				);
			})}
		</HStack>
	);
}

function TermValueEditor<C extends 'tags' | 'brands'>({
	collection,
	ids,
	onChange,
}: {
	collection: C;
	ids: number[];
	onChange: (ids: number[]) => void;
}) {
	const resource = useEngineRecordsByWooId(collection, ids);
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
			{collection === 'tags' ? (
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
				collection={condition.field}
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
			<ToggleGroup
				type="single"
				value={condition.value ? 'yes' : 'no'}
				testID={`quick-filter-toggle-${condition.field}`}
				onValueChange={(value) =>
					value && onChange({ field: condition.field, value: value === 'yes' })
				}
			>
				<ToggleGroupItem value="yes" testID={`quick-filter-toggle-${condition.field}-yes`}>
					<Text>{t('common.yes')}</Text>
				</ToggleGroupItem>
				<ToggleGroupItem value="no" testID={`quick-filter-toggle-${condition.field}-no`}>
					<Text>{t('common.no')}</Text>
				</ToggleGroupItem>
			</ToggleGroup>
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

export function QuickFilterEditor({
	initial,
	onSave,
	onCancel,
}: {
	initial: QuickFilter | null;
	onSave: (quickFilter: QuickFilter) => void;
	onCancel: () => void;
}) {
	const t = useT();
	const [draft, setDraft] = React.useState<QuickFilter>(
		() => initial ?? { id: createQuickFilterId(), type: 'quick', label: '', conditions: [] }
	);
	const usedFields = draft.conditions.map((condition) => condition.field);
	const firstUnused = CONDITION_FIELDS.find((field) => !usedFields.includes(field));
	const updateCondition = (index: number, condition: QuickFilterCondition) =>
		setDraft((value) => ({
			...value,
			conditions: value.conditions.map((entry, row) => (row === index ? condition : entry)),
		}));

	return (
		<VStack className="gap-4">
			<VStack className="gap-1">
				<Text>{t('pos_products.quick_filter_button_name')}</Text>
				<Input
					value={draft.label}
					onChangeText={(label) => setDraft((value) => ({ ...value, label }))}
					placeholder={t('pos_products.quick_filter_name_placeholder')}
					testID="quick-filter-name"
				/>
			</VStack>
			<VStack className="gap-2">
				<Text className="font-medium">{t('pos_products.quick_filter_conditions_heading')}</Text>
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
								onChange={(value) => updateCondition(index, value)}
							/>
							<IconButton
								name="xmark"
								testID={`quick-filter-condition-remove-${index}`}
								onPress={() =>
									setDraft((value) => ({
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
						setDraft((value) => ({
							...value,
							conditions: [...value.conditions, createCondition(firstUnused)],
						}))
					}
				>
					<ButtonText>{t('pos_products.quick_filter_add_condition')}</ButtonText>
				</Button>
			</VStack>
			<VStack className="gap-2">
				<Text className="font-medium">{t('pos_products.quick_filter_order_by')}</Text>
				<Select
					value={
						draft.sort
							? { value: draft.sort.field, label: getQuickFilterSortLabel(draft.sort.field, t) }
							: { value: DEFAULT_ORDER, label: t('pos_products.quick_filter_default_order') }
					}
					onValueChange={(option) =>
						setDraft((value) => ({
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
					<ToggleGroup
						type="single"
						value={draft.sort.direction}
						testID="quick-filter-sort-direction"
						onValueChange={(direction) =>
							direction &&
							setDraft((value) =>
								value.sort
									? { ...value, sort: { ...value.sort, direction: direction as 'asc' | 'desc' } }
									: value
							)
						}
					>
						<ToggleGroupItem value="asc" testID="quick-filter-sort-direction-asc">
							<Text>{t('common.ascending')}</Text>
						</ToggleGroupItem>
						<ToggleGroupItem value="desc" testID="quick-filter-sort-direction-desc">
							<Text>{t('common.descending')}</Text>
						</ToggleGroupItem>
					</ToggleGroup>
				)}
			</VStack>
			<QuickFilterPreview draft={draft} />
			<HStack className="justify-end">
				<Button variant="outline" testID="quick-filter-cancel" onPress={onCancel}>
					<ButtonText>{t('common.cancel')}</ButtonText>
				</Button>
				<Button
					testID="quick-filter-save"
					disabled={!isQuickFilterValid(draft)}
					onPress={() => onSave({ ...draft, label: draft.label.trim() })}
				>
					<ButtonText>{t('common.save')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
