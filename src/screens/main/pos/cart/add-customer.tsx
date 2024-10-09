import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { isRxDocument } from 'rxdb';
import * as z from 'zod';

import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogBody,
	DialogHeader,
} from '@wcpos/components/src/dialog';
import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { IconButton } from '@wcpos/components/src/icon-button';
import { Text } from '@wcpos/components/src/text';
import { Toast } from '@wcpos/components/src/toast';
import { Tooltip, TooltipTrigger, TooltipContent } from '@wcpos/components/src/tooltip';

import { useT } from '../../../../contexts/translations';
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
	 * If the dialog is closed, reset the form. This clears any errors.
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
					Toast.show({
						type: 'success',
						text1: t('{name} saved', { _tags: 'core', name: format(savedDoc) }),
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
				Toast.show({
					type: 'error',
					text1: t('{message}', { _tags: 'core', message: error.message || 'Error' }),
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
				<DialogContent size="lg">
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
