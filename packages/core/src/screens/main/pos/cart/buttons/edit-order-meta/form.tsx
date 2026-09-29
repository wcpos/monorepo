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
import {
	Combobox,
	ComboboxContent,
	ComboboxInput,
	ComboboxTrigger,
} from '@wcpos/components/combobox';
import {
	DialogAction,
	DialogBody,
	DialogClose,
	DialogFooter,
	useRootContext,
} from '@wcpos/components/dialog';
import {
	Form,
	FormCombobox,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormSelect,
	FormTextarea,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { useDocField } from '@wcpos/query';
import { NO_STORE, wooMetaCarrier } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useStoreSession } from '../../../../../../contexts/app-state';
import { useSearchSelect } from '../../../../../../query';
import { useT } from '../../../../../../contexts/translations';
import { CurrencySelect } from '../../../../components/currency-select';
import { CustomerList } from '../../../../components/customer-select';
import { OrderStatusSelect } from '../../../../components/order/order-status-select';
import { usePushDocument } from '../../../../contexts/use-push-document';
import { useCashierLabel } from '../../../../hooks/use-cashier-label';
import { useStorageMoneyPathGuard } from '../../../../hooks/use-storage-health';
import { useCurrentOrderActions } from '../../../contexts/current-order';
import { FormErrors } from '../../../../components/form-errors';
import { MetaDataForm, metaDataSchema } from '../../../../components/meta-data-form';
import { useLocalMutation } from '../../../../hooks/mutations/use-local-mutation';

import type { CurrentOrderRecord } from '../../../contexts/current-order';

/**
 *
 */
const cartLogger = getLogger(['wcpos', 'pos', 'cart', 'save']);

const formSchema = z.object({
	status: z.string(),
	cashier_id: z.string(),
	customer_note: z.string().optional(),
	// number: z.string().optional(), // Order number is read only??!
	currency: z.string().optional(),
	// currency_symbol: z.string().optional(), // Currency symbol is read only
	transaction_id: z.string().optional(),
	meta_data: metaDataSchema,
});

/**
 *
 */
type FormValues = z.infer<typeof formSchema>;

