import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DialogBody, useDialog } from '@wcpos/components/dialog';
import {
	Form,
	FormCombobox,
	FormField,
	FormItem,
	FormLabel,
	FormSelect,
	FormTextarea,
	SavedMark,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { OPEN_ORDER_STATUSES, useDocField } from '@wcpos/query';
import {
	isPushableOrderStatus,
	NO_STORE,
	PROTECTED_ORDER_META_KEYS,
	PUSHABLE_ORDER_STATUSES,
	wooMetaCarrier,
} from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../../../contexts/app-state';
import { useT } from '../../../../../../contexts/translations';
import { CurrencySelect } from '../../../../components/currency-select';
import { CashierSelect } from '../../../../components/cashier-select';
import { OrderStatusSelect } from '../../../../components/order/order-status-select';
import { pushFailureCode } from '../../../../contexts/push-failure-code';
import { usePushDocument } from '../../../../contexts/use-push-document';
import { useCashierLabel } from '../../../../hooks/use-cashier-label';
import { useStorageMoneyPathGuard } from '../../../../hooks/use-storage-health';
import { useCurrentOrderActions } from '../../../contexts/current-order';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { useOrderFieldsWrite } from '../../../commands/use-order-fields-write';

import type { CurrentOrderRecord } from '../../../contexts/current-order';

/**
 *
 */
const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'save']);

const formSchema = z.object({
	customer_note: z.string().optional(),
	currency: z.string().optional(),
	meta_data: metaDataSchema,
});

const handOverSchema = z.object({ status: z.string(), cashier_id: z.string() });
type HandOverValues = z.infer<typeof handOverSchema>;

type FormValues = z.infer<typeof formSchema>;

