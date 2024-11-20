import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { StackActions, useNavigation } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import usePushDocument from '../../contexts/use-push-document';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';

interface Props {
	customer: import('@wcpos/database').CustomerDocument;
}

/**
 *
 */
export const EditCustomerForm = ({ customer }: Props) => {
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const { format } = useCustomerNameFormat();
	const navigation = useNavigation();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema),
		defaultValues: {
			...customer.toJSON(),
		},
	});

	/**
	 * Save to server
	 *
	 * NOTE: There's an issue if we just patch the form changes, other changes such as customer or if the
	 * order has been reopened will be lost. We need to push the whole order object.
	 */
	const handleSave = React.useCallback(
		async (data) => {
			setLoading(true);
			try {
				await localPatch({
					document: customer,
					data,
				});
				await pushDocument(customer).then((savedDoc) => {
					if (isRxDocument(savedDoc)) {
						Toast.show({
							type: 'success',
							text1: t('{name} saved', { _tags: 'core', name: format(savedDoc) }),
						});
					}
				});
			} catch (error) {
				Toast.show({
					type: 'error',
					text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
				});
			} finally {
				setLoading(false);
			}
		},
		[localPatch, customer, pushDocument, t, format]
	);

	/**
	 *
	 */
	return (
		<CustomerForm
			form={form}
			onClose={() => navigation.dispatch(StackActions.pop(1))}
			onSubmit={handleSave}
			loading={loading}
		/>
	);
};
