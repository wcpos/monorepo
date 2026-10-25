import * as React from 'react';

import { useLocalSearchParams } from 'expo-router';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { HStack } from '@wcpos/components/hstack';
import { IconButton } from '@wcpos/components/icon-button';
import { PaneStack } from '@wcpos/components/pane-stack';
import { useDocField } from '@wcpos/query';

import { FilterBarList } from './filter-bar-list';
import { normalizeFilterBar } from './filter-bar-layout';
import { usePanelSide } from '../../contexts/overlay-side';
import { QuickFilterEditor } from './quick-filter-editor';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';

import type { QuickFilter } from './filter-bar-layout';

type Editing = { mode: 'new' } | { mode: 'edit'; quickFilter: QuickFilter } | null;

export function FilterBarModal() {
	const t = useT();
	const { uiSettings, modifyUI } = useUISettings('pos-products');
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const side = usePanelSide('products');
	const params = useLocalSearchParams<{ edit?: string; new?: string }>();
	const [editing, setEditing] = React.useState<Editing>(() => {
		if (params.new === '1') return { mode: 'new' };
		const quickFilter = items.find((item) => item.type === 'quick' && item.id === params.edit);
		return quickFilter?.type === 'quick' ? { mode: 'edit', quickFilter } : null;
	});
	const [draft, setDraft] = React.useState<QuickFilter | null>(null);
	const [valid, setValid] = React.useState(false);
	const flushRef = React.useRef<() => void>(null);
	if (editing?.mode === 'edit' && !items.some((item) => item.id === editing.quickFilter.id))
		setEditing(null);
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
			<DialogContent side={side} size="lg">
				<DialogHeader>
					<HStack className="items-center">
						{editing && (
							<IconButton
								name="chevronLeft"
								accessibilityLabel={t('common.back')}
								testID="filter-bar-back"
								onPress={() => {
									flushRef.current?.();
									setEditing(null);
								}}
							/>
						)}
						<DialogTitle>
							{editing
								? editing.mode === 'edit'
									? editing.quickFilter.label
									: t('pos_products.new_quick_filter')
								: t('common.filter_bar')}
						</DialogTitle>
					</HStack>
				</DialogHeader>
				<PaneStack
					detail={editing}
					paneClassName="bg-card"
					renderDetail={(detail) => (
						<DialogBody>
							<QuickFilterEditor
								key={detail.mode === 'new' ? 'new' : detail.quickFilter.id}
								initial={detail.mode === 'edit' ? detail.quickFilter : null}
								flushRef={flushRef}
								onDraftChange={(value, isValid) => {
									setDraft(value);
									setValid(isValid);
								}}
								onChange={
									detail.mode === 'edit'
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
								onDelete={() => setEditing(null)}
							/>
						</DialogBody>
					)}
				>
					<DialogBody>
						<FilterBarList
							onEdit={(quickFilter) => {
								setDraft(null);
								setValid(false);
								setEditing(quickFilter ? { mode: 'edit', quickFilter } : { mode: 'new' });
							}}
						/>
					</DialogBody>
				</PaneStack>
				<DialogFooter
					close={{ testID: 'filter-bar-modal-close' }}
					intent={
						editing?.mode === 'new'
							? {
									label: t('pos_products.add_to_bar'),
									testID: 'quick-filter-add',
									disabled: !valid,
									onPress: () => {
										flushRef.current?.();
										if (draft && valid) handleSave({ ...draft, label: draft.label.trim() });
									},
								}
							: undefined
					}
				/>
			</DialogContent>
		</Dialog>
	);
}
