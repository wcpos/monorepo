import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import useDeleteDocument from '../../contexts/use-delete-document';

interface DeleteDialogProps {
	product: import('@wcpos/database').ProductDocument;
	setDeleteDialogOpened: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 *
 */
const DeleteDialog = ({ product, setDeleteDialogOpened }: DeleteDialogProps) => {
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

			if (product.id) {
				await deleteDocument(product.id, product.collection);
			}
			await product.remove();
			setDeleteDialogOpened(false);
		} finally {
			setPrimaryAction((prev) => ({
				...prev,
				loading: false,
			}));
		}
	}, [product, deleteDocument, setDeleteDialogOpened, setPrimaryAction]);

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
				{t('You are about to delete {product}', { _tags: 'core', product: product.name })}
			</Text>
		</Box>
	);
};

export default DeleteDialog;
