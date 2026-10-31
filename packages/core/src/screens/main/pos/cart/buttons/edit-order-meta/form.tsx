import * as React from 'react';
import { View } from 'react-native';

import { zodResolver } from '@hookform/resolvers/zod';
import { useObservableSuspense } from 'observable-hooks';
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
import { Form, FormCombobox, FormField, FormSelect, FormTextarea } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Notice } from '@wcpos/components/notice';
import {
	PropertyAdd,
	PropertyAddRow,
	PropertyList,
	PropertyRow,
} from '@wcpos/components/property-row';
import { Switch } from '@wcpos/components/switch';
import { Text } from '@wcpos/components/text';
import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { OPEN_ORDER_STATUSES, useDocField, useRecordField } from '@wcpos/query';
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
import {
	useRegisterBinding,
	useRegisterDirectory,
} from '../../../../../../services/register/use-register-binding';
import { CurrencySelect } from '../../../../components/currency-select';
import { CashierSelect } from '../../../../components/cashier-select';
import { useCurrencyRow } from '../../../../components/order/order-rows';
import { OrderStatusSelect } from '../../../../components/order/order-status-select';
import { pushFailureCode } from '../../../../contexts/push-failure-code';
import { usePushDocument } from '../../../../contexts/use-push-document';
import { useCashierLabel } from '../../../../hooks/use-cashier-label';
import { useOrderStatusLabel } from '../../../../hooks/use-order-status-label';
import { storeListResource } from '../../../../hooks/store-list-resource';
import { useStorageMoneyPathGuard } from '../../../../hooks/use-storage-health';
import { useCurrentOrderActions } from '../../../contexts/current-order';
import { FormErrors } from '../../../../components/form-errors';
import {
	META_DATA_DEFAULT_ROW,
	MetaDataForm,
	metaDataSchema,
} from '../../../../components/meta-data-form';
import { useRecordAutosave } from '../../../../components/use-record-autosave';
import { useOrderFieldsWrite } from '../../../commands/use-order-fields-write';
import { useSetTaxExempt, useWcVersion } from '../../../commands/use-tax-exempt';
import { useCheckoutMode } from '../../../checkout/checkout-mode';
import { useOrderSaveState } from '../../../checkout/use-order-save-state';
import { useOrderMoneyDivergence } from '../../../contexts/order-money-divergence';
import { useCartConfigReader } from '../../../hooks/use-cart-config';
import { taxExemptRowState } from './tax-exempt-row';

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

