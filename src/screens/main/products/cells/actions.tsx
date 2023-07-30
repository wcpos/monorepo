import * as React from 'react';

import { useNavigation } from '@react-navigation/native';

import Dropdown from '@wcpos/components/src/dropdown';
import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import DeleteDialog from './delete-dialog';
import { t } from '../../../../lib/translations';
import usePullDocument from '../../contexts/use-pull-document';

type Props = {
	item: import('@wcpos/database').ProductDocument;
};

const Actions = ({ item: product }: Props) => {
	const [menuOpened, setMenuOpened] = React.useState(false);
	const [deleteDialogOpened, setDeleteDialogOpened] = React.useState(false);
	const navigation = useNavigation();
	const pullDocument = usePullDocument();

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
						action: () => navigation.navigate('EditProduct', { productID: product.uuid }),
						icon: 'penToSquare',
					},
					{
						label: t('Sync', { _tags: 'core' }),
						action: () => {
							if (product.id) {
								pullDocument(product.id, product.collection);
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
				<DeleteDialog product={product} setDeleteDialogOpened={setDeleteDialogOpened} />
			</Modal>
		</>
	);
};

export default Actions;
