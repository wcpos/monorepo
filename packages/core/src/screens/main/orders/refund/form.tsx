import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
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
import { Form, FormField, FormInput, FormTextarea } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalAction, ModalClose } from '@wcpos/components/modal';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@wcpos/components/table';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { extractErrorMessage } from '@wcpos/hooks/use-http-client/parse-wp-error';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import {
	calculateLineItemRefund,
	calculateRefundTotal,
	computeMaxRefundable,
	computeRemainingRefundQuantity,
	formatLineItemRefundWithTax,
	formatRefundUnitPrice,
} from './calculate-refund';
import { RefundDestinationRadioGroup } from './refund-destination-radio-group';
import { useRefundMutation } from './use-refund-mutation';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { TaxRatesContext } from '../../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../../contexts/tax-rates/resolve-price-num-decimals';
import {
	deriveRefundDestinationOptions,
	RefundDestination,
} from '../../hooks/payment-gateway-contract';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentGateways } from '../../hooks/use-payment-gateways';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const refundLogger = getLogger(['wcpos', 'mutations', 'refund']);

type OrderDocument = import('@wcpos/database').OrderDocument;
type RefundDetail = NonNullable<OrderDocument['refunds']>[number] & {
	amount?: string | number | null;
	line_items?: {
		id?: number;
		item_id?: number;
		quantity?: number | string;
		meta_data?: { key?: string; value?: unknown }[];
	}[];
};

interface Props {
	order: OrderDocument;
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

export function RefundOrderForm({ order }: Props) {
	const t = useT();
	const { store } = useAppState();
	const refundMutation = useRefundMutation();
	const http = useRestHttpClient();
	const router = useRouter();
	const taxRates = React.useContext(TaxRatesContext);
	const storeDp = useObservableEagerState(store?.wc_price_decimals$) as number | undefined;
	const taxDisplayCart = useObservableEagerState(store?.tax_display_cart$) as
		| 'incl'
		| 'excl'
		| undefined;
	const displayTax: 'incl' | 'excl' = taxDisplayCart === 'excl' ? 'excl' : 'incl';
	const dp = resolvePriceNumDecimals({
		contextDp: taxRates?.priceNumDecimals,
		storeDp,
	});
	const [loading, setLoading] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);
	const [refundDetails, setRefundDetails] = React.useState<RefundDetail[]>(() =>
		normalizeRefundDetails(order.refunds || [])
	);
	const [refundDetailsLoading, setRefundDetailsLoading] = React.useState(Boolean(order.id));
	const refundsFallback = JSON.stringify(order.refunds || []);
	const getRefundsFallback = React.useCallback(() => {
		const refunds = JSON.parse(refundsFallback) as RefundDetail[];
		return normalizeRefundDetails(Array.isArray(refunds) ? refunds : []);
	}, [refundsFallback]);

	const refundFormSchema = React.useMemo(() => createRefundFormSchema(dp), [dp]);
	const {
		gateway,
		loading: gatewaysLoading,
		error: gatewaysError,
	} = usePaymentGateways(order.payment_method || '');
	const { format } = useCurrencyFormat({
		currencySymbol: order.currency_symbol || '',
	});
	const refundOptions = React.useMemo(() => deriveRefundDestinationOptions(gateway), [gateway]);
	const isPosCash = order.payment_method === 'pos_cash';
	const defaultDestination: RefundDestination = isPosCash
		? 'cash'
		: refundOptions[0]?.enabled
			? 'original_method'
			: 'cash';

	React.useEffect(() => {
		let mounted = true;

		if (!order.id) {
			setRefundDetails(getRefundsFallback());
			setRefundDetailsLoading(false);
			return;
		}

		setRefundDetailsLoading(true);

		void http
			.get(`orders/${order.id}/refunds`, { params: { page: 1, per_page: 100 } })
			.then(async (response) => {
				if (!mounted) return;
				const firstPage = Array.isArray(response?.data) ? response.data : [];
				const totalPages = Number(response?.headers?.['x-wp-totalpages'] || 1) || 1;
				const remainingPages = await Promise.all(
					Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) =>
						http
							.get(`orders/${order.id}/refunds`, {
								params: { page: index + 2, per_page: 100 },
							})
							.then((pageResponse) => (Array.isArray(pageResponse?.data) ? pageResponse.data : []))
					)
				);
				if (!mounted) return;
				setRefundDetails(normalizeRefundDetails([...firstPage, ...remainingPages.flat()]));
				setRefundDetailsLoading(false);
			})
			.catch(() => {
				if (!mounted) return;
				setRefundDetails(getRefundsFallback());
				setRefundDetailsLoading(false);
			});

