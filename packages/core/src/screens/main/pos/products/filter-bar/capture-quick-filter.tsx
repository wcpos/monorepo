import * as React from 'react';

import { Checkbox } from '@wcpos/components/checkbox';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Input } from '@wcpos/components/input';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { conditionWords, describeCondition, getNamedOrderLabel } from './filter-bar-layout';
import { createQuickFilterId } from './quick-filter-id';
import { CONDITION_FIELDS, KIND_ICONS, TermSummary } from './quick-filter-editor';
import { QuickFilterBarPreview } from './quick-filter-bar-preview';
import { QuickFilterPreview } from './quick-filter-preview';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

import type { captureQuickFilter } from './apply-quick-filter';
import type { QuickFilter, QuickFilterCondition } from './filter-bar-layout';

export function CaptureQuickFilter({
	captured,
	onDraftChange,
}: {
	captured: ReturnType<typeof captureQuickFilter>;
	onDraftChange: (draft: QuickFilter) => void;
}) {
	const t = useT();
	const words = conditionWords(t);
	const { format } = useCurrencyFormat();
	const [draft, setDraft] = React.useState<QuickFilter>(() => ({
		id: createQuickFilterId(),
		type: 'quick',
		label: '',
		conditions: captured.conditions.filter((condition) => condition.field !== 'search'),
	}));
	const change = (next: QuickFilter) => {
		setDraft(next);
		onDraftChange(next);
	};
	const line = (
		field: QuickFilterCondition['field'] | 'sort',
		checked: boolean,
		body: React.ReactNode,
		toggle: () => void
	) => (
		<ListRow
			key={field}
			size="sm"
			testID={`quick-filter-capture-${field}`}
			onPress={toggle}
			role="checkbox"
			aria-checked={checked}
			accessibilityRole="checkbox"
			accessibilityState={{ checked }}
			leading={
				<HStack
					className="items-center"
					pointerEvents="none"
					aria-hidden
					accessibilityElementsHidden
				>
					<Checkbox checked={checked} onCheckedChange={toggle} tabIndex={-1} />
					<Icon name={field === 'sort' ? 'arrowDown' : KIND_ICONS[field]} />
				</HStack>
			}
		>
			<Text className={field === 'sort' ? 'text-muted-foreground' : undefined}>{body}</Text>
		</ListRow>
	);
	return (
		<VStack className="gap-4">
			<VStack className="gap-1">
				<Text>{t('pos_products.quick_filter_button_name')}</Text>
				<Input
					value={draft.label}
					onChangeText={(label) => change({ ...draft, label })}
					autoFocus
					placeholder={t('pos_products.quick_filter_name_placeholder')}
					testID="quick-filter-name"
				/>
			</VStack>
			<QuickFilterBarPreview draft={draft} />
			<VStack className="gap-0">
				<Text className="font-medium">{t('pos_products.capture_keeps')}</Text>
				{CONDITION_FIELDS.flatMap((field) => {
					const condition = captured.conditions.find((entry) => entry.field === field);
					if (!condition) return [];
					const checked = draft.conditions.some((entry) => entry.field === field);
					const body =
						condition.field === 'categories' ||
						condition.field === 'tags' ||
						condition.field === 'brands' ? (
							<>
								{words.kind[condition.field]}:{' '}
								<TermSummary taxonomy={condition.field} ids={condition.value} />
							</>
						) : (
							describeCondition(condition, t, format)
						);
					return [
						line(field, checked, body, () =>
							change({
								...draft,
								conditions: checked
									? draft.conditions.filter((entry) => entry.field !== field)
									: [...draft.conditions, condition],
							})
						),
					];
				})}
				{captured.sort &&
					line(
						'sort',
						!!draft.sort,
						t('pos_products.capture_ordered_by', { order: getNamedOrderLabel(captured.sort, t) }),
						() => change({ ...draft, sort: draft.sort ? undefined : captured.sort })
					)}
			</VStack>
			<QuickFilterPreview draft={draft} />
		</VStack>
	);
}
