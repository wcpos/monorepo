import * as React from 'react';
import { View } from 'react-native';

import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';

import { FilterBarList } from './filter-bar-list';
import { normalizeFilterBar } from './filter-bar-layout';
import { QuickFilterEditor } from './quick-filter-editor';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';

import type { QuickFilter } from './filter-bar-layout';

type Editing = { mode: 'new' } | { mode: 'edit'; quickFilter: QuickFilter } | null;

export function FilterBarModal() {
	const t = useT();
	const { modifyUI } = useUISettings('pos-products');
	const [editing, setEditing] = React.useState<Editing>(null);
	const handleSave = (quickFilter: QuickFilter) => {
		void modifyUI('filterBar', (old) => {
			const items = normalizeFilterBar(old);
			return (
				items.some((item) => item.id === quickFilter.id)
					? items.map((item) => (item.id === quickFilter.id ? quickFilter : item))
					: [...items, quickFilter]
			) as never;
		});
		setEditing(null);
	};

	return (
		<Dialog route>
			<DialogContent size="2xl">
				<DialogHeader>
					<DialogTitle>{t('common.filter_bar')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<View className="flex-col gap-4 md:flex-row">
						<View className="md:w-2/5">
							<FilterBarList
								onEdit={(quickFilter) => {
									setEditing(quickFilter ? { mode: 'edit', quickFilter } : { mode: 'new' });
								}}
								onDelete={(quickFilter) => {
									setEditing((value) =>
										value?.mode === 'edit' && value.quickFilter.id === quickFilter.id ? null : value
									);
								}}
							/>
						</View>
						<View className="border-border md:flex-1 md:border-l md:pl-4">
							{editing ? (
								<QuickFilterEditor
									key={editing.mode === 'new' ? 'new' : editing.quickFilter.id}
									initial={editing.mode === 'edit' ? editing.quickFilter : null}
									onChange={
										editing.mode === 'edit'
											? (quickFilter) =>
													modifyUI(
														'filterBar',
														(old) =>
															normalizeFilterBar(old).map((item) =>
																item.id === quickFilter.id ? quickFilter : item
															) as never
													)
											: undefined
									}
									onSave={handleSave}
									onCancel={() => setEditing(null)}
								/>
							) : (
								<Text className="text-muted-foreground">
									{t('pos_products.quick_filter_editor_hint')}
								</Text>
							)}
						</View>
					</View>
				</DialogBody>
				<DialogFooter>
					<DialogClose testID="filter-bar-modal-close">{t('common.close')}</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
