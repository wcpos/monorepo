import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Dialog from '@wcpos/components/src/dialog';
import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';

import { t } from '../../../../lib/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const pullDocument = usePullDocument();
	const deleteDocument = useDeleteDocument();
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);

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

			<Dialog
				opened={deleteDialogOpened}
				onAccept={async () => {
					if (customer.id) {
						await deleteDocument(customer.id, customer.collection);
					}
					await customer.remove();
				}}
				onClose={() => setDeleteDialogOpened(false)}
				children={t('You are about to delete user {id}', {
					_tags: 'core',
					id: customer.id || customer.uuid,
				})}
			/>
		</>
	);
};

export default Actions;
