import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/src/alert-dialog';
import { Checkbox } from '@wcpos/components/src/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/components/src/dropdown-menu';
import { HStack } from '@wcpos/components/src/hstack';
import { Icon } from '@wcpos/components/src/icon';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Label } from '@wcpos/components/src/label';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

import type { CellContext } from '@tanstack/react-table';

type CustomerDocument = import('@wcpos/database').CustomerDocument;

/**
 *
 */
export const Actions = ({ row }: CellContext<{ document: CustomerDocument }, 'actions'>) => {
	const customer = row.original.document;
	const navigation = useNavigation();
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();
	const { format } = useCustomerNameFormat();
	const [force, setForce] = React.useState(!customer.id);
	const deleteDocument = useDeleteDocument();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			if (customer.id) {
				await deleteDocument(customer.id, customer.collection, { force });
			}
			await customer.getLatest().remove();
		} finally {
			// @TODO - add button loading state and close
			// setDeleteDialogOpened(false);
		}
	}, [customer, deleteDocument, force]);

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
						onPress={() => navigation.navigate('EditCustomer', { customerID: customer.uuid })}
					>
						<Icon name="penToSquare" />
						<Text>{t('Edit', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
					{customer.id && (
						<DropdownMenuItem
							onPress={() => {
								if (customer.id) {
									pullDocument(customer.id, customer.collection);
								}
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
							{t('Delete {name}', {
								_tags: 'core',
								name: format(customer),
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							<VStack>
								<Text className="text-destructive">
									{t(
										'Are you sure you want to delete this user? Deleting a user is permanent, there is no Trash for WordPress users.',
										{
											_tags: 'core',
										}
									)}
								</Text>
								<HStack>
									<Checkbox aria-labelledby="confirm" onCheckedChange={setForce} checked={force} />
									<Label
										nativeID="confirm"
										onPress={() => {
											setForce(!force);
										}}
									>
										{t('Confirm', { _tags: 'core' })}
									</Label>
								</HStack>
							</VStack>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('Cancel', { _tags: 'core' })}</AlertDialogCancel>
						<AlertDialogAction variant="destructive" disabled={!force} onPress={handleDelete}>
							{t('Delete', { _tags: 'core' })}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};
