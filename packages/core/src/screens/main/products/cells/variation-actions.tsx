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

import { useT } from '../../../../contexts/translations';
import { useDeleteDocument } from '../../contexts/use-delete-document';
import { usePullDocument } from '../../contexts/use-pull-document';

import type { CellContext } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export function VariationActions({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) {
	const variation = row.original.document;
	const parentRow = row.getParentRow()!;
	const parent = (parentRow.original as { document: { id: number; name: string } }).document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const router = useRouter();
	const pullDocument = usePullDocument();
	const t = useT();
	const deleteDocument = useDeleteDocument();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			if (variation.id) {
				await deleteDocument(variation.id, variation.collection);
			}
			await variation.remove();
		} finally {
			//
		}
	}, [variation, deleteDocument]);

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
						<DropdownMenuItem
							onPress={() => {
								pullDocument(
									variation.id!,
									variation.collection as never,
									`products/${parent.id}/variations`
								);
							}}
						>
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