/** The cart's open-orders scope: open status, cashier, store and register (`openOrdersSelector`). */
const handOverSchema = z.object({
	status: z.string(),
	cashier_id: z.string(),
	store_id: z.string(),
	register_id: z.string(),
});
type HandOverField = 'status' | 'cashier' | 'store' | 'register';
/** One staged field: its ids (`from`, `to`) and display names (`before`, `after`). */
type HandOverChange = {
	field: HandOverField;
	label: string;
	from: string;
	to: string;
	before: string;
	after: string;
};

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
	const { registerId: boundRegisterId } = useRegisterBinding();
	// The order as the cart's scope reads it: a missing store or register is this till's, which is
	// what a send stamps. Built from the live payload (`handOverData`), never a render-time
	// `order.getLatest()`, which the React Compiler would cache per order.
	const base: HandOverValues = {
		...handOverData,
		store_id: handOverData.store_id || String(storeID ?? NO_STORE),
		register_id: handOverData.register_id || (boundRegisterId ?? ''),
	};
	/** Out of this cart's scope on any of its four conditions (`openOrdersSelector`). */
	const leavesCart = (values: HandOverValues) =>
		!(OPEN_ORDER_STATUSES as readonly string[]).includes(values.status) ||
		values.cashier_id !== String(cashierID) ||
		(storeID !== undefined && storeID !== NO_STORE && values.store_id !== String(storeID)) ||
		(!!boundRegisterId && values.register_id !== boundRegisterId);
	// The staged hand-off, with whether the cashier changed the status and whether it leaves this
	// cart (both judged when staged).
	const [pending, setPending] = React.useState<
		(HandOverValues & { statusEdit: boolean; leaves: boolean }) | null
	>(null);
	const [loading, setLoading] = React.useState(false);

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
		values: base,
	});
	// Resolves whether the record holds the edit: flush() hands that to Sync order and Send.
	const { flush } = useRecordAutosave({
		form,
		stored: () => order.getLatest().payload,
		persist: (data) => writeOrderFields(order, () => data),
		// Autosave never writes the identity rows: the hand-over does, on Send, and the local
		// patch keeps the stored ones.
		metaDraft: (rows) =>
			rows.filter((row) => !PROTECTED_ORDER_META_KEYS.includes(String(row?.key ?? ''))),
	});
	React.useEffect(() => {
		if (!flushRef) return;
		flushRef.current = flush;
		return () => {
			flushRef.current = null;
		};
	}, [flush, flushRef]);
	const [status, cashierId, storeId, registerId] = useWatch({
		control: handOverForm.control,
		name: ['status', 'cashier_id', 'store_id', 'register_id'],
	});
	// Offer only what a till may push (ADR 0040 D4); a server-owned status shows read-only.
	const statusPushable = isPushableOrderStatus(handOverData.status);
	const allowedStatuses = statusPushable
		? PUSHABLE_ORDER_STATUSES
		: [...PUSHABLE_ORDER_STATUSES, handOverData.status];
	const { label: cashierLabel } = useCashierLabel(cashierId);
	const { label: cashierBefore } = useCashierLabel(base.cashier_id);
	const { getLabel: statusLabel } = useOrderStatusLabel();
	const stores = useObservableSuspense(storeListResource(wpCredentials));
	const storeOptions = React.useMemo(
		() => stores.map((row) => ({ value: String(row.id), label: row.name ?? '' })),
		[stores]
	);
	const target = useRegisterDirectory(Number(storeId) || NO_STORE);
	const { registers: registersBefore } = useRegisterDirectory(Number(base.store_id) || NO_STORE);
	// An empty list means "no registers" only once the store has answered (as `switch-confirm`).
	const targetLoaded = target.loaded || target.registers.length > 0;
	const storeChanged = storeId !== base.store_id;
	const storeName = (id: string) => stores.find((row) => String(row.id) === id)?.name || id;
	const registerName = (id: string) =>
		[...registersBefore, ...target.registers].find((row) => row.id === id)?.name || id;
	const staged: HandOverChange[] = [
		{
			field: 'status',
			label: t('common.status'),
			from: base.status,
			to: status,
			before: statusLabel(base.status),
			after: statusLabel(status),
		},
		{
			field: 'cashier',
			label: t('common.cashier'),
			from: base.cashier_id,
			to: cashierId,
			before: cashierBefore,
			after: cashierLabel,
		},
		{
			field: 'store',
			label: t('common.store'),
			from: base.store_id,
			to: storeId,
			before: storeName(base.store_id),
			after: storeName(storeId),
		},
		{
			field: 'register',
			label: t('register.register'),
			from: base.register_id,
			to: registerId,
			before: registerName(base.register_id),
			after: registerName(registerId),
		},
	];
	const changes = staged.filter((change) => change.from !== change.to);
	const changed = (field: HandOverField) => changes.some((change) => change.field === field);
	const tone = (field: HandOverField) => (changed(field) ? ('attention' as const) : undefined);
	const leaves = leavesCart({
		status,
		cashier_id: cashierId,
		store_id: storeId,
		register_id: registerId,
	});
	// The register_id the store's one register means, written once its directory answers.
	const onlyRegister =
		storeChanged && targetLoaded && target.registers.length === 1 ? target.registers[0].id : '';
	React.useEffect(() => {
		// eslint-disable-next-line react-you-might-not-need-an-effect/no-event-handler -- The store's directory answers asynchronously, after the pick.
		if (onlyRegister) handOverForm.setValue('register_id', onlyRegister);
	}, [onlyRegister, handOverForm]);
	const blocked =
		// Another store: wait for its registers; with some, one is chosen before the order can go.
		(storeChanged && (!targetLoaded || (target.registers.length > 0 && !registerId))) ||
		// The confirm names the new cashier: never "Hand this order to ?".
		(changed('cashier') && !cashierLabel);
	// The confirm names where the order goes: a cashier, else the place, else just the store.
	const placeName = (field: HandOverField) =>
		changes.find((change) => change.field === field && change.to)?.after;
	const place = [placeName('store'), placeName('register')].filter(Boolean).join(' · ');
	const confirmCopy = changed('cashier')
		? {
				title: t('pos_cart.hand_order_to_question', { name: cashierLabel }),
				description: place
					? t('pos_cart.hand_order_to_place_description', { name: cashierLabel, place })
					: t('pos_cart.hand_order_to_description', { name: cashierLabel }),
				confirm: t('pos_cart.send_to', { name: cashierLabel }),
			}
		: place
			? {
					title: t('pos_cart.send_order_to_question', { name: place }),
					description: t('pos_cart.send_order_to_description', { name: place }),
					confirm: t('pos_cart.send_to', { name: place }),
				}
			: {
					title: t('pos_cart.send_order_title'),
					description: t('pos_cart.send_order_description'),
					confirm: t('common.send'),
				};
	// Only the hand-over's own values are staged: the edit form's fields are already on the order
	// (or refused by the gate), so the send never carries them.
	const onSend = handOverForm.handleSubmit((data) => {
		const statusEdit = data.status !== order.getLatest().payload.status;
		setPending({ ...data, statusEdit, leaves });
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
		const { cashier_id, status, store_id, register_id, statusEdit: statusChanged } = pending;
		// Status is an intent, never an echo (ADR 0040): only a status the cashier changed goes
		// out, judged when the hand-off was staged. A cashier-only hand-off sends none, so a stale
		// open copy (or a completion a pull adopted meanwhile) cannot reopen a sale another till
		// completed, and its rollback restores the cashier alone. The identity is stamped onto the
		// order's meta as it stands (the autosaved rows included), never onto a form snapshot.
		const patch = () => ({
			...(statusChanged ? { status } : {}),
			meta_data: wooMetaCarrier.stampIdentity(previous.meta_data ?? [], {
				userId: cashier_id,
				storeId: Number(store_id) || NO_STORE,
				// None chosen keeps the order's own, unless it moved to a store without registers.
				registerId: register_id || (store_id !== base.store_id ? null : undefined),
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
			if (pending.leaves) setCurrentOrderID('');
		} catch (error) {
			if (patched) {
				// The identity is restored by value: a protected row the send added (a register the
				// order never had) survives a plain restore, so it is cleared explicitly.
				const reverted = await writeOrderFields(order, () => ({
					...(statusChanged ? { status: previous.status } : {}),
					meta_data: wooMetaCarrier.stampIdentity(previous.meta_data ?? [], {
						userId: identity.cashierId ?? '',
						storeId: identity.storeId ?? NO_STORE,
						registerId: identity.registerId ?? null,
						tillId: identity.tillId,
					}),
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
	// Tax exempt is a command, not an autosaved field: the switch reads the live record, so an
	// autosave of the other rows can neither carry nor revert it.
	const setTaxExempt = useSetTaxExempt();
	// The command reads the locks imperatively at toggle time; the row subscribes to them, so a
	// checkout, refused save or ownership change that leaves the payload alone still disables it.
	const configForOrder = useCartConfigReader();
	const saveState = useOrderSaveState(order.uuid);
	const checkoutOrders = useCheckoutMode().checkoutOrders;
	const { serverOwnsMoney } = useOrderMoneyDivergence(order.uuid);
	const taxReaders = {
		configForOrder,
		orderSaveState: () => saveState,
		inCheckout: () => checkoutOrders.has(order.uuid),
		serverOwnsMoney: () => serverOwnsMoney,
	};
	// As add-coupon: the store, not just a network (the command waits on its coupon references).
	const online = useOnlineStatus().status === 'online-website-available';
	const live = useRecordField(order, (record) => record.payload);
	const exempt = wooMetaCarrier.vatExempt(live.meta_data);
	const { dp } = taxReaders.configForOrder(live);
	const wcVersion = useWcVersion();
	const taxExempt = taxExemptRowState(live, order, taxReaders, dp, online, wcVersion());

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
						{/* One group: the cart's scope. The band turns amber once anything is staged; each
						    changed picker takes the field's amber. Not a live region: it holds pickers. */}
						<Notice
							testID="order-meta-hand-over"
							live={false}
							tone={changes.length > 0 ? 'warning' : 'info'}
							title={t('pos_cart.hand_over')}
							description={t('pos_cart.hand_over_hint')}
						>
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
												tone={tone('status')}
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
												tone={tone('cashier')}
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
							{stores.length > 1 && (
								<PropertyRow id="store" label={t('common.store')}>
									<FormField
										control={handOverForm.control}
										name="store_id"
										render={({ field }) => (
											<View testID="order-meta-store">
												<FormSelect
													options={storeOptions}
													placeholder={t('common.store')}
													triggerTestID="order-meta-store-select"
													tone={tone('store')}
													{...field}
													onChange={(next: string) => {
														// The phone sheet reports a re-pick of the same store: keep the register.
														if (next === field.value) return;
														field.onChange(next);
														// Registers belong to a store: back home, the order's own returns.
														handOverForm.setValue(
															'register_id',
															next === base.store_id ? base.register_id : ''
														);
													}}
												/>
											</View>
										)}
									/>
								</PropertyRow>
							)}
							{/* Name only: a select row carries no description for the live state. */}
							{target.registers.length > 0 && (
								<PropertyRow id="register" label={t('register.register')}>
									<FormField
										control={handOverForm.control}
										name="register_id"
										render={({ field }) => (
											<View testID="order-meta-register">
												<FormSelect
													options={target.registers.map((row) => ({
														value: row.id,
														label: row.name,
													}))}
													placeholder={t('common.select_register')}
													triggerTestID="order-meta-register-select"
													tone={tone('register')}
													{...field}
												/>
											</View>
										)}
									/>
								</PropertyRow>
							)}
							<HStack className="items-center justify-between gap-3 pt-2">
								<View testID="order-meta-hand-over-summary" className="min-w-0 flex-1 gap-0.5">
									<Text variant="key">
										{leaves ? t('pos_cart.leaves_this_cart') : t('pos_cart.stays_in_this_cart')}
									</Text>
									<ChangeRows changes={changes} />
								</View>
								{/* An intent keeps its verb button (property rows rule 12). */}
								<Button
									variant="outline"
									testID="order-meta-send"
									disabled={loading || changes.length === 0 || blocked}
									onPress={() => void onSend()}
								>
									{t('common.send')}
								</Button>
							</HStack>
						</Notice>
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
					{!taxExempt.hidden && (
						<PropertyRow
							id="tax_exempt"
							label={t('pos_cart.tax_exempt')}
							help={
								taxExempt.reason === 'reopen'
									? t('pos_cart.tax_exempt_reopen')
									: taxExempt.reason === 'offline'
										? t('pos_cart.tax_exempt_offline')
										: taxExempt.reason === 'payment'
											? t('pos_cart.tax_exempt_payment')
											: taxExempt.reason === 'wc_version'
												? t('pos_cart.tax_exempt_wc_version')
												: t('pos_cart.tax_exempt_hint')
							}
							testID="order-meta-tax-exempt"
							control={
								<Switch
									checked={exempt}
									disabled={taxExempt.disabled}
									onCheckedChange={(checked) => void setTaxExempt(order, checked)}
									accessibilityLabel={t('pos_cart.tax_exempt')}
									testID="order-meta-tax-exempt-switch"
								/>
							}
						/>
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
						<AlertDialogTitle>{confirmCopy.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{leaves ? confirmCopy.description : t('pos_cart.send_order_stays_description')}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<View testID="order-meta-send-changes" className="gap-1 px-4">
						<ChangeRows changes={changes} labelled />
					</View>
					<AlertDialogFooter
						cancel={{
							testID: 'order-meta-send-cancel',
							disabled: loading,
							onPress: () => setPending(null),
						}}
						confirm={{
							label: confirmCopy.confirm,
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

/** The staged fields, before → after as the totals banner writes it; the confirm names each key. */
function ChangeRows({
	changes,
	labelled = false,
}: {
	changes: readonly HandOverChange[];
	labelled?: boolean;
}) {
	const t = useT();
	return changes.map((change) => (
		<HStack key={change.field} className="flex-wrap items-baseline gap-2">
			{labelled && <Text variant="key">{change.label}</Text>}
			<Text variant="subheading">
				{t('pos_cart.totals_disagree_change', {
					before: change.before || '—',
					after: change.after || '—',
				})}
			</Text>
		</HStack>
	));
}
