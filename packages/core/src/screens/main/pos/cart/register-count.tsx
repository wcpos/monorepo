import * as React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { FormProvider, useForm, useWatch } from 'react-hook-form';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { FormItem, FormLabel } from '@wcpos/components/form/common';
import { FormFieldContext } from '@wcpos/components/form/context';
import { Input } from '@wcpos/components/input';
import { IconButton } from '@wcpos/components/icon-button';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { Icon } from '@wcpos/components/icon';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { TileGrid } from '@wcpos/components/tile-grid';
import { fromMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';

import { useOpenOrdersHandle } from '../contexts/current-order/use-open-orders-handle';
import { recordRegisterFact, useRegisterActor } from '../../../../services/register-session/audit';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterSession } from '../../../../services/register-session/use-register-session';
import { type CurrencyFormatOptions, useCurrencyFormat } from '../../hooks/use-currency-format';
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
import { isSameCount } from '../../../../services/register-session/same-count';

import type { ClosureCount } from './closure-written';

export function DenominationTile({
	currencyOptions,
	value,
	pieces,
	add,
}: {
	currencyOptions?: CurrencyFormatOptions;
	value: string;
	pieces: number;
	add: (pieces: number) => void;
}) {
	const { format } = useCurrencyFormat(currencyOptions);
	const held = React.useRef(false);
	const timer = React.useRef<ReturnType<typeof setInterval> | undefined>(undefined);
	const stop = () => clearInterval(timer.current);
	// A held tile must stop ticking when the fold or count view unmounts.
	React.useEffect(() => () => clearInterval(timer.current), []);
	return (
		<Tile
			testID={`den-tile-${value}`}
			badge={pieces}
			accessibilityLabel={format(Number(value))}
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
			<Text
				variant="key"
				className="max-w-full tabular-nums"
				numberOfLines={1}
				adjustsFontSizeToFit
			>
				{format(Number(value))}
			</Text>
		</Tile>
	);
}

