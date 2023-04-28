import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { Checkbox } from '@wcpos/components/src/checkbox/checkbox';
import { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
import useDeleteDocument from '../../contexts/use-delete-document';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

interface DeleteDialogProps {
	customer: import('@wcpos/database').CustomerDocument;
	setDeleteDialogOpened: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Note: deleting a custom requires a force param because they are permanently deleted
 * There is no Trash for users to recover from.
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#delete-a-customer
 */
const DeleteDialog = ({ customer, setDeleteDialogOpened }: DeleteDialogProps) => {
	const [force, setForce] = React.useState(!customer.id);
	const { setPrimaryAction } = useModal();
	const deleteDocument = useDeleteDocument();
	const { format } = useCustomerNameFormat();

	/**
	 * Handle delete button click
	 */
	const handleDelete = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => ({
				...prev,
				loading: true,
			}));

			if (customer.id) {
				await deleteDocument(customer.id, customer.collection, { force });
			}
			await customer.remove();
			setDeleteDialogOpened(false);
		} finally {
			setPrimaryAction((prev) => ({
				...prev,
				loading: false,
			}));
		}
	}, [customer, deleteDocument, force, setDeleteDialogOpened, setPrimaryAction]);

	/**
	 * Set primary action
	 */
	React.useEffect(() => {
		setPrimaryAction({
			label: t('Delete', { _tags: 'core' }),
			action: handleDelete,
			disabled: !force,
			type: 'critical',
		});
	}, [force, handleDelete, setPrimaryAction]);

	/**
	 *
	 */
	return (
		<Box space="small">
			<Text>
				{t('You are about to delete {name}', {
					_tags: 'core',
					name: format(customer),
				})}
			</Text>
			{customer.id ? (
				<>
					<Text type="critical">
						{t('Warning! Deleting a user is permanent, there is no Trash for WordPress users.', {
							_tags: 'core',
						})}
					</Text>
					<Checkbox label={t('Confirm', { _tags: 'core' })} value={force} onChange={setForce} />
				</>
			) : null}
		</Box>
	);
};

export default DeleteDialog;
