import * as React from 'react';
import { ScrollView, type TextInputInstance, View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Card } from '@wcpos/components/card';
import { Notice } from '@wcpos/components/notice';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { Chip } from '@wcpos/components/chip';
import { Button } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';

import { useStoreSession } from '../../../../contexts/app-state';
import { useStoreDayLabel } from '../../../../hooks/use-store-day-label';
import { credentialsListResource } from '../../../../hooks/user-db-list-resources';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { RegisterAmount } from './movement-sheet';

export function OpenRegisterCard({ onLastClosure }: { onLastClosure?: () => void }) {
	const { binding, lastClosed, lastClosure, actions, blind, closedElsewhere } =
		useRegisterSession();
	const { site, store } = useStoreSession();
	const credentials = useObservableSuspense(credentialsListResource(site));
	const { time } = useStoreDayLabel(store.id);
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
			// With the keyboard up after typing the float, the first tap on a chip or Open register
			// must run the action, not just dismiss the keyboard.
			keyboardShouldPersistTaps="handled"
			testID="open-register-card"
		>
			{closedElsewhere && (
				<Notice
					tone="info"
					testID="open-register-closed-elsewhere"
					title={t('register.closed_on_another_till', {
						register: binding.registerName,
						name:
							credentials.find((row) => row.id === closedElsewhere.by)?.display_name ??
							t('register.unknown_cashier'),
						time: time(closedElsewhere.at),
					})}
				/>
			)}
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
				[blind ? null : lastCount, 'last'],
			].map(
				([value, source]) =>
					value != null && (
						<Chip
							key={source}
							testID={`open-register-chip-${source}`}
							on={amount === value}
							label={
								source === 'default'
									? t('register.float_default_chip', { amount: format(Number(value)) })
									: t('register.float_last_chip', { amount: format(Number(value)) })
							}
							onPress={() => setAmount(value)}
						/>
					)
			)}
			<Button
				testID="open-register-button"
				size="lg"
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
			{!!error && <Text className="text-bad">{error}</Text>}
			{lastClosure && (
				<ListRow
					testID="open-register-last-closure"
					size="sm"
					onPress={onLastClosure}
					// The card's closing line, ruled off above, in the card's own padding.
					className="gap-2 border-t border-b-0 px-0"
					bodyClassName="flex-row items-center gap-2"
					leading={<Icon name="chevronRight" className="text-muted-foreground" />}
				>
					<Text className="text-muted-foreground">{t('register.last_closure')}</Text>
					<Text className="text-muted-foreground shrink">
						{t('reports.closure_n', { n: lastClosure.server_number ?? lastClosure.number })}
						{/* Blind count: the previous cash figure stays hidden here as it does in RegisterPanel. */}
						{!blind && lastClosure.counted?.cash != null
							? ` · ${format(Number(lastClosure.counted.cash))}`
							: ''}
					</Text>
				</ListRow>
			)}
		</ScrollView>
	);
}

export function CountingElsewhereCard() {
	const { binding, countingBy } = useRegisterSession();
	const { store } = useStoreSession();
	const { time } = useStoreDayLabel(store.id);
	const t = useT();
	return (
		<View className="p-4">
			<Card padding="body" testID="counting-elsewhere-card" className="gap-3">
				<ToneDisc tone="muted" icon="register" size="sm" />
				<Text variant="section">{binding.registerName}</Text>
				<Text>{t('register.counting_on_another_till')}</Text>
				{countingBy && (
					<Text testID="counting-elsewhere-by" variant="key">
						{t('register.counting_by_since', {
							name: countingBy.name ?? t('register.unknown_cashier'),
							time: countingBy.at ? time(countingBy.at) : '—',
						})}
					</Text>
				)}
			</Card>
		</View>
	);
}
