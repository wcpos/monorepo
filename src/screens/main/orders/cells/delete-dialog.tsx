import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';

interface DeleteDialogProps {
	order: import('@wcpos/database').OrderDocument;
	setDeleteDialogOpened: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Note: deleting a custom requires a force param because they are permanently deleted
 * There is no Trash for users to recover from.
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#delete-a-customer
 */
const DeleteDialog = ({ order, setDeleteDialogOpened }: DeleteDialogProps) => {
	const { setPrimaryAction } = useModal();
	const deleteDocument = useDeleteDocument();
	const t = useT();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => ({
				...prev,
				loading: true,
			}));

			if (order.id) {
				await deleteDocument(order.id, order.collection);
			}
			await order.remove();
			setDeleteDialogOpened(false);
		} finally {
			setPrimaryAction((prev) => ({
				...prev,
				loading: false,
			}));
		}
	}, [order, deleteDocument, setDeleteDialogOpened, setPrimaryAction]);

	/**
	 * Set primary action
	 */
	React.useEffect(() => {
		setPrimaryAction({
			label: t('Delete', { _tags: 'core' }),
			action: handleDelete,
			type: 'critical',
		});
	}, [handleDelete, setPrimaryAction, t]);

	/**
	 *
	 */
	return (
		<Box space="small">
			<Text>
				{t('You are about to delete order {id}', {
					_tags: 'core',
					id: order.id || order.uuid,
				})}
			</Text>
		</Box>
	);
};

export default DeleteDialog;
