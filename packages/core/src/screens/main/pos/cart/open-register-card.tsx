import * as React from 'react';
import { type TextInput, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';

import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { RegisterAmount, useSessionReport } from './movement-sheet';

export function OpenRegisterCard() {
	const { binding, lastClosed, actions } = useRegisterSession();
	const defaultFloat = binding.registers.find(
		(row) => row.id === binding.registerId
	)?.default_float;
	const lastCount = lastClosed?.counted?.cash;
	const expectedFloat = defaultFloat ?? lastCount ?? null;
	const [enteredAmount, setAmount] = React.useState<string | null>(null);
	const amount = enteredAmount ?? expectedFloat ?? '';
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const input = React.useRef<TextInput>(null);
	const t = useT();
	const { format } = useCurrencyFormat();
	const open = async () => {
		if (busy) return;
		setBusy(true);
		try {
			await actions.openSession({ expectedFloat, countedFloat: amount });
			Toast.show({
				title: t('register.register_open_toast', { amount: format(Number(amount)) }),
				type: 'success',
			});
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	};
	return (
		<View className="bg-card flex-1 gap-3 rounded-md p-4" testID="open-register-card">
			<Text>{t('register.open_register')}</Text>
			<RegisterAmount
				ref={input}
				testID="open-register-amount"
				value={amount}
				onChangeText={setAmount}
			/>
			{[
				[defaultFloat, 'default'],
				[lastCount, 'last'],
			].map(
				([value, source]) =>
					value != null && (
						<Button
							key={source}
							testID={`open-register-chip-${source}`}
							variant="outline"
							className="min-h-11"
							onPress={() => setAmount(value)}
						>
							{t(`register.float_${source}_chip`, { amount: format(Number(value)) })}
						</Button>
					)
			)}
			{expectedFloat !== null && Number(amount) !== Number(expectedFloat) && (
				<Text testID="opening-variance">
					{t('register.opening_variance', {
						amount: format(Number(amount) - Number(expectedFloat)),
					})}
				</Text>
			)}
			{!!error && <Text>{error}</Text>}
			<Button
				testID="open-register-button"
				className="min-h-14"
				loading={busy}
				disabled={!amount || !Number.isFinite(Number(amount)) || Number(amount) < 0}
				onPress={open}
			>
				{t('register.open_register')}
			</Button>
			<View className="flex-1" />
			<Button
				testID="checkout-open-register"
				variant="ghost"
				onPress={() => input.current?.focus()}
			>
				{t('register.open_register')}
			</Button>
		</View>
	);
}
export function RegisterCount() {
	const { actions, expected, blind } = useRegisterSession();
	const [amount, setAmount] = React.useState('');
	const [error, setError] = React.useState('');
	const { print } = useSessionReport();
	const { format } = useCurrencyFormat();
	const t = useT();
	return (
		<View className="bg-card flex-1 gap-3 p-4">
			<Text>{t('register.cash_counted')}</Text>
			<RegisterAmount testID="count-amount" value={amount} onChangeText={setAmount} />
			{!blind && (
				<Text>
					{t('register.expected', { amount: format(Number(expected.cash ?? 0)) })} ·{' '}
					{format(Number(amount) - Number(expected.cash ?? 0))}
				</Text>
			)}
			{!!error && <Text>{error}</Text>}
			<Button
				testID="count-back"
				variant="outline"
				onPress={() => actions.backToSelling().catch((e: unknown) => setError(String(e)))}
			>
				{t('register.back_to_selling')}
			</Button>
			<Button
				testID="count-close"
				disabled={!amount || !Number.isFinite(Number(amount)) || Number(amount) < 0}
				onPress={async () => {
					try {
						// The Z print belongs to the closure landing (#251); this close only records the count.
						await actions.closeSession({ counted: { cash: amount } });
					} catch (e) {
						setError(String(e));
					}
				}}
			>
				{t('register.close_and_print')}
			</Button>
		</View>
	);
}
