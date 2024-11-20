import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
} from '@wcpos/components/src/alert-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/src/dropdown-menu';
import { Icon } from '@wcpos/components/src/icon';
import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

import type { CellContext } from '@tanstack/react-table';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const VariationActions = ({
	row,
}: CellContext<{ document: ProductVariationDocument }, 'actions'>) => {
	const variation = row.original.document;
	const parent = row.getParentRow().document;
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const navigation = useNavigation();
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
				<DropdownMenuTrigger>
					<Icon name="ellipsisVertical" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						onPress={() =>
							navigation.navigate('EditVariation', {
								parentID: parent.id,
								variationID: variation.uuid,
							})
						}
					>
						<Icon name="penToSquare" />
						<Text>{t('Edit', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
					{variation.id && (
						<DropdownMenuItem
							onPress={() => {
								pullDocument(
									variation.id,
									variation.collection,
									`products/${parent.id}/variations`
								);
							}}
						>
							<Icon name="arrowRotateRight" />
							<Text>{t('Sync', { _tags: 'core' })}</Text>
						</DropdownMenuItem>
					)}
					<DropdownMenuSeparator />
					<DropdownMenuItem variant="destructive" onPress={() => setDeleteDialogOpened(true)}>
						<Icon
							name="trash"
							className="fill-destructive web:group-focus:fill-accent-foreground"
						/>
						<Text>{t('Delete', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<AlertDialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t('Delete {product}', {
								_tags: 'core',
								product: `${parent.name} - ${variation.name}`,
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								'Are you sure you want to delete this variation? Deleting a variation is permanent, there is no Trash for variations.'
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel', { _tags: 'core' })}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onPress={handleDelete}>
							{t('Delete', { _tags: 'core' })}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
