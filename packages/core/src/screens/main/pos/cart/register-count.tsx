import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { fromMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { ApproveSheet } from './approve-sheet';
import { RegisterAmount } from './movement-sheet';
import { denominations } from './register-count.denominations';
import {
	countVariance,
	denominationTotal,
	overThreshold,
	validAmount,
	varianceText,
} from './register-count.helpers';

import type { ClosureCount } from './closure-sheet';

function DenominationTile({
	value,
	count,
	add,
}: {
	value: string;
	count: number;
	add: (pieces: number) => void;
}) {
	const { format } = useCurrencyFormat();
	const held = React.useRef(false);
	const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);
	const stop = () => clearInterval(timer.current);
	// A held tile must stop ticking when the fold or count view unmounts.
	React.useEffect(() => () => clearInterval(timer.current), []);
	return (
		<Pressable
			testID={`den-tile-${value}`}
			accessibilityRole="button"
			accessibilityLabel={format(Number(value))}
			className="border-border bg-muted active:bg-accent h-14 flex-1 flex-row items-center justify-center gap-1 rounded-md border"
			// Web otherwise adds its default 50 ms press-in delay to the hold duration.
			{...(Platform.OS === 'web' ? { delayPressIn: 0 } : {})}
			delayLongPress={400}
			onPressIn={() => {
				held.current = false;
			}}
			onLongPress={() => {
				held.current = true;
				add(10);
				timer.current = setInterval(() => add(10), 150);
			}}
			onPressOut={stop}
			onPress={() => {
				if (!held.current) add(1);
			}}
		>
			<Text className="tabular-nums">{format(Number(value))}</Text>
			<Text testID={`den-count-${value}`} className="bg-background rounded-full px-1 tabular-nums">
				{count}
			</Text>
		</Pressable>
	);
}

export function RegisterCount({ onClosed }: { onClosed: (count: ClosureCount) => void }) {
	const { session, actions, expected, blind, binding, varianceThreshold, unsyncedCount } =
		useRegisterSession();
	const { store } = useStoreSession();
	const currency = useDocField(store, (value) => value.currency);
	const [cash, setCash] = React.useState(session?.counted?.cash ?? '');
	const [pieces, setPieces] = React.useState<Record<string, number>>({});
	const [others, setOthers] = React.useState<Record<string, string>>(() =>
		Object.fromEntries(
			Object.entries(session?.counted ?? {}).filter(([method]) => method !== 'cash')
		)
	);
	const [notesOpen, setNotesOpen] = React.useState(false);
	const [tendersOpen, setTendersOpen] = React.useState(false);
	const [approving, setApproving] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const { format } = useCurrencyFormat();
	const t = useT();
	const amount = Object.keys(pieces).length ? fromMinor(denominationTotal(pieces), 2) : cash;
	const valid = validAmount(amount);
	const variance = countVariance(amount, expected.cash ?? '0');
	const needsManager =
		!!session?.approval_required || (!blind && valid && overThreshold(variance, varianceThreshold));
	const faces = denominations[currency ?? ''] ?? denominations.default;
	const counted = {
		cash: amount,
		...Object.fromEntries(Object.entries(others).filter(([, value]) => value !== '')),
	};
	const completed = () => onClosed({ counted: amount, expected: expected.cash ?? '0', blind });
	const attempt = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError('');
		try {
			await action();
		} catch {
			setError(t('register.count_failed'));
		} finally {
			setBusy(false);
		}
	};
	return (
		<ScrollView className="bg-card flex-1 rounded-md" contentContainerClassName="gap-3 p-4">
			<Text className="min-h-11">
				{t('register.close_register_title', { name: binding.registerName })}
			</Text>
			<Text>{t('register.cash_counted_float_included')}</Text>
			<RegisterAmount
				testID="count-amount"
				value={amount}
				onChangeText={(value) => {
					setPieces({});
					setCash(value);
				}}
			/>
			{!blind && valid && (
				<View className="min-h-11 flex-row items-center gap-2">
					<Text testID="count-variance" className="tabular-nums">
						{t('register.expected_line', { amount: format(Number(expected.cash ?? '0')) })} ·{' '}
						{varianceText(variance, format, t)}
					</Text>
					{variance === 0 && (
						<View testID="count-exact">
							<Icon name="check" className="text-success" />
						</View>
					)}
				</View>
			)}
			{needsManager && (
				<Text testID="count-manager-line" className="text-warning min-h-11">
					{session?.approval_required
						? t('register.approval_needed')
						: t('register.over_limit_manager', { amount: format(Number(varianceThreshold)) })}
				</Text>
			)}
			<Button
				testID="count-denominations"
				variant="ghost"
				className="min-h-11"
				onPress={() => setNotesOpen(!notesOpen)}
			>
				{t('register.count_by_denominations')}
			</Button>
			{notesOpen && (
				<View className="gap-2">
					{Array.from({ length: Math.ceil(faces.length / 4) }, (_, row) => (
						<View key={row} className="flex-row gap-2">
							{Array.from({ length: 4 }, (_, column) => {
								const value = faces[row * 4 + column];
								return value ? (
									<DenominationTile
										key={value}
										value={value}
										count={pieces[value] ?? 0}
										add={(n) =>
											setPieces((previous) => ({
												...previous,
												[value]: (previous[value] ?? 0) + n,
											}))
										}
									/>
								) : (
									<View key={column} className="flex-1" />
								);
							})}
						</View>
					))}
					<Button
						testID="count-clear"
						variant="ghost"
						className="min-h-11 self-end"
						onPress={() => {
							setPieces({});
							setCash('0.00');
						}}
					>
						{t('register.clear')}
					</Button>
				</View>
			)}
			<Button
				testID="count-other-tenders"
				variant="ghost"
				className="min-h-11"
				onPress={() => setTendersOpen(!tendersOpen)}
			>
				{t('register.other_tenders')}
			</Button>
			{tendersOpen &&
				Object.keys(expected)
					.filter((method) => method !== 'cash')
					.map((method) => (
						<View key={method} className="gap-2">
							<Text>
								{method === 'card'
									? t('register.card_counted')
									: t('register.tender_counted', { method })}
							</Text>
							<RegisterAmount
								testID={`count-tender-${method}`}
								value={others[method] ?? ''}
								onChangeText={(value) => setOthers({ ...others, [method]: value })}
							/>
						</View>
					))}
			{unsyncedCount > 0 && (
				<Text testID="count-unsynced" className="text-muted-foreground min-h-11">
					{t('register.unsynced_sales', { count: unsyncedCount })}
				</Text>
			)}
			{!!error && <Text testID="count-error">{error}</Text>}
			<Button
				testID="count-back"
				variant="outline"
				className="min-h-11"
				disabled={busy}
				onPress={() => attempt(actions.backToSelling)}
			>
				{t('register.back_to_selling')}
			</Button>
			<Button
				testID="count-close"
				className="min-h-14"
				loading={busy}
				disabled={
					!valid || Object.values(others).some((value) => value !== '' && !validAmount(value))
				}
				onPress={() => {
					if (needsManager) setApproving(true);
					else
						void attempt(async () => {
							await actions.closeSession({ counted });
							completed();
						});
				}}
			>
				{t(needsManager ? 'register.approve_and_close' : 'register.close_and_print')}
			</Button>
			{approving && (
				<ApproveSheet counted={counted} onClosed={completed} onOpenChange={setApproving} />
			)}
		</ScrollView>
	);
}
