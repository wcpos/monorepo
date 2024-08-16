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
} from '@wcpos/tailwind/src/alert-dialog';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { CellContext } from '@wcpos/tailwind/src/data-table';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/tailwind/src/dropdown-menu';
import { Icon } from '@wcpos/tailwind/src/icon';
import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

/**
 *
 */
export const VariationActions = ({ row }: CellContext<ProductVariationDocument, 'actions'>) => {
	const variation = row.original;
	const parent = row.getParentRow();
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
							{t('You are about to delete {product}', {
								_tags: 'core',
								product: `${parent.name} - ${variation.name}`,
							})}
						</AlertDialogTitle>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>
							<Text>{t('Cancel', { _tags: 'core' })}</Text>
						</AlertDialogCancel>
						<AlertDialogAction asChild onPress={handleDelete}>
							<Button variant="destructive">
								<ButtonText>{t('Delete', { _tags: 'core' })}</ButtonText>
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
