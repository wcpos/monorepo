import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);

/**
 *
 */
export const AddNewCustomer = () => {
	const t = useT();
	const [open, setOpen] = React.useState(false);
	const { create } = useMutation({ collectionName: 'customers' });
	const [loading, setLoading] = React.useState(false);
	const { format } = useCustomerNameFormat();
	const { currentOrder } = useCurrentOrder();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {},
	});

	/**
	 * Clear the form when dialog closes.
	 * This is a legitimate useEffect for cleaning up form state on modal close,
	 * NOT for syncing external data (which should use `values` prop instead).
	 */
	React.useEffect(() => {
		if (!open) {
			form.reset({});
		}
	}, [form, open]);

	/**
	 * Save to server
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof customerFormSchema>) => {
			setLoading(true);
			try {
				const savedDoc = await create({ data });
				if (savedDoc) {
					cartLogger.success(t('common.saved', { name: format(savedDoc as any) }), {
						showToast: true,
						saveToDb: true,
						context: {
							customerId: (savedDoc as any).id,
							customerName: format(savedDoc as any),
						},
					});
					if (currentOrder) {
						const json = (savedDoc as any).toJSON();
						await localPatch({
							document: currentOrder,
							data: {
								customer_id: json.id,
								billing: json.billing,
								shipping: json.shipping,
							},
						});
						setOpen(false);
					}
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				cartLogger.error(t('common.failed_to_save_customer'), {
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
		[create, currentOrder, format, localPatch, t]
	);

	return (
		<ErrorBoundary>
			<Dialog open={open} onOpenChange={setOpen}>
				<Tooltip>
					<TooltipTrigger asChild onPress={() => setOpen(true)}>
						<IconButton testID="add-customer-button" name="userPlus" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('common.add_new_customer')}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('common.add_new_customer')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<CustomerForm
							form={form}
							onClose={() => setOpen(false)}
							onSubmit={handleSave}
							loading={loading}
						/>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
};
