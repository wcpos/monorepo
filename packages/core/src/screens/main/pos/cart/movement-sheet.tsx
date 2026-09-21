import * as React from 'react';
import { type TextInput, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';

import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useT } from '../../../../contexts/translations';
import {
	movementFieldError,
	type MovementType,
	normalizeAmount,
} from '../../../../services/register-session/movement-input';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { type CurrencyFormatOptions, useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePOSOverlaySide } from '../contexts/overlay-side';

export function RegisterAmount({
	currencyOptions,
	...props
}: {
	currencyOptions?: CurrencyFormatOptions;
	value: string;
	onChangeText: (v: string) => void;
	testID: string;
	ref?: React.Ref<TextInput>;
}) {
	const { prefix, suffix } = useCurrencyFormat(currencyOptions);
	return (
		<View className="flex-row items-center self-start">
			{!!prefix && <Text className="text-[32px] tabular-nums">{prefix}</Text>}
			<Input
				{...props}
				type="decimal"
				className="h-14 w-40"
				inputClassName="text-[32px] tabular-nums"
			/>
			{!!suffix && <Text className="text-[32px] tabular-nums">{suffix}</Text>}
		</View>
	);
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
		// Send exactly what was validated. The length check is on the trimmed reason, so 500
		// characters and a trailing space passes here and 400s on arrival if sent raw.
		const trimmedReason = reason.trim();
		try {
			const row = await actions.recordMovement({ type, amount: normalized, reason: trimmedReason });
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
