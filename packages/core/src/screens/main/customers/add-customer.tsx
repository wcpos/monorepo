import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation, StackActions } from '@react-navigation/native';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import {
	ModalContent,
	ModalTitle,
	Modal,
	ModalBody,
	ModalHeader,
} from '@wcpos/components/src/modal';
import { Text } from '@wcpos/components/src/text';
import { Toast } from '@wcpos/components/src/toast';

import { useT } from '../../../contexts/translations';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';
import { CustomerForm, customerFormSchema } from '../components/customer/customer-form';
import { useMutation } from '../hooks/mutations/use-mutation';
import useCustomerNameFormat from '../hooks/use-customer-name-format';

/**
 *
 */
export const AddCustomer = () => {
	const { create } = useMutation({ collectionName: 'customers' });
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const navigation = useNavigation();
	const { format } = useCustomerNameFormat();
	useModalRefreshFix();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema),
		defaultValues: {},
	});

	/**
	 * Save to server
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof customerFormSchema>) => {
			setLoading(true);
			try {
				const savedDoc = await create({ data });
				if (isRxDocument(savedDoc)) {
					Toast.show({
						type: 'success',
						text1: t('{name} saved', { _tags: 'core', name: format(savedDoc) }),
					});
				}
			} catch (error) {
				Toast.show({
					type: 'error',
					text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
				});
			} finally {
				setLoading(false);
			}
		},
		[create, format, t]
	);

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('Add Customer', { _tags: 'core' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<ErrorBoundary>
						<CustomerForm
							form={form}
							onSubmit={handleSave}
							onClose={() => navigation.dispatch(StackActions.pop(1))}
							loading={loading}
						/>
					</ErrorBoundary>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
