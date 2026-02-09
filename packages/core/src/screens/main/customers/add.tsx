import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../components/customer/customer-form';
import { useMutation } from '../hooks/mutations/use-mutation';
import useCustomerNameFormat from '../hooks/use-customer-name-format';

const mutationLogger = getLogger(['wcpos', 'mutations', 'customer']);

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
		resolver: zodResolver(customerFormSchema as never) as never,
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
				if (savedDoc) {
					mutationLogger.success(t('common.saved', { name: format(savedDoc as any) }), {
						showToast: true,
						saveToDb: true,
						context: {
							customerId: (savedDoc as any).id,
							customerName: format(savedDoc as any),
						},
					});
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				mutationLogger.error(t('common.failed_to_save_customer'), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode: ERROR_CODES.TRANSACTION_FAILED,
						error: errorMessage,
					},
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
						<Text>{t('customers.add_customer')}</Text>
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
