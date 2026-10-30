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
import { getErrorMessage, getLogger, isErrorReported } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';
import { snapshotCustomerTaxIds } from '../hooks/utils';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);

/**
 * The form and its save handler, rendered inside DialogContent. DialogContent
 * unmounts its children on close (both platforms), so every open starts from
 * a fresh form without any reset-on-close bookkeeping in the dialog owner.
 */
function AddCustomerFormBody({ onClose }: { onClose: () => void }) {
	const t = useT();
	const { create } = useMutation({ collectionName: 'customers', showSuccessToast: false });
	const [loading, setLoading] = React.useState(false);
	const { format } = useCustomerNameFormat();
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();

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
				// create() logs and toasts its own failure, with the store's sentence; reporting
				// it here too showed the cashier two toasts for one refusal.
				const savedDoc = await create({ data, awaitRemoteId: true }).catch(() => undefined);
				if (savedDoc) {
					// create() returns the raw engine record — the customer body is its
					// payload. Snapshot it rather than reading fields off the record:
					// `billing`/`shipping` come back as RxDB Proxies, and writing one onto
					// the order below would fail the storage clone.
					const latest = (savedDoc as any).getLatest?.() ?? savedDoc;
					const saved = ((latest as any).toMutableJSON?.() ?? latest).payload;
					cartLogger.success(t('common.saved', { name: format(saved) }), {
						showToast: true,
						context: {
							customerId: saved?.id,
							customerName: format(saved),
						},
					});
					if (currentOrderRecord) {
						await localPatch({
							document: currentOrderRecord,
							data: {
								customer_id: saved?.id,
								billing: saved?.billing,
								shipping: saved?.shipping,
								// The same snapshot the picker takes: without it a customer created at the
								// till reached the receipt with no tax ID until removed and picked again.
								tax_ids: snapshotCustomerTaxIds(saved),
							},
						});
						onClose();
					}
				}
			} catch (error) {
				// Only what follows a successful create reaches here (the success toast, the
				// order patch); create() failures are reported by create() itself, and a
				// localPatch rethrow (a scope that moved twice) by localPatch.
				if (isErrorReported(error)) return;
				const errorMessage = getErrorMessage(error);
				// The customer WAS created; only attaching it to the cart failed. "Failed to
				// save customer" (and SYNC999's "save it again") invited a duplicate.
				cartLogger.error('Customer created but not added to the cart', {
					showToast: true,
					code: ERROR_CODES.CART_UPDATE_FAILED,
					// CHECKOUT111's hint is about an item; the customer sentence says what to do.
					toast: {
						title: t('pos_cart.customer_saved_not_attached'),
						text2: t('pos_cart.customer_saved_not_attached_hint'),
					},
					context: {
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[create, currentOrderRecord, format, localPatch, onClose, t]
	);

	return <CustomerForm form={form} onClose={onClose} onSubmit={handleSave} loading={loading} />;
}

/**
 *
 */
export function AddNewCustomer() {
	const t = useT();
	const [open, setOpen] = React.useState(false);
	const close = React.useCallback(() => setOpen(false), []);

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
				<DialogContent testID="add-new-customer-dialog" size="xl" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('common.add_new_customer')}</DialogTitle>
					</DialogHeader>
					<DialogBody>
						<AddCustomerFormBody onClose={close} />
					</DialogBody>
				</DialogContent>
			</Dialog>
		</ErrorBoundary>
	);
}

/**
 * Controlled version of the AddNewCustomer dialog, for use when an external
 * component (e.g. a dropdown menu) needs to manage open/close state.
 */
interface AddCustomerDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function AddCustomerDialog({ open, onOpenChange }: AddCustomerDialogProps) {
	const t = useT();
	const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange} style={{ display: 'none' }}>
			<DialogContent testID="add-customer-dialog" size="xl" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('common.add_new_customer')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<AddCustomerFormBody onClose={close} />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
