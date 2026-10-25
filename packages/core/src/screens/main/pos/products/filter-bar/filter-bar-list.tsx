import * as React from 'react';
import { View } from 'react-native';

import { DragHandle, SortableList } from '@wcpos/components/dnd';
import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { Switch } from '@wcpos/components/switch';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { describeQuickFilter, getFilterPillIcon, normalizeFilterBar } from './filter-bar-layout';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useT } from '../../../../../contexts/translations';

import type { FilterBarItem, QuickFilter } from './filter-bar-layout';

export function FilterBarList({ onEdit }: { onEdit: (quickFilter: QuickFilter | null) => void }) {
	const { uiSettings, getUILabel, patchUI, modifyUI } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const t = useT();
	const { format: formatPrice } = useCurrencyFormat();
	const save = (filterBar: FilterBarItem[]) => void patchUI({ filterBar } as never);

	const renderItem = (item: FilterBarItem) => (
		<ListRow
			key={item.id}
			size={item.type === 'pill' ? 'sm' : 'default'}
			testID={item.type === 'quick' ? `filter-bar-edit-${item.id}` : undefined}
			onPress={item.type === 'quick' ? () => onEdit(item) : undefined}
			leading={
				<>
					<DragHandle className="mr-2">
						<View testID={`filter-bar-drag-${item.id}`}>
							<Icon name="dragHandleVertical" size="xs" className="cursor-grab" />
						</View>
					</DragHandle>
					{item.type === 'pill' && <Icon name={getFilterPillIcon(item.id)} />}
				</>
			}
			trailing={
				item.type === 'pill' ? (
					<Switch
						testID={`filter-bar-toggle-${item.id}`}
						checked={item.show}
						onCheckedChange={(show) =>
							void modifyUI(
								'filterBar',
								(old) =>
									normalizeFilterBar(old).map((entry) =>
										entry.id === item.id ? { ...entry, show } : entry
									) as never
							)
						}
					/>
				) : (
					<Icon name="chevronRight" className="text-muted-foreground" />
				)
			}
		>
			<Text numberOfLines={1}>{item.type === 'pill' ? getUILabel(item.id) : item.label}</Text>
			{item.type === 'quick' && (
				<Text numberOfLines={1} className="text-muted-foreground text-sm">
					{describeQuickFilter(item, t, formatPrice)}
				</Text>
			)}
		</ListRow>
	);

	return (
		<VStack>
			<Text className="text-muted-foreground text-sm">{t('pos_products.filter_bar_hint')}</Text>
			<SortableList
				listId="filter-bar"
				items={items}
				getItemId={(item) => item.id}
				renderItem={renderItem}
				onOrderChange={({ items: reordered }) => save(reordered)}
			/>
			<ListRow
				size="sm"
				leading={<Icon name="plus" className="text-primary" />}
				testID="filter-bar-add-quick-filter"
				onPress={() => onEdit(null)}
			>
				<Text className="text-primary font-medium">{t('pos_products.add_quick_filter')}</Text>
			</ListRow>
		</VStack>
	);
}
