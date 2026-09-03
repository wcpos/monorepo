import * as React from 'react';
import { View } from 'react-native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button, ButtonText } from '@wcpos/components/button';
import { DragHandle, SortableList } from '@wcpos/components/dnd';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Switch } from '@wcpos/components/switch';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { describeQuickFilter, normalizeFilterBar } from './filter-bar-layout';
import { useUISettings } from '../../../contexts/ui-settings';
import { useT } from '../../../../../contexts/translations';

import type { FilterBarItem, QuickFilter } from './filter-bar-layout';

export function FilterBarList({ onEdit }: { onEdit: (quickFilter: QuickFilter | null) => void }) {
	const { uiSettings, getUILabel, patchUI } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const [deleting, setDeleting] = React.useState<QuickFilter | null>(null);
	const t = useT();
	const save = (filterBar: FilterBarItem[]) => void patchUI({ filterBar } as never);

	const renderItem = (item: FilterBarItem) => (
		<HStack key={item.id} className="web:hover:shadow-md items-center rounded p-2">
			<DragHandle className="mr-2">
				<View testID={`filter-bar-drag-${item.id}`}>
					<Icon name="gripLinesVertical" size="xs" className="cursor-grab" />
				</View>
			</DragHandle>
			{item.type === 'pill' ? (
				<>
					<Text className="flex-1">{getUILabel(item.id)}</Text>
					<Switch
						testID={`filter-bar-toggle-${item.id}`}
						checked={item.show}
						onCheckedChange={(show) =>
							save(items.map((entry) => (entry.id === item.id ? { ...item, show } : entry)))
						}
					/>
				</>
			) : (
				<>
					<VStack className="flex-1 gap-0">
						<Text>{item.label}</Text>
						<Text numberOfLines={1} className="text-muted-foreground text-sm">
							{describeQuickFilter(item, t)}
						</Text>
					</VStack>
					<IconButton
						name="penToSquare"
						testID={`filter-bar-edit-${item.id}`}
						onPress={() => onEdit(item)}
					/>
					<IconButton
						name="trash"
						variant="destructive"
						testID={`filter-bar-delete-${item.id}`}
						onPress={() => setDeleting(item)}
					/>
				</>
			)}
		</HStack>
	);

	return (
		<VStack>
			<SortableList
				listId="filter-bar"
				items={items}
				getItemId={(item) => item.id}
				renderItem={renderItem}
				onOrderChange={({ items: reordered }) => save(reordered)}
			/>
			<Button variant="outline" testID="filter-bar-add-quick-filter" onPress={() => onEdit(null)}>
				<ButtonText>{t('pos_products.add_quick_filter')}</ButtonText>
			</Button>
			<AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('pos_products.delete_quick_filter')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('pos_products.delete_quick_filter_description')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel testID="filter-bar-delete-cancel">
							{t('common.cancel')}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID="filter-bar-delete-confirm"
							onPress={() => {
								if (deleting) save(items.filter((item) => item.id !== deleting.id));
								setDeleting(null);
							}}
						>
							{t('common.delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</VStack>
	);
}
