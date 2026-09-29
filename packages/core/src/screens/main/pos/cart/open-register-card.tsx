import * as React from 'react';
import { Pressable, ScrollView, type TextInputInstance, View } from 'react-native';

import { Chip } from '@wcpos/components/chip';
import { Button } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';

import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { RegisterAmount } from './movement-sheet';

export function OpenRegisterCard({ onLastClosure }: { onLastClosure?: () => void }) {
	const { binding, lastClosed, lastClosure, actions } = useRegisterSession();
	const defaultFloat = binding.registers.find(
		(row) => row.id === binding.registerId
	)?.default_float;
	const lastCount = lastClosed?.counted?.cash;
	const expectedFloat = defaultFloat ?? lastCount ?? null;
	const [enteredAmount, setAmount] = React.useState<string | null>(null);
	const amount = enteredAmount ?? expectedFloat ?? '';
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const input = React.useRef<TextInputInstance>(null);
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
		<ScrollView
			className="flex-1"
			contentContainerClassName="gap-4 px-4 py-5"
			testID="open-register-card"
		>
			{lastClosure && (
				<Text className="text-muted-foreground">
					{t('register.last_closure')} {lastClosure.server_number ?? lastClosure.number} ·{' '}
					{new Date(lastClosure.closed_at).toLocaleString([], {
						dateStyle: 'short',
						timeStyle: 'short',
					})}
				</Text>
			)}
			<View className="gap-2">
				<Text className="text-muted-foreground">{t('register.cash_in_drawer')}</Text>
				<RegisterAmount
					variant="box"
					ref={input}
					testID="open-register-amount"
					value={amount}
					onChangeText={setAmount}
				/>
			</View>
			{[
				[defaultFloat, 'default'],
				[lastCount, 'last'],
			].map(
				([value, source]) =>
					value != null && (
						<Chip
							key={source}
							testID={`open-register-chip-${source}`}
							on={amount === value}
							label={t(`register.float_${source}_chip`, { amount: format(Number(value)) })}
							onPress={() => setAmount(value)}
						/>
					)
			)}
			<Button
				testID="open-register-button"
				size="xl"
				className="w-full"
				loading={busy}
				disabled={!amount || !Number.isFinite(Number(amount)) || Number(amount) < 0}
				onPress={open}
			>
				{t('register.open_register')}
			</Button>
			{expectedFloat !== null && Number(amount) !== Number(expectedFloat) && (
				<Text testID="opening-variance" className="text-muted-foreground">
					{t('register.opening_variance', {
						amount: format(Number(amount) - Number(expectedFloat)),
					})}
				</Text>
			)}
			{!!error && <Text className="text-destructive">{error}</Text>}
			{lastClosure && (
				<Pressable
					testID="open-register-last-closure"
					accessibilityRole="button"
					onPress={onLastClosure}
					className="border-border min-h-ctl active:bg-muted web:hover:bg-muted flex-row items-center gap-2 border-t"
				>
					<Icon name="chevronRight" className="text-muted-foreground" />
					<Text className="text-muted-foreground">{t('register.last_closure')}</Text>
					<Text className="text-muted-foreground shrink">
						{t('reports.closure_n', { n: lastClosure.server_number ?? lastClosure.number })}
						{lastClosure.counted?.cash != null
							? ` · ${format(Number(lastClosure.counted.cash))}`
							: ''}
					</Text>
				</Pressable>
			)}
		</ScrollView>
	);
}
