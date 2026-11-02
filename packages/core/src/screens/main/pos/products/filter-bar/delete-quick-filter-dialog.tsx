import * as React from 'react';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';

import { type QuickFilter } from './filter-bar-layout';
import { useFilterBarCommands } from './use-filter-bar-commands';
import { useT } from '../../../../../contexts/translations';

export function DeleteQuickFilterDialog({
	quickFilter,
	onClose,
	onConfirm,
}: {
	quickFilter: QuickFilter | null;
	onClose: () => void;
	onConfirm?: () => void;
}) {
	const t = useT();
	const { dropQuickFilter } = useFilterBarCommands();
	return (
		<AlertDialog open={!!quickFilter} onOpenChange={(open) => !open && onClose()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{t('pos_products.delete_quick_filter')}</AlertDialogTitle>
					<AlertDialogDescription>
						{t('pos_products.delete_quick_filter_description')}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter
					cancel={{ testID: 'filter-bar-delete-cancel' }}
					confirm={{
						label: t('common.delete'),
						destructive: true,
						testID: 'filter-bar-delete-confirm',
						onPress: () => {
							if (quickFilter) {
								onConfirm?.();
								void dropQuickFilter(quickFilter.id);
							}
							onClose();
						},
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