		return () => {
			mounted = false;
		};
	}, [getRefundsFallback, http, order.id]);

	const previousRefundTotal = React.useMemo(() => {
		if (!refundDetails.length) return 0;
		return refundDetails.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	}, [refundDetails]);

	const maxRefundable = computeMaxRefundable(order.total || '0', refundDetails, dp);

	const initialLineItems = React.useMemo(() => {
		return (order.line_items || []).map((item) => ({
			id: item.id || 0,
			name: item.name || '',
			quantity: item.quantity || 0,
			remaining_quantity: refundDetailsLoading
				? 0
				: computeRemainingRefundQuantity({
						lineItemId: item.id || 0,
						quantity: item.quantity || 0,
						refunds: refundDetails,
					}),
			total: item.total || '0.00',
			total_tax: item.total_tax || '0.00',
			taxes: (item.taxes || []).map((tax) => ({
				id: tax.id || 0,
				total: tax.total || '0.00',
			})),
			refund_qty: 0,
		}));
	}, [order.line_items, refundDetails, refundDetailsLoading]);

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
					refund_qty: Math.min(currentLineItems[index]?.refund_qty || 0, item.remaining_quantity),
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
		if (loading || refundDetailsLoading) return;
		if (!order.id) return;
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
				saveToDb: true,
				context: {
					orderId: order.id,
					amount: freshRefundTotal,
				},
			});

			router.back();
		} catch (err: any) {
			const serverMessage = extractErrorMessage(err?.response?.data, t('orders.refund_failed'));
			refundLogger.error(serverMessage, {
				showToast: true,
				saveToDb: true,
				context: {
					errorCode: ERROR_CODES.TRANSACTION_FAILED,
					orderId: order.id,
					error: err instanceof Error ? err.message : String(err),
				},
			});
		} finally {
			setLoading(false);
		}
	}, [loading, refundDetailsLoading, form, order, refundMutation, router, t, dp]);

	return (
		<Form {...form}>
			<VStack className="gap-4">
				<HStack className="justify-between">
					<Text className="text-muted-foreground">
						{t('common.total')}: {format(parseFloat(order.total || '0'))}
					</Text>
					{previousRefundTotal > 0 && (
						<Text className="text-muted-foreground">
							{t('orders.previously_refunded')}: {format(-previousRefundTotal)}
						</Text>
					)}
				</HStack>

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
											render={({ field: qtyField }) => <FormInput type="numeric" {...qtyField} />}
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
						<FormInput
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
						<RefundDestinationRadioGroup
							value={form.watch('refund_destination')}
							onValueChange={(next) =>
								form.setValue('refund_destination', next, { shouldDirty: true })
							}
							options={[
								{
									value: 'original_method',
									label: t('orders.refund_to_original_method', {
										gateway: order.payment_method_title || order.payment_method || '',
									}),
									description: refundOptions[0].enabled
										? undefined
										: t('orders.original_method_refund_unavailable'),
									enabled: refundOptions[0].enabled,
									testID: 'refund-destination-original_method',
								},
								{
									value: 'cash' as const,
									label: t('orders.refund_to_cash'),
									enabled: true,
									testID: 'refund-destination-cash',
								},
							]}
						/>
					</VStack>
				) : null}

				{gatewaysError && !isPosCash ? (
					<Text className="text-muted-foreground">
						{t('orders.original_method_refund_lookup_failed')}
					</Text>
				) : null}

				<HStack className="items-center justify-between border-t pt-4">
					<Text className="text-lg font-bold">{t('orders.refund_total')}</Text>
					<Text className="text-lg font-bold">{formattedRefundTotal}</Text>
				</HStack>

				<HStack className="justify-end">
					<ModalClose>{t('common.cancel')}</ModalClose>
					<ModalAction
						testID="process-refund-button"
						loading={loading}
						disabled={!isValid}
						onPress={() => setConfirmOpen(true)}
					>
						{t('orders.process_refund')}
					</ModalAction>
				</HStack>
			</VStack>

			<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t('orders.confirm_refund')}</AlertDialogTitle>
						<AlertDialogDescription>
							{t('orders.confirm_refund_description', {
								amount: formattedRefundTotal,
								number: order.id,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							testID="confirm-process-refund-button"
							onPress={handleSubmit}
							disabled={loading}
						>
							{t('orders.process_refund')}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Form>
	);
}

function normalizeRefundDetails(refunds: RefundDetail[]): RefundDetail[] {
	return refunds.map((refund) => {
		const total = refund.total ?? refund.amount;
		return {
			...refund,
			total: total == null ? '0' : String(total),
		};
	});
}
