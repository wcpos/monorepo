import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Button } from '@wcpos/components/button';
import { DialogBody, useDialog } from '@wcpos/components/dialog';
import {
	Form,
	FormCombobox,
	FormField,
	FormSelect,
	FormTextarea,
	useFormChangeHandler,
	useMarkSaved,
} from '@wcpos/components/form';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
} from '@wcpos/components/property-row';
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
import { useCurrencyRow } from '../../../../components/order/order-rows';
import { OrderStatusSelect } from '../../../../components/order/order-status-select';
import { pushFailureCode } from '../../../../contexts/push-failure-code';
import { usePushDocument } from '../../../../contexts/use-push-document';
import { useCashierLabel } from '../../../../hooks/use-cashier-label';
import { useStorageMoneyPathGuard } from '../../../../hooks/use-storage-health';
import { useCurrentOrderActions } from '../../../contexts/current-order';
import { FormErrors } from '../../../../components/form-errors';
import {
	META_DATA_DEFAULT_ROW,
	MetaDataForm,
	metaDataSchema,
} from '../../../../components/meta-data-form';
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

type MetaRow = { id?: number; key?: string; value?: unknown };

/**
 * The draft's rows reconciled with the order's: a draft row with no id takes the id the order
 * already holds for the same key (the store numbered it during a sync while the sheet stayed
 * open), and a numbered row the draft no longer has goes out as a tombstone, or the store would
 * keep it — but only a row the draft OPENED with (deleted after that sync, so the form saw no id
 * and removed it instead of tombstoning it). A row that arrived from the store while the sheet
 * was open was never the cashier's to delete; the draft simply does not know it.
 */
function reconcileMetaWithOrder<Row extends MetaRow>(
	rows: Row[],
	stored: readonly MetaRow[],
	openedWith: ReadonlySet<string>
): (Row | MetaRow)[] {
	const claimed = new Set<number>();
	for (const row of rows) if (row.id != null) claimed.add(row.id);
	const reconciled: (Row | MetaRow)[] = rows.map((row) => {
		if (row.id != null) return row;
		const id = stored.find(
			(entry) => entry.id != null && entry.key === row.key && !claimed.has(entry.id)
		)?.id;
		if (id == null) return row;
		claimed.add(id);
		return { ...row, id };
	});
	for (const entry of stored) {
		if (entry.id == null || claimed.has(entry.id)) continue;
		if (!openedWith.has(String(entry.key ?? ''))) continue;
		if (PROTECTED_ORDER_META_KEYS.includes(String(entry.key ?? ''))) continue;
		reconciled.push({ id: entry.id, key: entry.key, value: null });
	}
	return reconciled;
}
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
	flushRef?: React.RefObject<(() => Promise<boolean>) | null>;
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
	// The meta keys the draft opened with: only one of these, gone from the draft, is a deletion.
	const openedWithMetaKeys = React.useRef(
		new Set((formData.meta_data ?? []).map((row) => String(row?.key ?? '')))
	);

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
			// an edit: it would be pushed as blank meta. The draft is the form's own, so a row the
			// store has numbered since (a sync while the sheet stayed open) takes its id back from
			// the order by key, or the store would append a copy instead of updating the row.
			const patch = {
				[root]:
					root === 'meta_data' && Array.isArray(value)
						? reconcileMetaWithOrder(
								value.filter(
									(row) =>
										!PROTECTED_ORDER_META_KEYS.includes(String(row?.key ?? '')) &&
										(row?.id != null || String(row?.key ?? '') !== '')
								),
								order.getLatest().payload.meta_data ?? [],
								openedWithMetaKeys.current
							)
						: value,
			};
			// Resolves whether the record holds the edit: flush() hands that to Sync order and Send.
			return writeOrderFields(order, () => patch).then((written) => {
				if (written) markSaved([root]);
				return written;
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
		// Busy from here: the confirmation's buttons disable, so a Cancel pressed while a slow
		// autosave is flushing cannot dismiss a send that then goes ahead anyway.
		setLoading(true);
		// A note still debounced or being written lands first, or the push would miss it and the
		// rollback snapshot below would carry the value before it. A failed write stops the send;
		// its failure was already reported.
		if (!(await flush())) {
			setLoading(false);
			setPending(null);
			return;
		}
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

	const currencyRow = useCurrencyRow(useWatch({ control: form.control, name: 'currency' }));

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<PropertyList prefix="order-meta">
					<PropertyRow id="customer_note" label={t('common.customer_note')} align="top">
						<FormField
							control={form.control}
							name="customer_note"
							render={({ field }) => (
								<FormTextarea
									testID="order-note-input"
									minHeight={80}
									{...field}
									placeholder={t('common.add_value', { label: t('common.customer_note') })}
								/>
							)}
						/>
					</PropertyRow>
					<Form {...handOverForm}>
						<PropertyRow id="status" label={t('common.status')}>
							<FormField
								control={handOverForm.control}
								name="status"
								render={({ field }) => (
									<View testID="order-meta-status">
										<FormSelect
											customComponent={OrderStatusSelect}
											allowed={allowedStatuses}
											disabled={!statusPushable}
											{...field}
										/>
									</View>
								)}
							/>
						</PropertyRow>
						<PropertyRow id="cashier" label={t('common.cashier')}>
							<FormField
								control={handOverForm.control}
								name="cashier_id"
								render={({ field }) => (
									<View testID="order-meta-cashier">
										<FormCombobox
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
						</PropertyRow>
						{/* An intent keeps its verb button (property rows rule 12). */}
						<PropertyRow
							testID="order-meta-row-hand_over"
							label={t('pos_cart.hand_over')}
							verb={
								<Button
									variant="outline"
									testID="order-meta-send"
									disabled={
										loading || (status === payload.status && cashierId === currentCashierId)
									}
									onPress={() => void onSend()}
								>
									{t('common.send')}
								</Button>
							}
						>
							<Text className="text-muted-foreground text-sm">{t('pos_cart.hand_over_hint')}</Text>
						</PropertyRow>
					</Form>
					{currencyRow.shown && (
						<PropertyRow id="currency" label={t('common.currency')}>
							<FormField
								control={form.control}
								name="currency"
								render={({ field }) => (
									<FormSelect
										customComponent={CurrencySelect}
										{...field}
										value={field.value ?? ''}
									/>
								)}
							/>
						</PropertyRow>
					)}
					<MetaDataForm testID="order-meta" hiddenKeys={PROTECTED_ORDER_META_KEYS} />
					<PropertyAddRow>
						{!currencyRow.shown && (
							<PropertyAdd
								testID="order-meta-add-currency"
								label={t('common.currency')}
								onPress={currencyRow.show}
							/>
						)}
						<PropertyAdd
							testID="order-meta-add-meta_data"
							label={t('common.custom_field')}
							onPress={() =>
								form.setValue('meta_data', [
									...(form.getValues('meta_data') ?? []),
									META_DATA_DEFAULT_ROW,
								])
							}
						/>
					</PropertyAddRow>
				</PropertyList>
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
					<AlertDialogFooter
						cancel={{
							testID: 'order-meta-send-cancel',
							disabled: loading,
							onPress: () => setPending(null),
						}}
						confirm={{
							label: t('common.send'),
							testID: 'order-meta-send-confirm',
							loading,
							disabled: loading,
							onPress: () => void handleSend(),
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</Form>
	);
}
