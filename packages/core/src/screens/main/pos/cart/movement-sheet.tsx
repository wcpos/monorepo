import * as React from 'react';
import { type TextInput, View } from 'react-native';

import Mustache from 'mustache';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { PrinterService, usePrint } from '@wcpos/printer';

import { useT } from '../../../../contexts/translations';
import {
	movementFieldError,
	type MovementType,
	normalizeAmount,
} from '../../../../services/register-session/movement-input';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useResolvedPrinter } from '../../receipt/hooks/use-resolved-printer';
import { usePOSOverlaySide } from '../contexts/overlay-side';

const REPORT_TEMPLATE = { id: 'register-session', output_type: 'escpos', paper_width: null };

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
export function useSessionReport() {
	const { session, expected, blind, binding } = useRegisterSession();
	const { resolvedPrinter } = useResolvedPrinter({ template: REPORT_TEMPLATE });
	const t = useT();
	const { format } = useCurrencyFormat();
	const reportRows = Object.entries(blind ? {} : expected).map(([name, total]) => ({
		name,
		quantity: 1,
		total,
		amount: format(Number(total)),
	}));
	// No session report template exists yet: use the receipt pipeline's minimal offline payload.
	const report = usePrint({
		printerProfile: resolvedPrinter ? { ...resolvedPrinter, autoOpenDrawer: false } : undefined,
		html: Mustache.render(
			'<h1>{{title}}</h1><p>{{register}}</p><p>{{session}}</p>{{#rows}}<p>{{name}}: {{amount}}</p>{{/rows}}',
			{
				title: t('register.x_report'),
				register: binding.registerName,
				session: session?.id,
				rows: reportRows,
			}
		),
		receiptData: {
			store: { name: binding.registerName },
			order_number: session?.id,
			date_created: session?.opened_at_gmt,
			line_items: reportRows,
			footer: t('register.x_report'),
		},
	});
	return {
		print: report.print,
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
	// The cash moves the moment the cashier confirms, so the only safe place to catch an input
	// the server will refuse is before the tap — a 400 afterwards loses the money silently.
	const invalid = type ? movementFieldError({ type, amount, reason }) : 'amount';
	const confirm = async () => {
		if (!type || invalid || busyRef.current) return;
		busyRef.current = true;
		setBusy(true);
		const normalized = type === 'no_sale' ? '0' : normalizeAmount(amount);
		try {
			const row = await actions.recordMovement({ type, amount: normalized, reason });
			onDone(row.id, type, normalized);
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
				{!!invalid && (
					<Text testID="movement-invalid" className="text-muted-foreground">
						{t(`register.movement_needs_${invalid}`)}
					</Text>
				)}
				<Button testID="movement-confirm" loading={busy} disabled={!!invalid} onPress={confirm}>
					{t('register.movement_recorded')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
