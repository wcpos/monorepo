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
} from '@wcpos/tailwind/src/alert-dialog';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Checkbox } from '@wcpos/tailwind/src/checkbox';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/tailwind/src/dropdown-menu';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Icon } from '@wcpos/tailwind/src/icon';
import { IconButton } from '@wcpos/tailwind/src/icon-button';
import { Label } from '@wcpos/tailwind/src/label';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
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
							{t('You are about to delete {name}', {
								_tags: 'core',
								name: format(customer),
							})}
						</AlertDialogTitle>
						<AlertDialogDescription>
							<VStack>
								<Text className="text-destructive">
									{t(
										'Warning! Deleting a user is permanent, there is no Trash for WordPress users.',
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
						<AlertDialogCancel>
							<Text>{t('Cancel', { _tags: 'core' })}</Text>
						</AlertDialogCancel>
						<AlertDialogAction asChild onPress={handleDelete}>
							<Button variant="destructive" disabled={!force}>
								<ButtonText>{t('Delete', { _tags: 'core' })}</ButtonText>
							</Button>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
};

export default Actions;
