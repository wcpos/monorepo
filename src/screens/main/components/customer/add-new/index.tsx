import * as React from 'react';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';

import { AddNewCustomerForm } from './form';
import { useT } from '../../../../../contexts/translations';

interface AddNewCustomerProps {
	onAdd?: (doc: import('@wcpos/database').CustomerDocument) => void;
}

/**
 *
 */
export const AddNewCustomer = ({ onAdd }: AddNewCustomerProps) => {
	const [opened, setOpened] = React.useState(false);
	const t = useT();

	/**
	 * Close onAdd
	 */
	const handleAdd = React.useCallback(
		(doc) => {
			if (onAdd) {
				onAdd(doc);
			}
			setOpened(false);
		},
		[onAdd]
	);

	return (
		<>
			<Icon
				name="userPlus"
				onPress={() => setOpened(true)}
				tooltip={t('Add new customer', { _tags: 'core' })}
			/>

			{opened && (
				<Modal
					size="large"
					opened={opened}
					onClose={() => setOpened(false)}
					title={t('Add New Customer', { _tags: 'core' })}
					// primaryAction={{
					// 	label: t('Add Customer', { _tags: 'core' }),
					// 	action: handleSave,
					// 	loading,
					// 	disabled: isEmpty(customerData.email),
					// }}
					secondaryActions={[
						{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
					]}
				>
					<AddNewCustomerForm onAdd={handleAdd} />
				</Modal>
			)}
		</>
	);
};
