import * as React from 'react';
import { View } from 'react-native';

import {
	Modal,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';

import { FilterBarList } from './filter-bar-list';
import { normalizeFilterBar } from './filter-bar-layout';
import { QuickFilterEditor } from './quick-filter-editor';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';

import type { QuickFilter } from './filter-bar-layout';

type Editing = { mode: 'new' } | { mode: 'edit'; quickFilter: QuickFilter } | null;

export function FilterBarModal() {
	const t = useT();
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const filterBar = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const [editing, setEditing] = React.useState<Editing>(null);
	const handleSave = (quickFilter: QuickFilter) => {
		const exists = filterBar.some((item) => item.id === quickFilter.id);
		const next = exists
			? filterBar.map((item) => (item.id === quickFilter.id ? quickFilter : item))
			: [...filterBar, quickFilter];
		void patchUI({ filterBar: next } as never);
		setEditing(null);
	};

	return (
		<Modal>
			<ModalContent size="2xl">
				<ModalHeader>
					<ModalTitle>{t('common.filter_bar')}</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<View className="flex-col gap-4 md:flex-row">
						<View className="md:w-2/5">
							<FilterBarList
								onEdit={(quickFilter) =>
									setEditing(quickFilter ? { mode: 'edit', quickFilter } : { mode: 'new' })
								}
								onDelete={(quickFilter) =>
									setEditing((value) =>
										value?.mode === 'edit' && value.quickFilter.id === quickFilter.id ? null : value
									)
								}
							/>
						</View>
						<View className="border-border md:flex-1 md:border-l md:pl-4">
							{editing ? (
								<QuickFilterEditor
									key={editing.mode === 'new' ? 'new' : editing.quickFilter.id}
									initial={editing.mode === 'edit' ? editing.quickFilter : null}
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
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="filter-bar-modal-close">{t('common.close')}</ModalClose>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
