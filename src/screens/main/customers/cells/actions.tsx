import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import DeleteDialog from './delete-dialog';
import { useT } from '../../../../contexts/translations';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const pullDocument = usePullDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const t = useT();

	/**
	 *
	 */
	const items = React.useMemo(() => {
		const i = [
			{
				label: t('Edit', { _tags: 'core' }),
				action: () => navigation.navigate('EditCustomer', { customerID: customer.uuid }),
				icon: 'penToSquare',
			},
			{ label: '__' },
			{
				label: t('Delete', { _tags: 'core' }),
				action: () => setDeleteDialogOpened(true),
				icon: 'trash',
				type: 'critical',
			},
		];

		// if customer has an id, then it can be synced
		// add as second item in menu
		if (customer.id) {
			i.splice(1, 0, {
				label: t('Sync', { _tags: 'core' }),
				action: () => {
					if (customer.id) {
						pullDocument(customer.id, customer.collection);
					}
				},
				icon: 'arrowRotateRight',
			});
		}
	}, [customer.collection, customer.id, customer.uuid, navigation, pullDocument, t]);

	/**
	 *
	 */
	return (
		<>
			<Dropdown
				withinPortal
				opened={menuOpened}
				onClose={() => setMenuOpened(false)}
				placement="bottom-end"
				items={[
					{
						label: t('Edit', { _tags: 'core' }),
						action: () => navigation.navigate('EditCustomer', { customerID: customer.uuid }),
						icon: 'penToSquare',
					},
					{
						label: t('Sync', { _tags: 'core' }),
						action: () => {
							if (customer.id) {
								pullDocument(customer.id, customer.collection);
							}
						},
						icon: 'arrowRotateRight',
					},
					{ label: '__' },
					{
						label: t('Delete', { _tags: 'core' }),
						action: () => setDeleteDialogOpened(true),
						icon: 'trash',
						type: 'critical',
					},
				]}
			>
				<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
			</Dropdown>

			<Modal opened={deleteDialogOpened} onClose={() => setDeleteDialogOpened(false)}>
				<DeleteDialog customer={customer} setDeleteDialogOpened={setDeleteDialogOpened} />
			</Modal>
		</>
	);
};

export default Actions;
