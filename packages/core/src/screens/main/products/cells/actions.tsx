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
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { useQueryManager } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { useProAccess } from '../../contexts/pro-access';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

const syncLogger = getLogger(['wcpos', 'products', 'actions', 'sync']);

export function Actions({ row }: CellContext<{ document: ProductDocument }, 'actions'>) {
	const router = useRouter();
	const product = row.original.document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const manager = useQueryManager();
	const { readOnly } = useProAccess();

	const handleRefresh = React.useCallback(() => {
		if (!product.id) return;
		const handle = manager.engine.require({
			id: `product-actions:refresh:${product.id}`,
			collection: 'products',
			kind: 'targeted-records',
			wooIds: [product.id],
			forceRefresh: true,
		});
		void handle.ready
			.finally(() => handle.release())
			.catch((error) => {
				syncLogger.error('Failed to refresh product', {
					showToast: true,
					saveToDb: true,
					context: {
						productId: product.id,
						error: error instanceof Error ? error.message : String(error),
					},
				});
			});
	}, [manager, product.id]);

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		await manager.engine.write({
			collection: 'products',
			operation: 'delete',
			recordId: product.uuid!,
		});
	}, [manager, product.uuid]);

	if (readOnly) {
		return null;
	}

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="ellipsisVertical" testID="product-actions-button" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() => {
							router.push({
								pathname: `/(app)/(drawer)/products/(modals)/edit/product/${product.uuid}`,
							});
						}}
					>
						<Icon name="penToSquare" />
						<Text>{t('common.edit')}</Text>
					</DropdownMenuItem>
					{product.id && (
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
						<AlertDialogTitle>{t('products.delete', { product: product.name })}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('products.are_you_sure_you_want_to')}
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
