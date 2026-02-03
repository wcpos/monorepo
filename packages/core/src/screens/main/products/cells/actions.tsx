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

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

import type { CellContext } from '@tanstack/react-table';

type ProductDocument = import('@wcpos/database').ProductDocument;

export const Actions = ({ row }: CellContext<{ document: ProductDocument }, 'actions'>) => {
	const router = useRouter();
	const product = row.original.document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const pullDocument = usePullDocument();
	const t = useT();
	const deleteDocument = useDeleteDocument();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			if (product.id) {
				await deleteDocument(product.id, product.collection);
			}
			await product.remove();
		} finally {
			//
		}
	}, [product, deleteDocument]);

	/**
	 *
	 */
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<IconButton name="ellipsisVertical" />
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
						<Text>{t('Edit')}</Text>
					</DropdownMenuItem>
					{product.id && (
						<DropdownMenuItem
							onPress={() => {
								if (product.id) {
									pullDocument(product.id, product.collection);
								}
							}}
						>
							<Icon name="arrowRotateRight" />
							<Text>{t('Sync')}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('Delete')}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('Delete {product}', { product: product.name })}</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								'Are you sure you want to delete this product? Deleted products will be placed in the Trash on the server.'
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleDelete}>
							{t('Delete')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
