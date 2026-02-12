import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
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
import { Form, FormField, FormInput, FormSwitch, FormTextarea } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { ModalAction, ModalClose, ModalFooter } from '@wcpos/components/modal';
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

import { calculateLineItemRefund, calculateRefundTotal } from './calculate-refund';
import { useT } from '../../../../contexts/translations';
import { usePullDocument } from '../../contexts/use-pull-document';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';

const refundLogger = getLogger(['wcpos', 'mutations', 'refund']);

type OrderDocument = import('@wcpos/database').OrderDocument;

interface Props {
	order: OrderDocument;
}

const CASH_METHODS = ['pos_cash', 'cod', 'cash', 'cash_on_delivery'];

const refundFormSchema = z
	.object({
		line_items: z.array(
			z.object({
				id: z.number(),
				name: z.string(),
				quantity: z.number(),
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
			.refine((v) => v === '' || /^\d+(\.\d{0,2})?$/.test(v), 'Invalid amount'),
		reason: z.string().optional().default(''),
		api_refund: z.boolean(),
	})
	.superRefine(({ line_items }, ctx) => {
		line_items.forEach((item, index) => {
			if (item.refund_qty > item.quantity) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Refund qty cannot exceed purchased qty',
					path: ['line_items', index, 'refund_qty'],
				});
			}
		});
	});

type RefundFormValues = z.infer<typeof refundFormSchema>;