export function EditOrderMetaForm({
	order,
	formData,
	submitRef,
}: {
	order: CurrentOrderRecord;
	formData: FormValues;
	submitRef?: React.RefObject<(() => Promise<boolean>) | null>;
}) {
	const t = useT();
	const { localPatch } = useLocalMutation();
	const { onOpenChange } = useRootContext();
	const pushDocument = usePushDocument();
	const { setCurrentOrderID } = useCurrentOrderActions();
	const { blockIfDegraded } = useStorageMoneyPathGuard();
	const { store, wpCredentials } = useStoreSession();
	const storeID = useDocField(store, (value) => value.id);
	const cashierID = useDocField(wpCredentials, (value) => value.id);
	const [pending, setPending] = React.useState<FormValues | null>(null);
	const [loading, setLoading] = React.useState(false);
	const binding = useSearchSelect('cashier');

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema as never) as never,
		values: formData,
	});

	const cashierId = useWatch({ control: form.control, name: 'cashier_id' });
	const { label: cashierLabel } = useCashierLabel(cashierId);

	/**
	 * Apply the form. Resolves true only when the edits are written locally; false when the
	 * identity change awaits its confirmation (the send flow owns that) — a caller that pushes
	 * next must then stop, or the server gets the old values under a success toast.
	 */
	async function applySave(data: FormValues, { close }: { close: boolean }): Promise<boolean> {
		const payload = order.getLatest().payload;
		const currentCashierId = wooMetaCarrier.readIdentity(payload.meta_data).cashierId ?? '';
		const identityChanged = data.status !== payload.status || data.cashier_id !== currentCashierId;
		if (identityChanged) {
			setPending(data);
			return false;
		}
		const { cashier_id: _cashierId, ...patch } = data;
		const written = !!(await localPatch({ document: order, data: patch }));
		if (written && close) onOpenChange(false);
		return written;
	}
	async function handleSave(data: FormValues) {
		await applySave(data, { close: true });
	}

	async function handleSend() {
		if (!pending || loading) return;
		if (blockIfDegraded('save-order', { orderId: order.uuid ?? order.payload.id })) return;
		const previous = order.getLatest().payload;
		const identity = wooMetaCarrier.readIdentity(previous.meta_data);
		const { cashier_id, ...fields } = pending;
		const patch = {
			...fields,
			meta_data: wooMetaCarrier.stampIdentity(fields.meta_data, {
				userId: cashier_id,
				storeId: identity.storeId ?? storeID ?? NO_STORE,
				registerId: identity.registerId,
				tillId: identity.tillId,
			}),
		};
		setLoading(true);
		let patched = false;
		try {
			if (!(await localPatch({ document: order, data: patch }))) return;
			patched = true;
			await pushDocument(order);
			cartLogger.success(t('pos_cart.order_sent'), { showToast: true });
			onOpenChange(false);
			if (
				!['pos-open', 'pos-partial', 'pending'].includes(patch.status) ||
				cashier_id !== String(cashierID)
			) {
				setCurrentOrderID('');
			}
		} catch (error) {
			if (patched) {
				const reverted = await localPatch({
					document: order,
					data: { status: previous.status, meta_data: previous.meta_data },
				});
				// The failed send may still land: a timed-out outcome is unknown and a queued
				// mutation is retried. Open orders only reach the server on an explicit push,
				// so the revert is pushed too — the last write wins and the server ends up
				// where the cart is. Only once the revert actually landed locally: pushing a
				// resident that still carries the hand-off would re-send what we are undoing.
				// pushDocument toasts its own failure.
				if (reverted) void pushDocument(order).catch(() => undefined);
			}
			cartLogger.error('Failed to save order', {
				showToast: true,
				code: ERROR_CODES.SYNC_UNEXPECTED,
				toast: { title: t('common.failed_to_save_order') },
				context: { orderId: previous.id, error: getErrorMessage(error) },
			});
		} finally {
			setLoading(false);
			setPending(null);
		}
	}

	/**
	 * Form submission handlers that include validation
	 */
	const onSave = form.handleSubmit(handleSave);
	// Hand the submit to the sheet's footer (an effect: refs are not written during render). It
	// resolves whether the edits were applied: false on a validation failure or while an
	// identity change awaits confirmation, and it never closes the sheet under the push.
	React.useEffect(() => {
		if (!submitRef) return;
		submitRef.current = () =>
			new Promise<boolean>((resolve) => {
				void form.handleSubmit(
					async (data) => resolve(await applySave(data, { close: false })),
					() => resolve(false)
				)();
			});
		return () => {
			submitRef.current = null;
		};
	});

	/**
	 *
	 */
	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<FormErrors />
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="status"
						render={({ field }) => (
							<View className="flex-1" testID="order-meta-status">
								<FormSelect
									label={t('common.status')}
									customComponent={OrderStatusSelect}
									{...field}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="cashier_id"
						render={({ field }) => (
							<View className="flex-1">
								<FormItem>
									<FormLabel>{t('common.cashier')}</FormLabel>
									<Combobox
										value={{ value: field.value, label: cashierLabel }}
										onValueChange={(option) => {
											if (option) field.onChange(String(option.value));
										}}
									>
										<ComboboxTrigger asChild>
											<Button variant="outline" testID="order-meta-cashier">
												{cashierLabel || t('common.select_cashier')}
											</Button>
										</ComboboxTrigger>
										<ComboboxContent portalHost="pos">
											<ComboboxInput
												testID="order-meta-cashier-search"
												placeholder={t('common.search_cashiers')}
												value={binding.search}
												onChangeText={binding.setSearch}
											/>
											<Suspense>
												<CustomerList binding={binding} withGuest={false} />
											</Suspense>
										</ComboboxContent>
									</Combobox>
								</FormItem>
							</View>
						)}
					/>
				</HStack>
				<Text className="text-muted-foreground text-sm">
					{t('pos_cart.status_cashier_warning')}
				</Text>
				<FormField
					control={form.control}
					name="customer_note"
					render={({ field }) => (
						<FormTextarea
							label={t('common.customer_note')}
							testID="order-note-input"
							minHeight={80}
							{...field}
						/>
					)}
				/>
				<HStack className="gap-4">
					<FormField
						control={form.control}
						name="currency"
						render={({ field: { onChange, value, ...rest } }) => (
							<View className="flex-1">
								<FormCombobox
									customComponent={CurrencySelect}
									label={t('common.currency')}
									onChange={onChange}
									value={value ?? ''}
									{...rest}
								/>
							</View>
						)}
					/>
					<FormField
						control={form.control}
						name="transaction_id"
						render={({ field: { onChange, value, ...rest } }) => (
							<View className="flex-1">
								<FormInput
									label={t('common.transaction_id')}
									onChange={onChange}
									value={value ?? ''}
									{...rest}
								/>
							</View>
						)}
					/>
				</HStack>
				<MetaDataForm />
			</DialogBody>
			<DialogFooter>
				<DialogClose>{t('common.cancel')}</DialogClose>
				<DialogAction testID="order-meta-save" onPress={() => void onSave()} disabled={loading}>
					{t('common.save')}
				</DialogAction>
			</DialogFooter>
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