export function EditOrderMetaForm({
	order,
	formData,
	handOverData,
	flushRef,
}: {
	order: CurrentOrderRecord;
	formData: FormValues;
	handOverData: HandOverValues;
	/**
	 * Receives the autosave's flush, so an action outside the form that pushes the order
	 * (the sheet's Sync order) carries the edit the cashier just made, not the one before.
	 */
	flushRef?: React.RefObject<(() => Promise<void>) | null>;
}) {
	const t = useT();
	const { writeOrderFields } = useOrderFieldsWrite();
	const { close: closeDialog } = useDialog();
	const pushDocument = usePushDocument();
	const { setCurrentOrderID } = useCurrentOrderActions();
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const { store, wpCredentials } = useStoreSession();
	const storeID = useDocField(store, (value) => value.id);
	const cashierID = useDocField(wpCredentials, (value) => value.id);
	// The staged hand-off, with whether the cashier changed the status (judged when staged).
	const [pending, setPending] = React.useState<(HandOverValues & { statusEdit: boolean }) | null>(
		null
	);
	const [loading, setLoading] = React.useState(false);
	const markSaved = useMarkSaved();

	/**
	 * `defaultValues`, not reactive `values`: this form IS the writer of what it shows. Every
	 * write it makes comes back as a payload change, and a reactive re-bind would reset the
	 * form to the persisted snapshot under the cashier's hands, dropping the keystrokes typed
	 * while the write was in flight and cancelling the debounce that held them. The sheet
	 * remounts the form per order (its key), so a different order never shows stale values.
	 */
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		defaultValues: formData,
	});

	// The hand-over is read, never written, until Send: reactive values are right here.
	const handOverForm = useForm<HandOverValues>({
		resolver: zodResolver(handOverSchema),
		values: handOverData,
	});
	const { flush } = useFormChangeHandler({
		form,
		// A nested path (meta_data.0.value) writes its whole root field; the mark lands on the root.
		onChange: (changes) => {
			const root = Object.keys(changes)[0].split('.')[0] as keyof FormValues;
			const value = form.getValues(root);
			// Autosave never writes the identity rows (the hand-over does, on Send; the local patch
			// keeps the stored ones), and a row the cashier has only just added (no key yet) is not
			// an edit: it would be pushed as blank meta.
			const patch = {
				[root]:
					root === 'meta_data' && Array.isArray(value)
						? value.filter(
								(row) =>
									!PROTECTED_ORDER_META_KEYS.includes(String(row?.key ?? '')) &&
									(row?.id != null || String(row?.key ?? '') !== '')
							)
						: value,
			};
			return writeOrderFields(order, () => patch).then((written) => {
				if (written) markSaved([root]);
			});
		},
	});
	React.useEffect(() => {
		if (!flushRef) return;
		flushRef.current = flush;
		return () => {
			flushRef.current = null;
		};
	}, [flush, flushRef]);
	const [status, cashierId] = useWatch({
		control: handOverForm.control,
		name: ['status', 'cashier_id'],
	});
	const payload = order.getLatest().payload;
	const currentCashierId = wooMetaCarrier.readIdentity(payload.meta_data).cashierId ?? '';
	// Offer only what a till may push (ADR 0040 D4); a server-owned status shows read-only.
	const statusPushable = isPushableOrderStatus(handOverData.status);
	const allowedStatuses = statusPushable
		? PUSHABLE_ORDER_STATUSES
		: [...PUSHABLE_ORDER_STATUSES, handOverData.status];
	const { label: cashierLabel } = useCashierLabel(cashierId);
	// Only the hand-over's own values are staged: the edit form's fields are already on the order
	// (or refused by the gate), so the send never carries them.
	const onSend = handOverForm.handleSubmit((data) => {
		const statusEdit = data.status !== order.getLatest().payload.status;
		setPending({ ...data, statusEdit });
	});

	async function handleSend() {
		if (!pending || loading) return;
		if (blockIfDegraded('save-order', { orderId: order.uuid ?? order.payload.id })) return;
		const previous = order.getLatest().payload;
		const identity = wooMetaCarrier.readIdentity(previous.meta_data);
		const { cashier_id, status, statusEdit: statusChanged } = pending;
		// Status is an intent, never an echo (ADR 0040): only a status the cashier changed goes
		// out, judged when the hand-off was staged. A cashier-only hand-off sends none, so a stale
		// open copy (or a completion a pull adopted meanwhile) cannot reopen a sale another till
		// completed, and its rollback restores the cashier alone. The identity is stamped onto the
		// order's meta as it stands (the autosaved rows included), never onto a form snapshot.
		const patch = () => ({
			...(statusChanged ? { status } : {}),
			meta_data: wooMetaCarrier.stampIdentity(previous.meta_data ?? [], {
				userId: cashier_id,
				storeId: identity.storeId ?? storeID ?? NO_STORE,
				registerId: identity.registerId,
				tillId: identity.tillId,
			}),
		});
		setLoading(true);
		let patched = false;
		try {
			if (!(await writeOrderFields(order, patch))) return;
			patched = true;
			await pushDocument(order);
			cartLogger.success(t('pos_cart.order_sent'), { showToast: true });
			closeDialog();
			if (
				!(OPEN_ORDER_STATUSES as readonly string[]).includes(status) ||
				cashier_id !== String(cashierID)
			) {
				setCurrentOrderID('');
			}
		} catch (error) {
			if (patched) {
				const reverted = await writeOrderFields(order, () => ({
					...(statusChanged ? { status: previous.status } : {}),
					meta_data: previous.meta_data ?? [],
				}));
				// The failed send may still land: a timed-out outcome is unknown and a queued
				// mutation is retried. Open orders only reach the server on an explicit push,
				// so the revert is pushed too — the last write wins and the server ends up
				// where the cart is. Only once the revert actually landed locally: pushing a
				// resident that still carries the hand-off would re-send what we are undoing.
				// The 'Failed to save order' error below is the cashier's one report (and the
				// Sentry event); a revert that also fails to send is recorded beside it at warn.
				if (reverted) {
					void pushDocument(order).catch((revertError: unknown) =>
						cartLogger.warn('Failed to send the reverted order', {
							code: pushFailureCode(revertError),
							context: { orderId: previous.id, error: getErrorMessage(revertError) },
						})
					);
				}
			}
			cartLogger.error('Failed to save order', {
				showToast: true,
				code: pushFailureCode(error),
				toast: { title: t('common.failed_to_save_order') },
				context: { orderId: previous.id, error: getErrorMessage(error) },
			});
		} finally {
			setLoading(false);
			setPending(null);
		}
	}

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<FormField
					control={form.control}
					name="customer_note"
					render={({ field }) => (
						<FormItem>
							<HStack className="justify-between">
								<FormLabel>{t('common.customer_note')}</FormLabel>
								<SavedMark name="customer_note" label={t('settings.saved')} />
							</HStack>
							<FormTextarea testID="order-note-input" minHeight={80} {...field} />
						</FormItem>
					)}
				/>
				<Form {...handOverForm}>
					<View className="border-border gap-3 rounded-lg border p-4">
						<Text className="font-semibold">{t('pos_cart.hand_over')}</Text>
						<HStack className="gap-4">
							<FormField
								control={handOverForm.control}
								name="status"
								render={({ field }) => (
									<View className="flex-1" testID="order-meta-status">
										<FormSelect
											label={t('common.status')}
											customComponent={OrderStatusSelect}
											allowed={allowedStatuses}
											disabled={!statusPushable}
											{...field}
										/>
									</View>
								)}
							/>
							<FormField
								control={handOverForm.control}
								name="cashier_id"
								render={({ field }) => (
									<View className="flex-1" testID="order-meta-cashier">
										<FormCombobox
											label={t('common.cashier')}
											customComponent={CashierSelect}
											portalHost="pos"
											{...field}
											// An order with no cashier names the choice, not an empty box.
											value={{
												value: field.value,
												label: cashierLabel || t('common.select_cashier'),
											}}
										/>
									</View>
								)}
							/>
						</HStack>
						<HStack>
							<Text className="text-muted-foreground flex-1 text-sm">
								{t('pos_cart.hand_over_hint')}
							</Text>
							<Button
								variant="outline"
								testID="order-meta-send"
								disabled={loading || (status === payload.status && cashierId === currentCashierId)}
								onPress={() => void onSend()}
							>
								{t('common.send')}
							</Button>
						</HStack>
					</View>
				</Form>
				<Collapsible>
					<HStack className="justify-between">
						<CollapsibleTrigger>
							<Text>{t('common.more')}</Text>
						</CollapsibleTrigger>
						{/* The meta rows have no label row of their own; their mark sits on the disclosure. */}
						<SavedMark name="meta_data" label={t('settings.saved')} />
					</HStack>
					<CollapsibleContent className="gap-4">
						<FormField
							control={form.control}
							name="currency"
							render={({ field }) => (
								<FormItem>
									<HStack className="justify-between">
										<FormLabel>{t('common.currency')}</FormLabel>
										<SavedMark name="currency" label={t('settings.saved')} />
									</HStack>
									<FormCombobox
										customComponent={CurrencySelect}
										{...field}
										value={field.value ?? ''}
									/>
								</FormItem>
							)}
						/>
						<MetaDataForm hiddenKeys={PROTECTED_ORDER_META_KEYS} />
					</CollapsibleContent>
				</Collapsible>
			</DialogBody>
			<AlertDialog
				open={!!pending}
				onOpenChange={(open) => {
					if (!open && !loading) setPending(null);
				}}
			>
				<AlertDialogContent portalHost="pos">
					<AlertDialogHeader>
						<AlertDialogTitle>{t('pos_cart.send_order_title')}</AlertDialogTitle>
						<AlertDialogDescription>{t('pos_cart.send_order_description')}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							testID="order-meta-send-cancel"
							disabled={loading}
							onPress={() => setPending(null)}
						>
							{t('common.cancel')}
						</AlertDialogCancel>
						<AlertDialogAction
							testID="order-meta-send-confirm"
							loading={loading}
							disabled={loading}
							onPress={handleSend}
						>
							{t('common.send')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Form>
	);
}
