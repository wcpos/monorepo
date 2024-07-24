import * as React from 'react';

import Box from '@wcpos/components/src/box';
import { Checkbox } from '@wcpos/tailwind/src/checkbox';
import { Label } from '@wcpos/tailwind/src/label';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useT } from '../../../../contexts/translations';
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
export const DeleteDialog = ({ customer, setDeleteDialogOpened }: DeleteDialogProps) => {
	const [force, setForce] = React.useState(!customer.id);
	const deleteDocument = useDeleteDocument();
	const { format } = useCustomerNameFormat();
	const t = useT();

	/**
	 * Handle delete button click
	 */
	// const handleDelete = React.useCallback(async () => {
	// 	try {
	// 		setPrimaryAction((prev) => ({
	// 			...prev,
	// 			loading: true,
	// 		}));

	// 		if (customer.id) {
	// 			await deleteDocument(customer.id, customer.collection, { force });
	// 		}
	// 		await customer.getLatest().remove();
	// 		setDeleteDialogOpened(false);
	// 	} finally {
	// 		setPrimaryAction((prev) => ({
	// 			...prev,
	// 			loading: false,
	// 		}));
	// 	}
	// }, [customer, deleteDocument, force, setDeleteDialogOpened, setPrimaryAction]);

	// /**
	//  * Set primary action
	//  */
	// React.useEffect(() => {
	// 	setPrimaryAction({
	// 		label: t('Delete', { _tags: 'core' }),
	// 		action: handleDelete,
	// 		disabled: !force,
	// 		type: 'critical',
	// 	});
	// }, [force, handleDelete, setPrimaryAction, t]);

	/**
	 *
	 */
	return (
		<VStack>
			<Text>
				{t('You are about to delete {name}', {
					_tags: 'core',
					name: format(customer),
				})}
			</Text>
			{customer.id ? (
				<>
					<Text className="text-destructive">
						{t('Warning! Deleting a user is permanent, there is no Trash for WordPress users.', {
							_tags: 'core',
						})}
					</Text>
					<Checkbox checked={force} onCheckedChange={setForce} aria-labelledby="confirm" />
					<Label nativeID="confirm">{t('Confirm', { _tags: 'core' })}</Label>
				</>
			) : null}
		</VStack>
	);
};
