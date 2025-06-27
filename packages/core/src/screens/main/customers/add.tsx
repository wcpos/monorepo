import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';

import { useT } from '../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../components/customer/customer-form';
import { useMutation } from '../hooks/mutations/use-mutation';
import useCustomerNameFormat from '../hooks/use-customer-name-format';

/**
 *
 */
export const AddCustomerScreen = () => {
	const { create } = useMutation({ collectionName: 'customers' });
	const t = useT();
	const [loading, setLoading] = React.useState(false);
	const router = useRouter();
	const { format } = useCustomerNameFormat();

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
							onClose={() => router.back()}
							loading={loading}
						/>
					</ErrorBoundary>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
};
