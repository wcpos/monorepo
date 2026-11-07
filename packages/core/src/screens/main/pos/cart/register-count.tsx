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
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { decimalRow, DIGIT_ROWS, Keypad } from '@wcpos/components/keypad';
import { typeDecimal } from '@wcpos/components/lib/decimal-entry';
import { useIsPhone } from '@wcpos/components/lib/device';
import { TONE } from '@wcpos/components/lib/tone';
import { cn } from '@wcpos/components/lib/utils';
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
	countDecimals,
	countVariance,
	denominationTotal,
	overThreshold,
	validAmount,
	varianceAmount,
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
	description: React.ReactNode;
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
	const phone = useIsPhone();
	const currency = useDocField(store, (value) => value.currency);
	const separator = useDocField(store, (value) => value.price_decimal_sep) || '.';
	const decimals = countDecimals(useDocField(store, (value) => value.price_num_decimals));
	const noteForm = useForm({ defaultValues: { note: session?.count_note ?? '' } });
	const note = useWatch({ control: noteForm.control, name: 'note' });
	const noteId = React.useId();
	const noteRef = React.useRef<React.ComponentRef<typeof Input.InputField>>(null);
	const [cash, setCash] = React.useState(session?.counted?.cash ?? '');
	const [keypadOpen, setKeypadOpen] = React.useState(true);
	// The amount and its keypad are one focus region: on the web a key takes focus before its press
	// lands, and a cashier may enter the count by keys alone, so the keypad collapses when focus
	// LEAVES the region (to the note, a tile, the footer), never on a move within it (Codex, #3356).
	const regionRef = React.useRef<React.ComponentRef<typeof View>>(null);
	const leaveRegion = (event?: { nativeEvent?: unknown }) => {
		const next = (event?.nativeEvent as { relatedTarget?: unknown } | undefined)?.relatedTarget;
		const region = regionRef.current as unknown as { contains?: (node: unknown) => boolean } | null;
		if (next && region?.contains?.(next)) return;
		if (valid) setKeypadOpen(false);
	};
	const [pieces, setPieces] = React.useState<Record<string, number>>(() =>
		Object.fromEntries(
			(session?.count_denominations ?? []).map(({ value, pieces }) => [value, pieces])
		)
	);
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
	const amount = Object.keys(pieces).length
		? fromMinor(denominationTotal(pieces, decimals), decimals)
		: cash;
	const valid = validAmount(amount, decimals);
	const variance = countVariance(amount, expected.cash ?? '0', decimals);
	const tone = variance < 0 ? TONE.bad : variance > 0 ? TONE.ok : TONE.muted;
	const bandClass = tone.band;
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
			(!blind && valid && overThreshold(variance, decimals, varianceThreshold)));
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
			{/* The region: a blur leaving the field or a key for a target outside it collapses the keypad. */}
			<View ref={regionRef} testID="count-entry" className="gap-4" onBlur={leaveRegion}>
				<RegisterAmount
					testID="count-amount"
					value={amount.replace('.', separator)}
					onChangeText={(value) => {
						setPieces({});
						setCash(value.replace(separator, '.'));
					}}
					onBlur={leaveRegion}
					onFocus={() => setKeypadOpen(true)}
					onPressIn={() => setKeypadOpen(true)}
				/>
				{keypadOpen ? (
					<View testID="count-keypad">
						<Keypad
							rows={[
								...DIGIT_ROWS,
								decimalRow(decimals > 0 ? separator : undefined, t('common.backspace')),
							]}
							fit={phone ? 'shrink' : 'tile'}
							testID="count"
							onPress={(key) => {
								// Leaving denomination entry starts a fresh count: the typed buffer behind the
								// tiles is stale and must not come back (Codex, #3356; ledger line 65).
								const fresh = Object.keys(pieces).length > 0;
								setPieces({});
								setCash((prev) => typeDecimal(fresh ? '' : prev, key, decimals));
							}}
						/>
					</View>
				) : (
					<Text testID="count-tap-to-change" className="text-muted-foreground">
						{t('register.tap_amount_to_change')}
					</Text>
				)}
			</View>
			{!blind && valid && (
				<View testID="count-result" className="border-border rounded-tile border">
					<View className="min-h-row flex-row items-center justify-between px-3">
						<Text className="text-muted-foreground">{t('register.expected_label')}</Text>
						<Text className="tabular-nums">{format(Number(expected.cash ?? '0'))}</Text>
					</View>
					<View
						testID="count-band"
						className={cn('min-h-row flex-row items-center justify-between px-3', bandClass)}
					>
						<HStack className="items-center gap-2">
							<View testID={variance === 0 ? 'count-exact' : undefined}>
								<Icon
									name={variance < 0 ? 'arrowDown' : variance > 0 ? 'arrowUp' : 'check'}
									className={tone.text}
								/>
							</View>
							<Text className="font-semibold">
								<Text className="capitalize">
									{variance < 0
										? t('register.short')
										: variance > 0
											? t('register.over')
											: t('register.exact')}
								</Text>
							</Text>
						</HStack>
						<Text testID="count-variance" className="font-semibold tabular-nums">
							{varianceAmount(variance, decimals, format)}
						</Text>
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
								add={(n) => {
									setPieces((previous) => ({ ...previous, [value]: (previous[value] ?? 0) + n }));
									setKeypadOpen(false);
								}}
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
						Object.values(others).some((value) => value !== '' && !validAmount(value, decimals)),
					onPress: () => {
						if (!blind && valid && overThreshold(variance, decimals, varianceThreshold))
							recordRegisterFact({
								kind: 'variance-over-threshold',
								actor,
								sessionId: session?.id,
								registerId: session?.register_id,
								variance: fromMinor(variance, decimals),
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