export function RefundOrderForm({ order }: Props) {
	const t = useT();
	const http = useRestHttpClient();
	const router = useRouter();
	const pullDocument = usePullDocument();
	const [loading, setLoading] = React.useState(false);
	const [confirmOpen, setConfirmOpen] = React.useState(false);

	const isCashPayment = CASH_METHODS.includes(order.payment_method || '');

	const previousRefundTotal = React.useMemo(() => {
		if (!order.refunds?.length) return 0;
		return order.refunds.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	}, [order.refunds]);

	const maxRefundable = parseFloat(order.total || '0') - previousRefundTotal;

	const initialLineItems = React.useMemo(() => {
		return (order.line_items || []).map((item) => ({
			id: item.id || 0,
			name: item.name || '',
			quantity: item.quantity || 0,
			total: item.total || '0.00',
			total_tax: item.total_tax || '0.00',
			taxes: (item.taxes || []).map((tax) => ({
				id: tax.id || 0,
				total: tax.total || '0.00',
			})),
			refund_qty: 0,
		}));
	}, [order.line_items]);

	const form = useForm<RefundFormValues>({
		resolver: zodResolver(refundFormSchema as never) as never,
		defaultValues: {
			line_items: initialLineItems,
			custom_amount: '',
			reason: '',
			api_refund: !isCashPayment,
		},
	});

	const { fields } = useFieldArray({ control: form.control, name: 'line_items' });

	const watchedLineItems = useWatch({ control: form.control, name: 'line_items' });
	const watchedCustomAmount = useWatch({ control: form.control, name: 'custom_amount' });

	const lineItemRefunds = React.useMemo(() => {
		return watchedLineItems.map((item) =>
			calculateLineItemRefund({
				quantity: item.quantity,
				total: item.total,
				totalTax: item.total_tax,
				taxes: item.taxes,
				refundQty: item.refund_qty,
			})
		);
	}, [watchedLineItems]);

	const refundTotal = React.useMemo(() => {
		return calculateRefundTotal({
			lineItemRefunds,
			customAmount: watchedCustomAmount || '',
		});
	}, [lineItemRefunds, watchedCustomAmount]);

	const refundTotalNum = parseFloat(refundTotal);
	const isValid = refundTotalNum > 0 && refundTotalNum <= maxRefundable;

	const handleSubmit = React.useCallback(async () => {
		if (loading) return;
		if (!order.id) return;
		const valid = await form.trigger();
		if (!valid) return;
		setConfirmOpen(false);
		setLoading(true);

		try {
			const values = form.getValues();

			// Recompute at submit time to avoid stale memoized values
			const freshLineItemRefunds = values.line_items.map((item) =>
				calculateLineItemRefund({
					quantity: item.quantity,
					total: item.total,
					totalTax: item.total_tax,
					taxes: item.taxes,
					refundQty: item.refund_qty,
				})
			);

			const freshRefundTotal = calculateRefundTotal({
				lineItemRefunds: freshLineItemRefunds,
				customAmount: values.custom_amount || '',
			});

			const refundLineItems = values.line_items
				.map((item, index) => {
					const clampedQty = Math.min(Math.max(item.refund_qty, 0), item.quantity);
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

			const payload: Record<string, unknown> = {
				amount: freshRefundTotal,
				reason: values.reason || '',
				api_refund: values.api_refund,
			};

			if (refundLineItems.length > 0) {
				payload.line_items = refundLineItems;
			}

			await http.post(`orders/${order.id}/refunds`, payload);

			refundLogger.success(t('orders.refund_processed', { amount: freshRefundTotal }), {
				showToast: true,
				saveToDb: true,
				context: {
					orderId: order.id,
					amount: freshRefundTotal,
				},
			});

			// Re-sync the order to pick up updated refunds array and totals
			await pullDocument(order.id, order.collection as never);

			router.back();
		} catch (err: any) {
			const serverMessage = extractErrorMessage(
				err?.response?.data,
				t('orders.refund_failed')
			);
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
	}, [loading, form, http, order, pullDocument, router, t]);

	return (
		<Form {...form}>
			<VStack className="gap-4">
				{/* Order summary */}
				<HStack className="justify-between">
					<Text className="text-muted-foreground">
						{t('common.order_total')}: {order.currency_symbol}
						{order.total}
					</Text>
					{previousRefundTotal > 0 && (
						<Text className="text-muted-foreground">
							{t('orders.previously_refunded')}: -{order.currency_symbol}
							{previousRefundTotal.toFixed(2)}
						</Text>
					)}
				</HStack>

				{/* Line items table */}
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
								<Text>{t('common.qty')}</Text>
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
							const unitPrice =
								field.quantity > 0
									? (parseFloat(field.total) / field.quantity).toFixed(2)
									: '0.00';
							const itemRefund = lineItemRefunds[index];
							const itemRefundWithTax = itemRefund
								? (
										parseFloat(itemRefund.refund_total) +
										itemRefund.refund_tax.reduce(
											(s, t) => s + parseFloat(t.refund_total),
											0
										)
									).toFixed(2)
								: '0.00';

							return (
								<TableRow key={field.id}>
									<TableCell className="flex-[3]">
										<Text numberOfLines={1}>{field.name}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<Text>{unitPrice}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<Text>{field.quantity}</Text>
									</TableCell>
									<TableCell className="flex-1">
										<FormField
											control={form.control}
											name={`line_items.${index}.refund_qty`}
											render={({ field: qtyField }) => (
												<FormInput type="numeric" {...qtyField} />
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

				{/* Custom amount */}
				<FormField
					control={form.control}
					name="custom_amount"
					render={({ field }) => (
						<FormInput label={t('orders.custom_refund_amount')} placeholder="0.00" {...field} />
					)}
				/>

				{/* Reason */}
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

				{/* Gateway toggle */}
				<FormField
					control={form.control}
					name="api_refund"
					render={({ field }) => (
						<FormSwitch
							label={t('orders.refund_via_gateway', {
								gateway: order.payment_method_title || order.payment_method || '',
							})}
							{...field}
						/>
					)}
				/>

				{/* Refund total */}
				<HStack className="items-center justify-between border-t pt-4">
					<Text className="text-lg font-bold">{t('orders.refund_total')}</Text>
					<Text className="text-lg font-bold">
						{order.currency_symbol}
						{refundTotal}
					</Text>
				</HStack>

				{/* Footer */}
				<ModalFooter className="px-0">
					<ModalClose>{t('common.cancel')}</ModalClose>
					<ModalAction
						loading={loading}
						disabled={!isValid}
						onPress={() => setConfirmOpen(true)}
					>
						{t('orders.process_refund')}
					</ModalAction>
				</ModalFooter>

				{/* Confirmation dialog */}
				<AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>{t('orders.confirm_refund')}</AlertDialogTitle>
							<AlertDialogDescription>
								{t('orders.confirm_refund_description', {
									amount: `${order.currency_symbol}${refundTotal}`,
									number: order.id,
								})}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
							<AlertDialogAction variant="destructive" onPress={handleSubmit} disabled={loading}>
								{t('orders.process_refund')}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</VStack>
		</Form>
	);
}
