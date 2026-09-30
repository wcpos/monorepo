import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/v2/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { IconButton } from '@wcpos/components/icon-button';
import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';
import { useQueryRuntime } from '@wcpos/query';
import { GUEST_CUSTOMER_ID } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { CustomerForm, customerFormSchema } from '../../components/customer/customer-form';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useMutation } from '../../hooks/mutations/use-mutation';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';
import { usePanelSide } from '../contexts/overlay-side/v2';
import { customerLinkIdentity, recordCustomerLink } from './new-customer-link';

const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'customer']);

/**
 * The form and its save handler, rendered inside DialogContent. DialogContent
 * unmounts its children on close (both platforms), so every open starts from
 * a fresh form without any reset-on-close bookkeeping in the dialog owner.
 */
function AddCustomerFormBody({ onClose }: { onClose: () => void }) {
	const t = useT();
	const { create } = useMutation({ collectionName: 'customers' });
	const [loading, setLoading] = React.useState(false);
	const { format } = useCustomerNameFormat();
	const { currentOrderRecord } = useCurrentOrder();
	const { localPatch } = useLocalMutation();
	const { storeDB } = useStoreSession();
	const runtime = useQueryRuntime();

	const form = useForm<z.infer<typeof customerFormSchema>>({
		resolver: zodResolver(customerFormSchema as never) as never,
		defaultValues: {},
	});

	/**
	 * Save locally and attach at once (#1523). The create is queued, never
	 * awaited: offline there is no Woo id to wait for, and the cashier is at the
	 * till. The order takes the new customer's addresses now and stays a guest
	 * (`customer_id` 0) — a local uuid must never reach the server — and
	 * `NewCustomerLinkBridge` stamps the real id on when the create is acknowledged.
	 */
	const handleSave = React.useCallback(
		async (data: z.infer<typeof customerFormSchema>) => {
			setLoading(true);
			try {
				// Our own "{name} saved" below replaces the generic toast.
				const savedDoc = await create({ data, toast: false });
				// create() has already reported a failed enqueue; the form stays open.
				if (savedDoc) {
					// create() returns the raw engine record — the customer body is its
					// payload. Snapshot it rather than reading fields off the record:
					// `billing`/`shipping` come back as RxDB Proxies, and writing one onto
					// the order below would fail the storage clone.
					const latest = (savedDoc as any).getLatest?.() ?? savedDoc;
					const record = (latest as any).toMutableJSON?.() ?? latest;
					const saved = record.payload;
					cartLogger.success(t('common.saved', { name: format(saved) }), {
						showToast: true,
						context: {
							customerUUID: record.uuid,
							customerName: format(saved),
						},
					});
					if (currentOrderRecord) {
						const orderUuid = currentOrderRecord.uuid;
						const scopeId = runtime.engine.status().activeScopeId;
						const attached = await localPatch({
							document: currentOrderRecord,
							data: {
								customer_id: GUEST_CUSTOMER_ID,
								billing: saved?.billing,
								shipping: saved?.shipping,
							},
						});
						// After the attach, never before: a link whose order does not yet
						// carry the copied identity would be dropped as "cashier moved on".
						if (attached && orderUuid && scopeId) {
							try {
								await recordCustomerLink(storeDB, orderUuid, {
									customerUuid: record.uuid,
									scopeId,
									identity: customerLinkIdentity(saved?.billing),
									at: new Date().toISOString(),
								});
							} catch (error) {
								// The order keeps the addresses as a guest; only the later id stamp is lost.
								cartLogger.error('Could not record the new customer for its order', {
									code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
									context: { orderUUID: orderUuid, error: getErrorMessage(error) },
								});
							}
						}
						onClose();
					}
				}
			} catch (error) {
				const errorMessage = getErrorMessage(error);
				cartLogger.error('Failed to save customer', {
					showToast: true,
					code: ERROR_CODES.SYNC_UNEXPECTED,
					toast: { title: t('common.failed_to_save_customer') },
					context: {
						error: errorMessage,
					},
				});
			} finally {
				setLoading(false);
			}
		},
		[create, currentOrderRecord, format, localPatch, onClose, runtime, storeDB, t]
	);

	return (
		<CustomerForm
			form={form}
			onClose={onClose}
			onSubmit={handleSave}
			loading={loading}
			renderLayout={(body, footer) => (
				<>
					<DialogBody className="min-h-0 shrink">{body}</DialogBody>
					<DialogFooter>{footer}</DialogFooter>
				</>
			)}
		/>
	);
}

/**
 *
 */
export function AddNewCustomer() {
	const side = usePanelSide('cart');
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
				<DialogContent side={side} testID="add-new-customer-dialog" size="lg" portalHost="pos">
					<DialogHeader>
						<DialogTitle>{t('common.add_new_customer')}</DialogTitle>
					</DialogHeader>
					<AddCustomerFormBody onClose={close} />
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
	const side = usePanelSide('cart');
	const t = useT();
	const close = React.useCallback(() => onOpenChange(false), [onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent side={side} testID="add-customer-dialog" size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('common.add_new_customer')}</DialogTitle>
				</DialogHeader>
				<AddCustomerFormBody onClose={close} />
			</DialogContent>
		</Dialog>
	);
}
