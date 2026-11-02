import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@wcpos/components/alert-dialog';
import { Form, FormField, FormTextarea } from '@wcpos/components/form';
import { MoneyList } from '@wcpos/components/money-list';
import { DialogBody, DialogFooter } from '@wcpos/components/dialog';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import {
	calculateLineItemRefund,
	calculateRefundTotal,
	computeMaxRefundable,
	computeRemainingRefundQuantity,
	formatLineItemRefundWithTax,
	formatRefundUnitPrice,
} from './calculate-refund';
import { classifyRefundFailure } from './refund-failure';
import { useRefundMutation } from './use-refund-mutation';
import { useAppState } from '../../../../contexts/app-state';
import { FormAmountField } from '../../components/amount-field';
import { useT } from '../../../../contexts/translations';
import { useTaxSettingsOptional } from '../../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../../contexts/tax-rates/resolve-price-num-decimals';
import {
	deriveRefundDestinationOptions,
	RefundDestination,
} from '../../hooks/payment-gateway-contract';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentGateways } from '../../hooks/use-payment-gateways';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { isStorageBlockedError, useStorageMoneyPathGuard } from '../../hooks/use-storage-health';

const refundLogger = getLogger(['wcpos', 'mutations', 'refund']);

type OrderPayload = EngineRecord<'orders'>['payload'];
type RefundDetail = NonNullable<OrderPayload['refunds']>[number] & {
	amount?: string | number | null;
	line_items?: {
		id?: number;
		item_id?: number;
		quantity?: number | string;
		meta_data?: { key?: string; value?: unknown }[];
	}[];
};

interface Props {
	order: EngineRecord<'orders'>;
}

