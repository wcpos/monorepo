import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { isRxDocument } from 'rxdb';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../lib/translations';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').CustomerDocument;
};

const Actions = ({ item: customer }: Props) => {
	const navigation = useNavigation();
	const [menuOpened, setMenuOpened] = React.useState(false);
	const pullDocument = usePullDocument();
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	const handleSync = async () => {
		try {
			const success = await pullDocument(customer.id, customer.collection);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Customer {id} synced', { _tags: 'core', id: success.id }),
					// type: 'success',
				});
			}
		} catch (error) {
			log.error(error);
		}
	};

	/**
	 *
	 */
	const handleDelete = () => {
		customer.remove();
	};

	return (
		<>
			<Dropdown
				opened={menuOpened}
				onClose={() => setMenuOpened(false)}
				withinPortal={true}
				placement="bottom-end"
				items={[
					{
						label: t('Edit', { _tags: 'core' }),
						action: () => navigation.navigate('EditCustomer', { customerID: customer.uuid }),
						icon: 'penToSquare',
					},
					{ label: t('Sync', { _tags: 'core' }), action: handleSync, icon: 'arrowRotateRight' },
					{ label: '__' },
					{
						label: t('Delete', { _tags: 'core' }),
						action: () => {
							console.log('delete');
						},
						icon: 'trash',
						type: 'critical',
					},
				]}
			>
				<Icon name="ellipsisVertical" onPress={() => setMenuOpened(true)} />
			</Dropdown>
		</>
	);
};

export default Actions;
