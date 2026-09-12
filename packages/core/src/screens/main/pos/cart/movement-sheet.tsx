import * as React from 'react';
import { type TextInput, View } from 'react-native';

import type { ClosureDocument, ClosureRow } from '@wcpos/database';
import { useDocField } from '@wcpos/query';
import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { PrinterService } from '@wcpos/printer';

import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useResolvedPrinter } from '../../receipt/hooks/use-resolved-printer';
import { usePOSOverlaySide } from '../contexts/overlay-side';

const REPORT_TEMPLATE = { id: 'register-session', output_type: 'escpos', paper_width: null };

type MovementType = 'paid_in' | 'paid_out' | 'no_sale';
export function RegisterAmount(props: {
	value: string;
	onChangeText: (v: string) => void;
	testID: string;
	ref?: React.Ref<TextInput>;
}) {
	const { currencySymbol } = useCurrencyFormat();
	return (
		<View className="flex-row items-center self-start">
			<Text className="text-[32px] tabular-nums">{currencySymbol}</Text>
			<Input
				{...props}
				type="decimal"
				className="h-14 w-40"
				inputClassName="text-[32px] tabular-nums"
			/>
		</View>
	);
}
export function useSessionReport(closure?: ClosureDocument | null) {
	const { session, expected, blind, binding } = useRegisterSession();
	const snapshot = useDocField(closure, (row) => row);
	const { resolvedPrinter } = useResolvedPrinter({ template: REPORT_TEMPLATE });
	const t = useT();
	const { format } = useCurrencyFormat();
	const formatReport = (data: Record<string, unknown> = {}) => {
		const row = (data.closure ?? snapshot) as Partial<ClosureRow> | undefined;
		const figures = closure
			? {
					[t('register.counted')]: row?.counted?.cash,
					[t('register.expected', { amount: '' }).trim()]:
						row?.expected?.cash ?? row?.till_expected?.cash,
					[t('register.variance')]: row?.variance?.cash,
					[t('register.period_sales')]: row?.period_sales_total,
					[t('register.period_refunds')]: row?.period_refunds_total,
					[t('register.perpetual_sales')]: row?.perpetual_sales_total,
					[t('register.perpetual_refunds')]: row?.perpetual_refunds_total,
				}
			: blind
				? {}
				: (row?.expected ?? expected);
		const fiscal = data.fiscal as { is_reprint?: boolean; receipt_number?: string } | undefined;
		const footer = [
			(fiscal?.is_reprint ?? !!snapshot?.print_count) ? t('register.reprint_copy') : '',
			row?.unsynced_count ? t('register.unsynced_closure', { count: row.unsynced_count }) : '',
		]
			.filter(Boolean)
			.join(' · ');
		const title = t(closure ? 'register.z_report' : 'register.x_report');
		const line_items = Object.entries(figures).map(([name, total]) => ({
			name,
			quantity: 1,
			total,
			amount: format(Number(total ?? 0)),
		}));
		return {
			...data,
			closure: row,
			title,
			store: { name: binding.registerName },
			order_number: `${title} ${fiscal?.receipt_number ?? row?.printed_number ?? row?.number ?? session?.id ?? ''}`,
			date_created: row?.closed_at ?? session?.opened_at_gmt,
			line_items,
			lines: line_items.map((line) => ({ name: `${line.name}: ${line.amount}`, qty: 1 })),
			footer,
			customer_note: footer,
		};
	};
	const report = useReceiptDocument({
		autoPrintAllowed: false,
		document: closure
			? `closure:${closure.server_closure_id ?? closure.id}`
			: session
				? `xreport:${session.id}`
				: undefined,
		documentReady: closure ? snapshot?.sync_status === 'synced' : !!session,
		localReport: formatReport(),
		formatReport,
	});
	return {
		...report,
		doc: report,
		print: async () => {
			await report.print();
			const at = new Date().toISOString();
			if (closure)
				await closure.incrementalModify((row) => ({
					...row,
					printed_at: row.printed_at ?? at,
					print_count: row.print_count + 1,
				}));
			return at;
		},
		openDrawer: async () => {
			if (resolvedPrinter?.autoOpenDrawer) await new PrinterService().openDrawer(resolvedPrinter);
		},
	};
}
export function MovementSheet({
	type,
	onDone,
	onOpenChange,
}: {
	type: MovementType | null;
	onDone: (id: string, type: MovementType, amount: string) => void;
	onOpenChange: (open: boolean) => void;
}) {
	const { actions } = useRegisterSession();
	const { openDrawer } = useSessionReport();
	const [amount, setAmount] = React.useState('');
	const [reason, setReason] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	// Two taps before a render must not mint two paid-out rows.
	const busyRef = React.useRef(false);
	const [error, setError] = React.useState('');
	const t = useT();
	const side = usePOSOverlaySide();
	const confirm = async () => {
		if (!type || busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		try {
			const row = await actions.recordMovement({
				type,
				amount: type === 'no_sale' ? '0' : amount,
				reason,
			});
			onDone(row.id, type, amount);
			if (type === 'no_sale') await openDrawer();
			onOpenChange(false);
		} catch (e) {
			setError(String(e));
		} finally {
			busyRef.current = false;
			setBusy(false);
		}
	};
	return (
		<Dialog open={!!type} onOpenChange={onOpenChange}>
			<DialogContent side={side} portalHost="pos">
				<DialogTitle>{type ? t(`register.${type}`) : ''}</DialogTitle>
				{type !== 'no_sale' && (
					<RegisterAmount testID="movement-amount" value={amount} onChangeText={setAmount} />
				)}
				<Input
					testID="movement-reason"
					placeholder={t('register.reason')}
					value={reason}
					onChangeText={setReason}
				/>
				{!!error && <Text>{error}</Text>}
				<Button
					testID="movement-confirm"
					loading={busy}
					disabled={type !== 'no_sale' && !(Number(amount) > 0)}
					onPress={confirm}
				>
					{t('register.movement_recorded')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