function createRefundFormSchema(dp: number) {
	const decimalPattern = dp === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{0,${dp}})?$`);

	return z
		.object({
			line_items: z.array(
				z.object({
					id: z.number(),
					name: z.string(),
					quantity: z.number(),
					remaining_quantity: z.number(),
					total: z.string(),
					total_tax: z.string(),
					taxes: z.array(z.object({ id: z.number(), total: z.string() })),
					refund_qty: z.number().int().min(0),
				})
			),
			custom_amount: z
				.string()
				.optional()
				.default('')
				.refine((v) => v === '' || decimalPattern.test(v), 'Invalid amount'),
			reason: z.string().optional().default(''),
			refund_destination: z.enum(['original_method', 'cash']).default('cash'),
		})
		.superRefine(({ line_items }, ctx) => {
			line_items.forEach((item, index) => {
				if (item.refund_qty > item.remaining_quantity) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Refund qty cannot exceed purchased qty',
						path: ['line_items', index, 'refund_qty'],
					});
				}
			});
		});
}

type RefundFormValues = z.infer<ReturnType<typeof createRefundFormSchema>>;

/** Renders the form used to calculate and submit an order refund. */
export function RefundOrderForm({ order }: Props) {
	const t = useT();
	const { store } = useAppState();
	const refundMutation = useRefundMutation();
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	const http = useRestHttpClient();
	const router = useRouter();
	const taxRates = useTaxSettingsOptional();
	const storeDp = useDocField(store, (value) => value.wc_price_decimals) as number | undefined;
	const taxDisplayCart = useDocField(store, (value) => value.tax_display_cart) as
		'incl' | 'excl' | undefined;
	const displayTax: 'incl' | 'excl' = taxDisplayCart === 'excl' ? 'excl' : 'incl';
	const dp = resolvePriceNumDecimals({
		contextDp: taxRates?.priceNumDecimals,
		storeDp,
	});
	const [loading, setLoading] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const orderData = useRecordField(order, (record) => record.payload);
	const [refundDetails, setRefundDetails] = React.useState<RefundDetail[]>(() =>
		normalizeRefundDetails(orderData.refunds || [])
	);
	const [refundDetailsLoading, setRefundDetailsLoading] = React.useState(Boolean(orderData.id));
	const refundsFallback = JSON.stringify(orderData.refunds || []);
	const getRefundsFallback = React.useCallback(() => {
		const refunds = JSON.parse(refundsFallback) as RefundDetail[];
		return normalizeRefundDetails(Array.isArray(refunds) ? refunds : []);
	}, [refundsFallback]);

	const refundFormSchema = React.useMemo(() => createRefundFormSchema(dp), [dp]);
	const {
		gateway,
		loading: gatewaysLoading,
		error: gatewaysError,
	} = usePaymentGateways(orderData.payment_method || '');
	const { format } = useCurrencyFormat({
		currencySymbol: orderData.currency_symbol || '',
	});
	const refundOptions = React.useMemo(() => deriveRefundDestinationOptions(gateway), [gateway]);
	const isPosCash = orderData.payment_method === 'pos_cash';
	const awaitingGateway = gatewaysLoading && !isPosCash;
	const defaultDestination: RefundDestination = isPosCash
		? 'cash'
		: refundOptions[0]?.enabled
			? 'original_method'
			: 'cash';

	React.useEffect(() => {
		let mounted = true;

		if (!orderData.id) {
			// eslint-disable-next-line react-hooks/set-state-in-effect -- loader effect writing its result; pre-existing, surfaced when form.watch's compiler bailout went away. The component does not compile regardless (try/finally). Follow-up: derive the fallback instead of setting it.
			setRefundDetails(getRefundsFallback());
			setRefundDetailsLoading(false);
			return;
		}

		setRefundDetailsLoading(true);

		void http
			.get(`orders/${orderData.id}/refunds`, { params: { page: 1, per_page: 100 } })
			.then(async (response) => {
				if (!mounted) return;
				const firstPage = Array.isArray(response?.data) ? response.data : [];
				const totalPages = Number(response?.headers?.['x-wp-totalpages'] || 1) || 1;
				const remainingPages = await Promise.all(
					Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
						http
							.get(`orders/${orderData.id}/refunds`, {
								params: { page: index + 2, per_page: 100 },
							})
							.then((pageResponse) => (Array.isArray(pageResponse?.data) ? pageResponse.data : []))
					)
				);
				if (!mounted) return;
				setRefundDetails(normalizeRefundDetails([...firstPage, ...remainingPages.flat()]));
				setRefundDetailsLoading(false);
			})
			.catch((error: unknown) => {
				// The refund limits fall back to the order's saved refunds; recorded so a
				// support case can see the store's history was not read.
				refundLogger.info('Refund history not loaded from the store; using the saved refunds', {
					context: { orderId: orderData.id, error: getErrorMessage(error) },
				});
				if (!mounted) return;
				setRefundDetails(getRefundsFallback());
				setRefundDetailsLoading(false);
			});

		return () => {
			mounted = false;
		};
	}, [getRefundsFallback, http, orderData.id]);

	const previousRefundTotal = React.useMemo(() => {
		if (!refundDetails.length) return 0;
		return refundDetails.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	}, [refundDetails]);

	const maxRefundable = computeMaxRefundable(orderData.total || '0', refundDetails, dp);

	const initialLineItems = React.useMemo(() => {
		return (orderData.line_items || []).map((item) => ({
			id: item.id ?? 0,
			name: item.name || '',
			quantity: item.quantity ?? 0,
			remaining_quantity: refundDetailsLoading
				? 0
				: computeRemainingRefundQuantity({
						lineItemId: item.id ?? 0,
						quantity: item.quantity ?? 0,
						refunds: refundDetails,
					}),
			total: item.total || '0.00',
			total_tax: item.total_tax || '0.00',
			taxes: (item.taxes || []).map((tax) => ({
				id: tax.id ?? 0,
				total: tax.total || '0.00',
			})),
			refund_qty: 0,
		}));
	}, [orderData.line_items, refundDetails, refundDetailsLoading]);

	const form = useForm<RefundFormValues>({
		resolver: zodResolver(refundFormSchema as never) as never,
		defaultValues: {
			line_items: initialLineItems,
			custom_amount: '',
			reason: '',
			refund_destination: defaultDestination,
		},
	});

	React.useEffect(() => {
		const currentLineItems = form.getValues('line_items') || [];
		form.reset(
			{
				...form.getValues(),
				line_items: initialLineItems.map((item, index) => ({
					...item,
					refund_qty: Math.min(currentLineItems[index]?.refund_qty ?? 0, item.remaining_quantity),
				})),
			},
			{ keepDirty: true, keepTouched: true }
		);
	}, [form, initialLineItems]);

	React.useEffect(() => {
		if (form.getFieldState('refund_destination').isDirty) {
			return;
		}

		if (gatewaysError) {
			form.setValue('refund_destination', 'cash');
			return;
		}

		if (!gatewaysLoading) {
			form.setValue('refund_destination', defaultDestination);
		}
	}, [defaultDestination, form, gatewaysError, gatewaysLoading]);

	const { fields } = useFieldArray({
		control: form.control,
		name: 'line_items',
	});

	const watchedLineItems = useWatch({
		control: form.control,
		name: 'line_items',
	});
	const watchedCustomAmount = useWatch({
		control: form.control,
		name: 'custom_amount',
	});
	const refundDestination = useWatch({
		control: form.control,
		name: 'refund_destination',
	});

	const lineItemRefunds = React.useMemo(() => {
		return watchedLineItems.map((item) =>
			calculateLineItemRefund({
				quantity: item.quantity,
				total: item.total,
				taxes: item.taxes,
				refundQty: item.refund_qty,
				dp,
			})
		);
	}, [watchedLineItems, dp]);

	const refundTotal = React.useMemo(() => {
		return calculateRefundTotal({
			lineItemRefunds,
			customAmount: watchedCustomAmount || '',
			dp,
		});
	}, [lineItemRefunds, watchedCustomAmount, dp]);

	const refundTotalNum = parseFloat(refundTotal);
	const formattedRefundTotal = format(refundTotalNum);
	const isValid = !refundDetailsLoading && refundTotalNum > 0 && refundTotalNum <= maxRefundable;

	const handleSubmit = React.useCallback(async () => {
		// Gateways still loading: the destination is not known yet (it must not default
		// to cash and refund the wrong way), so nothing is submitted. A POS cash order
		// needs no gateway contract — its refund is always cash.
		if (loading || refundDetailsLoading || awaitingGateway) return;
		if (!orderData.id) return;
		// #163 follow-up ruling: the latch can fire while the confirm dialog sits
		// open, so re-read it here rather than trusting the rendered disabled state.
		if (blockIfDegraded('refund', { orderId: orderData.id })) {
			setConfirmOpen(false);
			return;
		}
		const valid = await form.trigger();
		if (!valid) return;
		setConfirmOpen(false);
		setLoading(true);

		try {
			const values = form.getValues();

			const freshLineItemRefunds = values.line_items.map((item) =>
				calculateLineItemRefund({
					quantity: item.quantity,
					total: item.total,
					taxes: item.taxes,
					refundQty: item.refund_qty,
					dp,
				})
			);

			const freshRefundTotal = calculateRefundTotal({
				lineItemRefunds: freshLineItemRefunds,
				customAmount: values.custom_amount || '',
				dp,
			});

			const refundLineItems = values.line_items
				.map((item, index) => {
					const clampedQty = Math.min(Math.max(item.refund_qty, 0), item.remaining_quantity);
					if (clampedQty === 0) return null;
					const calc = freshLineItemRefunds[index];
					return {
						id: item.id,
						quantity: clampedQty,
						refund_total: calc.refund_total,
						refund_tax: calc.refund_tax,
					};
				})
				.filter(Boolean);

			await refundMutation({
				order,
				amount: freshRefundTotal,
				reason: values.reason || '',
				lineItems: refundLineItems as {
					id: number;
					quantity: number;
					refund_total: string;
					refund_tax: { id: number; refund_total: string }[];
				}[],
				refundDestination: values.refund_destination,
			});

			refundLogger.success(t('orders.refund_processed', { amount: freshRefundTotal }), {
				showToast: true,
				context: {
					orderId: orderData.id,
					amount: freshRefundTotal,
					reason: values.reason || '',
				},
			});

			router.back();
		} catch (err: any) {
			// The mutation's own guard already surfaced the reason — don't stack a
			// generic "refund failed" toast on top of it.
			if (isStorageBlockedError(err)) return;

			const report = classifyRefundFailure(err, t);
			const options = {
				showToast: true,
				toast: {
					title: report.title,
					...(report.text2 !== undefined && { text2: report.text2 }),
				},
				context: {
					orderId: orderData.id,
					status: err?.response?.status,
					error: getErrorMessage(err),
				},
			};
			if (report.code === undefined) {
				refundLogger.info('Refund not sent: WCPOS was in the background', options);
			} else {
				refundLogger[report.level === 'error' ? 'error' : 'warn']('Refund failed', {
					...options,
					code: report.code,
				});
			}
		} finally {
			setLoading(false);
		}
	}, [
		blockIfDegraded,
		loading,
		awaitingGateway,
		refundDetailsLoading,
		form,
		order,
		orderData.id,
		refundMutation,
		router,
		t,
		dp,
	]);

	return (
		<Form {...form}>
			<DialogBody contentContainerClassName="gap-4">
				<MoneyList>
					<MoneyList.Row
						testID="refund-order-total"
						label={t('common.total')}
						amount={format(parseFloat(orderData.total || '0'))}
					/>
					{previousRefundTotal > 0 && (
						<MoneyList.Row
							testID="refund-previously-refunded"
							label={t('orders.previously_refunded')}
							amount={format(-previousRefundTotal)}
						/>
					)}
				</MoneyList>

				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="flex-[3]">
								<Text>{t('common.product')}</Text>
							</TableHead>
							<TableHead className="flex-1">
								<Text>{t('common.price')}</Text>
							</TableHead>
							<TableHead className="flex-1">
								<Text>{t('pos_cart.qty_abbrev')}</Text>
							</TableHead>
							<TableHead className="flex-1">
								<Text>{t('orders.refund_qty')}</Text>
							</TableHead>
							<TableHead className="flex-1">
								<Text>{t('orders.refund_amount')}</Text>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{fields.map((field, index) => {
							const unitPrice = formatRefundUnitPrice({
								quantity: field.quantity,
								total: field.total,
								totalTax: field.total_tax,
								displayTax,
								dp,
							});
							const itemRefund = lineItemRefunds[index];
							const itemRefundWithTax = formatLineItemRefundWithTax(itemRefund, dp);

							return (
								<TableRow key={field.id}>
									<TableCell className="flex-[3]">
										<Text numberOfLines={1}>{field.name}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<Text>{unitPrice}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<Text>{field.remaining_quantity}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<FormField
											control={form.control}
											name={`line_items.${index}.refund_qty`}
											render={({ field: qtyField }) => (
												<FormAmountField kind="count" live {...qtyField} />
											)}
										/>
									</TableCell>
									<TableCell className="flex-1">
										<Text>{itemRefundWithTax}</Text>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>

				<FormField
					control={form.control}
					name="custom_amount"
					render={({ field }) => (
						<FormAmountField
							kind="money"
							live
							// Typed to the places it is validated to, which need not be the store's.
							places={dp}
							label={t('orders.custom_refund_amount')}
							testID="refund-custom-amount"
							placeholder={(0).toFixed(dp)}
							{...field}
						/>
					)}
				/>

				<FormField
					control={form.control}
					name="reason"
					render={({ field }) => (
						<FormTextarea
							label={t('orders.refund_reason')}
							placeholder={t('orders.refund_reason_placeholder')}
							{...field}
						/>
					)}
				/>

				{!isPosCash ? (
					<VStack space="sm">
						<Text>{t('orders.refund_destination')}</Text>
						<SegmentedControl
							value={refundDestination}
							onValueChange={(next) =>
								form.setValue('refund_destination', next as RefundDestination, {
									shouldDirty: true,
								})
							}
							segments={[
								{
									value: 'original_method',
									label: t('orders.refund_to_original_method', {
										gateway: orderData.payment_method_title || orderData.payment_method || '',
									}),
									disabled: !refundOptions[0].enabled,
									testID: 'refund-destination-original_method',
								},
								{
									value: 'cash',
									label: t('orders.refund_to_cash'),
									testID: 'refund-destination-cash',
								},
							]}
						/>
						{refundOptions[0].enabled ? null : (
							<Text variant="help">{t('orders.original_method_refund_unavailable')}</Text>
						)}
					</VStack>
				) : null}

				{gatewaysError && !isPosCash ? (
					<Text className="text-muted-foreground">
						{t('orders.original_method_refund_lookup_failed')}
					</Text>
				) : null}

				<MoneyList.Total label={t('orders.refund_total')} amount={formattedRefundTotal} />
			</DialogBody>
			<DialogFooter
				close
				intent={{
					label: t('orders.process_refund'),
					testID: 'process-refund-button',
					disabled: !isValid || storageDegraded || awaitingGateway,
					onPress: () => setConfirmOpen(true),
					loading: loading || awaitingGateway,
				}}
			/>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('orders.confirm_refund')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('orders.confirm_refund_description', {
								amount: formattedRefundTotal,
								number: orderData.id,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter
						confirm={{
							destructive: true,
							label: t('orders.process_refund'),
							testID: 'confirm-process-refund-button',
							onPress: () => void handleSubmit(),
							disabled: loading || storageDegraded || awaitingGateway,
						}}
					/>
				</AlertDialogContent>
			</AlertDialog>
		</Form>
	);
}

/**
 * Deliberately NOT @wcpos/order-math's `refundValue`: this form needs the SIGNED
 * display string (embedded orderData.refunds[] rows carry negative totals; full refund
 * documents carry positive amounts), and it prefers `total` because that is the
 * signed spelling when both exist. `refundValue` is the positive-magnitude rule
 * for sums and deductions — converting this site would flip the sign in the
 * refund modal. Owner-ruled 2026-08-19 (post-review audit follow-up).
 */
function normalizeRefundDetails(refunds: RefundDetail[]): RefundDetail[] {
	return refunds.map((refund) => {
		const total = refund.total ?? refund.amount;
		return {
			...refund,
			total: total == null ? '0' : String(total),
		};
	});
}
