import * as React from 'react';

import { useLocalSearchParams, useRouter } from 'expo-router';

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

import { CaptureQuickFilter } from './capture-quick-filter';
import { useFilterBarCommands } from './use-filter-bar-commands';
import { FilterBarList } from './filter-bar-list';
import { createQuickFilterId, isQuickFilterValid, normalizeFilterBar } from './filter-bar-layout';
import { usePanelSide } from '../../contexts/overlay-side';
import { QuickFilterEditor } from './quick-filter-editor';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';

import type { captureQuickFilter } from './apply-quick-filter';
import type { QuickFilter } from './filter-bar-layout';

type Editing =
	| { mode: 'new'; key: string }
	| { mode: 'edit'; quickFilter: QuickFilter }
	| { mode: 'capture'; captured: ReturnType<typeof captureQuickFilter> }
	| null;

export function FilterBarModal() {
	const t = useT();
	const { uiSettings } = useUISettings('pos-products');
	const { changeQuickFilter, addQuickFilter } = useFilterBarCommands();
	const router = useRouter();
	const items = normalizeFilterBar(useDocField(uiSettings, (value) => value.filterBar));
	const side = usePanelSide('products');
	const params = useLocalSearchParams<{ edit?: string; capture?: string }>();
	const [editing, setEditing] = React.useState<Editing>(() => {
		if (params.capture) {
			try {
				return { mode: 'capture', captured: JSON.parse(params.capture) };
			} catch {
				return null;
			}
		}
		const quickFilter = items.find((item) => item.type === 'quick' && item.id === params.edit);
		return quickFilter?.type === 'quick' ? { mode: 'edit', quickFilter } : null;
	});
	const [draft, setDraft] = React.useState<QuickFilter | null>(null);
	const valid = draft !== null && isQuickFilterValid(draft);
	const flushRef = React.useRef<() => void>(null);
	if (editing?.mode === 'edit' && !items.some((item) => item.id === editing.quickFilter.id))
		setEditing(null);
	const handleSave = (quickFilter: QuickFilter) => {
		void addQuickFilter(quickFilter);
		if (editing?.mode === 'capture') router.back();
		else setEditing(null);
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
									? (items.find(
											(item): item is QuickFilter =>
												item.type === 'quick' && item.id === editing.quickFilter.id
										)?.label ?? editing.quickFilter.label)
									: t(
											editing.mode === 'capture'
												? 'pos_products.save_as_button'
												: 'pos_products.new_quick_filter'
										)
								: t('common.filter_bar')}
						</DialogTitle>
					</HStack>
				</DialogHeader>
				<PaneStack
					detail={editing}
					paneClassName="bg-card"
					renderDetail={(detail) => (
						<DialogBody>
							{detail.mode === 'capture' ? (
								<CaptureQuickFilter captured={detail.captured} onDraftChange={setDraft} />
							) : (
								<QuickFilterEditor
									key={detail.mode === 'new' ? detail.key : detail.quickFilter.id}
									initial={detail.mode === 'edit' ? detail.quickFilter : null}
									flushRef={flushRef}
									onDraftChange={setDraft}
									onChange={detail.mode === 'edit' ? changeQuickFilter : undefined}
								/>
							)}
						</DialogBody>
					)}
				>
					<DialogBody>
						<FilterBarList
							onEdit={(quickFilter) => {
								setDraft(null);
								setEditing(
									quickFilter
										? { mode: 'edit', quickFilter }
										: { mode: 'new', key: createQuickFilterId() }
								);
							}}
						/>
					</DialogBody>
				</PaneStack>
				<DialogFooter
					close={{ testID: 'filter-bar-modal-close' }}
					intent={
						editing?.mode === 'new' || editing?.mode === 'capture'
							? {
									label: t('pos_products.add_to_bar'),
									testID: 'quick-filter-add',
									disabled: !valid,
									onPress: () => {
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
