import * as React from 'react';

import { useRouter } from 'expo-router';

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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

const syncLogger = getLogger(['wcpos', 'products', 'variation-actions', 'sync']);

/**
 *
 */
export function VariationActions({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) {
	const variation = row.original.document;
	const parentRow = row.getParentRow()!;
	const parent = (parentRow.original as { document: { name: string } }).document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const router = useRouter();
	const t = useT();
	const manager = useQueryManager();
	const { readOnly } = useProAccess();

	const handleRefresh = React.useCallback(() => {
		if (!variation.id) return;
		const handle = manager.engine.require({
			id: `variation-actions:refresh:${variation.id}`,
			collection: 'variations',
			kind: 'targeted-records',
			wooIds: [variation.id],
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh variation', {
					showToast: true,
					saveToDb: true,
					context: {
						variationId: variation.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
	}, [manager, variation.id]);

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		await manager.engine.write({
			collection: 'variations',
			operation: 'delete',
			recordId: variation.uuid!,
		});
	}, [manager, variation.uuid]);

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger testID="variation-actions-menu">
					<Icon name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() =>
							router.push({
								pathname: `/(app)/(drawer)/products/(modals)/edit/variation/${variation.uuid}`,
							})
						}
					>
						<Icon name="penToSquare" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					{variation.id && (
						<DropdownMenuItem onPress={handleRefresh}>
							<Icon name="arrowRotateRight" />
							<Text>{t('common.sync')}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('common.delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('products.delete', {
								product: `${parent.name} - ${variation.name}`,
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t('products.are_you_sure_you_want_to_2')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleDelete}>
							{t('common.delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