export function RegisterCount({
	description,
	onBack,
	onClosed,
	onBusyChange,
	side,
	portalHost,
}: {
	side?: 'left' | 'right';
	portalHost?: string | null;
	description: string;
	onBack: () => void;
	onClosed: (count: ClosureCount) => void;
	/** The close in flight: the panel refuses its own dismissal meanwhile (Codex, #3073). */
	onBusyChange?: (busy: boolean) => void;
}) {
	const {
		session,
		actions,
		expected,
		blind,
		binding,
		varianceThreshold,
		unsyncedCount,
		figuresPending,
	} = useRegisterSession();
	const { store, wpCredentials } = useStoreSession();
	const openOrders = useOpenOrdersHandle(wpCredentials.id, store.id, binding.registerId);
	const carts = React.useSyncExternalStore(openOrders.subscribe, () => openOrders.value).count;
	const actor = useRegisterActor();
	const currency = useDocField(store, (value) => value.currency);
	const noteForm = useForm({ defaultValues: { note: '' } });
	const note = useWatch({ control: noteForm.control, name: 'note' });
	const noteId = React.useId();
	const noteRef = React.useRef<React.ComponentRef<typeof Input.InputField>>(null);
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
	const faces = denominations[currency ?? ''] ?? denominations.default;
	const counted = {
		cash: amount,
		...Object.fromEntries(Object.entries(others).filter(([, value]) => value !== '')),
	};
	const countedDenominations = faces
		.filter((value) => (pieces[value] ?? 0) > 0)
		.map((value) => ({ value, pieces: pieces[value] }));
	// A manager who already approved exactly this count is not asked again (a failed close or
	// a restart keeps the approval); a changed count or an unapproved over-threshold variance is.
	const approvedThisCount =
		!!session?.approved_counted && isSameCount(session.approved_counted, counted);
	const needsManager =
		!approvedThisCount &&
		(!!session?.approval_required ||
			!!session?.approved_counted ||
			(!blind && valid && overThreshold(variance, varianceThreshold)));
	const completed = (closure: ClosureCount['closure']) =>
		onClosed({ closure, counted: amount, expected: expected.cash ?? '0', blind });
	const attempt = async (action: () => Promise<unknown>) => {
		setBusy(true);
		onBusyChange?.(true);
		setError('');
		try {
			await action();
		} catch {
			setError(t('register.count_failed'));
		} finally {
			setBusy(false);
			onBusyChange?.(false);
		}
	};
	const body = (
		<ScrollView
			className="flex-1"
			contentContainerClassName="gap-4 px-4 py-5"
			keyboardShouldPersistTaps="handled"
		>
			<Text className="text-muted-foreground">{t('register.cash_counted_float_included')}</Text>
			<RegisterAmount
				testID="count-amount"
				variant="box"
				value={amount}
				onChangeText={(value) => {
					setPieces({});
					setCash(value);
				}}
			/>
			{!blind && valid && (
				<View className="min-h-row flex-row items-center justify-between">
					<Text className="text-muted-foreground">
						{t('register.expected_line', { amount: format(Number(expected.cash ?? '0')) })}
					</Text>
					<View className="flex-row items-center gap-2">
						<Text
							testID="count-variance"
							className={`font-semibold tabular-nums ${variance < 0 ? 'text-bad' : variance === 0 ? 'text-ok' : 'text-foreground'}`}
						>
							{varianceText(variance, format, t)}
						</Text>
						{variance === 0 && (
							<View testID="count-exact">
								<Icon name="check" className="text-success" />
							</View>
						)}
					</View>
				</View>
			)}
			<FormProvider {...noteForm}>
				<FormFieldContext.Provider value={{ name: 'note' }}>
					<FormItem className="gap-2" nativeID={noteId}>
						<FormLabel onPress={() => noteRef.current?.focus()}>
							{t('register.count_note')}
						</FormLabel>
						<Input.Root className="h-tile">
							<Input.InputField
								ref={noteRef}
								aria-labelledby={`${noteId}-form-item`}
								testID="count-note"
								value={note}
								onChangeText={(value) => noteForm.setValue('note', value)}
								placeholder={t('register.count_note_placeholder')}
							/>
						</Input.Root>
					</FormItem>
				</FormFieldContext.Provider>
			</FormProvider>
			{figuresPending && (
				<Notice
					tone="info"
					title={t('register.figures_after_sync')}
					testID="count-figures-pending"
				/>
			)}
			{needsManager && (
				<Notice
					tone="warning"
					icon="lock"
					title={
						session?.approval_required
							? t('register.approval_needed')
							: t('register.over_limit_manager', { amount: format(Number(varianceThreshold)) })
					}
					testID="count-manager-line"
				/>
			)}
			<View className="border-border border-t">
				<Button
					testID="count-denominations"
					variant="ghost"
					className="flex-row justify-start gap-2 px-0"
					onPress={() => setNotesOpen(!notesOpen)}
				>
					<Icon
						name={notesOpen ? 'chevronDown' : 'chevronRight'}
						className="text-muted-foreground"
					/>
					<ButtonText>{t('register.count_by_denominations')}</ButtonText>
				</Button>
			</View>
			{notesOpen && (
				<View className="gap-2">
					<TileGrid columns={4}>
						{faces.map((value) => (
							<DenominationTile
								key={value}
								value={value}
								pieces={pieces[value] ?? 0}
								add={(n) =>
									setPieces((previous) => ({ ...previous, [value]: (previous[value] ?? 0) + n }))
								}
							/>
						))}
					</TileGrid>
					<Button
						testID="count-clear"
						variant="ghost"
						className="self-end"
						onPress={() => {
							setPieces({});
							setCash('0.00');
						}}
					>
						{t('register.clear')}
					</Button>
				</View>
			)}
			<View className="border-border border-t">
				<Button
					testID="count-other-tenders"
					variant="ghost"
					className="flex-row justify-start gap-2 px-0"
					onPress={() => setTendersOpen(!tendersOpen)}
				>
					<Icon
						name={tendersOpen ? 'chevronDown' : 'chevronRight'}
						className="text-muted-foreground"
					/>
					<ButtonText>{t('register.other_tenders')}</ButtonText>
				</Button>
			</View>
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
				<Notice
					tone="info"
					testID="count-unsynced"
					title={t('register.unsynced_sales_closure_records', { count: unsyncedCount })}
				/>
			)}
			{carts > 0 && (
				<Notice
					tone="warning"
					testID="count-open-carts"
					title={t('register.open_carts_wait', { count: carts })}
				/>
			)}
			{!!error && (
				<Text testID="count-error" className="text-bad">
					{error}
				</Text>
			)}
			{approving && (
				<ApproveSheet
					side={side}
					portalHost={portalHost}
					counted={counted}
					note={note}
					denominations={countedDenominations}
					onClosed={completed}
					onOpenChange={setApproving}
				/>
			)}
		</ScrollView>
	);
	return (
		<>
			<DialogHeader className="flex-row items-center gap-3">
				<IconButton
					name="chevronLeft"
					testID="count-back"
					disabled={busy}
					accessibilityLabel={t('register.back_to_selling')}
					onPress={() =>
						attempt(async () => {
							// A closed session awaiting its closure write is not one to reopen.
							if (session?.status === 'counting') await actions.backToSelling();
							onBack();
						})
					}
				/>
				<ToneDisc tone="muted" icon="register" size="sm" />
				<View className="min-w-0 flex-1">
					<DialogTitle>
						{t('register.close_register_title', { name: binding.registerName })}
					</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</View>
			</DialogHeader>
			{body}
			<DialogFooter
				size="lg"
				intent={{
					label: needsManager ? t('register.approve_and_close') : t('register.close_and_print'),
					testID: 'count-close',
					loading: busy,
					disabled:
						!valid ||
						figuresPending ||
						Object.values(others).some((value) => value !== '' && !validAmount(value)),
					onPress: () => {
						if (!blind && valid && overThreshold(variance, varianceThreshold))
							recordRegisterFact({
								kind: 'variance-over-threshold',
								actor,
								sessionId: session?.id,
								registerId: session?.register_id,
								variance: fromMinor(variance, 2),
								threshold: varianceThreshold,
							});
						if (needsManager) setApproving(true);
						else
							void attempt(async () => {
								completed(
									await actions.closeSession({ counted, note, denominations: countedDenominations })
								);
							});
					},
				}}
			/>
		</>
	);
}
