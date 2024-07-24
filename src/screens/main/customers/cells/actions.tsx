import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Icon from '@wcpos/components/src/icon';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/tailwind/src/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@wcpos/tailwind/src/dropdown-menu';
import { Text } from '@wcpos/tailwind/src/text';

import { DeleteDialog } from './delete-dialog';
import { useT } from '../../../../contexts/translations';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const navigation = useNavigation();
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();

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
					<DropdownMenuItem onPress={() => setDeleteDialogOpened(true)}>
						<Icon name="trash" />
						<Text>{t('Delete', { _tags: 'core' })}</Text>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<Dialog open={deleteDialogOpened} onOpenChange={setDeleteDialogOpened}>
				<DialogContent>
					<DeleteDialog customer={customer} />
				</DialogContent>
			</Dialog>
		</>
	);

	// /**
	//  *
	//  */
	// return (
	// 	<>
	// 		<Dropdown
	// 			withinPortal
	// 			opened={menuOpened}
	// 			onClose={() => setMenuOpened(false)}
	// 			placement="bottom-end"
	// 			items={[
	// 				{
	// 					label: t('Edit', { _tags: 'core' }),
	// 					action: () => navigation.navigate('EditCustomer', { customerID: customer.uuid }),
	// 					icon: 'penToSquare',
	// 				},
	// 				{
	// 					label: t('Sync', { _tags: 'core' }),
	// 					action: () => {
	// 						if (customer.id) {
	// 							pullDocument(customer.id, customer.collection);
	// 						}
	// 					},
	// 					icon: 'arrowRotateRight',
	// 				},
	// 				{ label: '__' },
	// 				{
	// 					label: t('Delete', { _tags: 'core' }),
	// 					action: () => setDeleteDialogOpened(true),
	// 					icon: 'trash',
	// 					type: 'critical',
	// 				},
	// 			]}
	// 		>
	// 			<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
	// 		</Dropdown>

	// 		{deleteDialogOpened && (
	// 			<Modal opened onClose={() => setDeleteDialogOpened(false)}>
	// 				<DeleteDialog customer={customer} setDeleteDialogOpened={setDeleteDialogOpened} />
	// 			</Modal>
	// 		)}
	// 	</>
	// );
};

export default Actions;
