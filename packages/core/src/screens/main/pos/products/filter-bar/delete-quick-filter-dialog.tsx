import * as React from 'react';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';

import { normalizeFilterBar, type QuickFilter } from './filter-bar-layout';
import { useUISettings } from '../../../contexts/ui-settings';
import { useT } from '../../../../../contexts/translations';

export function DeleteQuickFilterDialog({
	quickFilter,
	onClose,
}: {
	quickFilter: QuickFilter | null;
	onClose: () => void;
}) {
	const t = useT();
	const { modifyUI } = useUISettings('pos-products');
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
								void modifyUI(
									'filterBar',
									(old) =>
										normalizeFilterBar(old).filter((item) => item.id !== quickFilter.id) as never
								);
							}
							onClose();
						},
					}}
				/>
			</AlertDialogContent>
		</AlertDialog>
	);
}
