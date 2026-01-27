import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
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

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

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
		resolver: zodResolver(customerFormSchema),
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
			if (isRxDocument(savedDoc)) {
				cartLogger.success(t('{name} saved', { _tags: 'core', name: format(savedDoc) }), {
					showToast: true,
					saveToDb: true,
					context: {
						customerId: savedDoc.id,
						customerName: format(savedDoc),
					},
				});
				if (currentOrder) {
					const json = savedDoc.toJSON();
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
			cartLogger.error(t('{message}', { _tags: 'core', message: error.message || 'Error' }), {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					error: error instanceof Error ? error.message : String(error),
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
						<IconButton name="userPlus" />
					</TooltipTrigger>
					<TooltipContent>
						<Text>{t('Add new customer', { _tags: 'core' })}</Text>
					</TooltipContent>
				</Tooltip>
				<DialogContent size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('Add new customer', { _tags: 'core' })}</DialogTitle>
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
