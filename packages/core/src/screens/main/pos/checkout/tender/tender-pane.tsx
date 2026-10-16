import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';
import { useCSSVariable } from 'uniwind';

import { Chip } from '@wcpos/components/chip';
import { Keypad, type KeypadKeyDescriptor } from '@wcpos/components/keypad';
import { useIsPhone } from '@wcpos/components/lib/device';
import { SCALE_STEPS } from '@wcpos/components/lib/scale';
import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';

import { firstMissingRequired } from './declared-fields';
import { DeclaredFieldsView } from './declared-fields-view';
import { ReaderConnection } from './reader-connection';
import { TerminalLegView } from './terminal-leg-view';
import { deviceTransports, queuesOffline, selectableReaders } from './tiles';
import { disabledReasonKey } from './labels';
import { SplitView } from './split-view';
import { useDriverStatus } from './use-driver-status';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { useT } from '../../../../../contexts/translations';
import { useDateFormat } from '../../../hooks/use-date-format';

import type { OrderSaveState } from '../checkout-mode';
import type { TenderKey } from './tender-state';
import type { TenderTile } from './tiles';
import type { TenderFlow } from './use-tender-flow';

// Long enough that a normal save never shows it, short enough that a cashier is not left guessing.
const SLOW_SAVE_NOTICE_MS = 4_000;
function useElapsed(active: boolean, ms: number): boolean {
	const [elapsed, setElapsed] = React.useState(false);
	// A timer is an external system; this effect only arms and releases that timer.
	React.useEffect(() => {
		if (!active) return;
		const timer = setTimeout(() => setElapsed(true), ms);
		return () => clearTimeout(timer);
	}, [active, ms]);
	const [wasActive, setWasActive] = React.useState(active);
	if (wasActive !== active) {
		setWasActive(active);
		setElapsed(false);
	}
	return active && elapsed;
}

interface Props {
	flow: TenderFlow;
	format: (minor: number) => string;
	/** Compact host layout. */
	compact?: boolean;
	/** The order is still saving: everything is drawn, nothing can be pressed. */
	saving?: boolean;
	/** The save has taken long enough to say so. */
	slow?: boolean;
}

export function TenderPane({ flow, format, compact }: Props) {
	const t = useT();

	const slow = useElapsed(flow.saveState?.kind === 'saving', SLOW_SAVE_NOTICE_MS);

	if (flow.terminalLeg) return <TerminalLegView flow={flow} format={format} />;

	// A refused save offers no tiles; a queued offline save uses each tile’s capability rule.
	if (flow.saveState?.kind === 'rejected') {
		return <RefusedPane rejection={flow.saveState} />;
	}
	// While the order saves, the pane is the keypad it is about to be — amount, methods and keys
	// in place, inert — so the save settling changes nothing the cashier is looking at. A till
	// that has never fetched its methods gets tile-shaped slots in the method row, nothing else.
	if (flow.saveState?.kind === 'saving') {
		return <TenderKeypad flow={flow} format={format} compact={compact} saving slow={slow} />;
	}

	if (flow.tiles.length === 0) {
		return (
			<Text className="text-muted-foreground text-sm">{t('pos_checkout.no_payment_methods')}</Text>
		);
	}

	return flow.state.splitView ? (
		<SplitView flow={flow} format={format} compact={compact} />
	) : (
		<TenderKeypad flow={flow} format={format} compact={compact} />
	);
}

// Keep each row at the same column count: percentage bases plus gaps wrap too early. Two on a
// phone so six gateways' names fit (three rows), never an ellipsis.
function MethodRows({ children }: React.PropsWithChildren) {
	const columns = useIsPhone() ? 2 : 5;
	const tiles = React.Children.toArray(children);
	const rows: React.ReactNode[][] = [];
	for (let index = 0; index < tiles.length; index += columns) {
		rows.push(tiles.slice(index, index + columns));
	}
	return (
		<View className="w-full gap-2">
			{rows.map((row, index) => (
				<View key={index} className="flex-row gap-2">
					{row}
					{Array.from({ length: columns - row.length }, (_, spacer) => (
						<View key={`spacer-${spacer}`} className="min-w-0 flex-1" />
					))}
				</View>
			))}
		</View>
	);
}

/**
 * A refused save that is still on screen: the durable dead letter hydrated after a cold
 * restore, or a late rejection on a phone whose modal is still open. Pay's own path leaves
 * checkout before this can render; here the pane says so itself and points at Store health.
 */
function RefusedPane({ rejection }: { rejection: Extract<OrderSaveState, { kind: 'rejected' }> }) {
	const t = useT();
	const router = useRouter();
	return (
		<VStack space="sm" className="flex-1" testID="checkout-refused">
			<Text className="text-destructive font-semibold">{t('pos_checkout.order_refused')}</Text>
			<Text className="text-muted-foreground text-sm">
				{rejection.message ?? rejection.reason ?? t('pos_checkout.order_refused_no_reason')}
			</Text>
			<Button
				variant="outline"
				size="sm"
				className="self-start"
				testID="checkout-refused-store-health"
				onPress={() => router.push('/health/database')}
			>
				<ButtonText>{t('pos_checkout.open_store_health')}</ButtonText>
			</Button>
		</VStack>
	);
}

const KEYPAD_ROWS: readonly (readonly KeypadKeyDescriptor[])[] = [
	...['123', '456', '789'].map((row) =>
		[...row].map((value) => ({ value, label: value, testID: `checkout-key-${value}` }))
	),
	[
		{ value: 'clear', label: 'C', testID: 'checkout-key-clear' },
		{ value: '0', label: '0', testID: 'checkout-key-0' },
		{ value: 'backspace', icon: 'deleteLeft', testID: 'checkout-key-backspace' },
	],
];

/**
 * Digits shift in from the right, till-style: the entry is pre-filled with the
 * balance and the first keypress starts a fresh number. There is no decimal key
 * because there is no decimal to get wrong.
 */
function TenderKeypad({ flow, format, saving = false, slow = false }: Props) {
	const t = useT();
	const busy = flow.busy || saving;
	const tile = useCSSVariable('--spacing-tile');
	const ctl = useCSSVariable('--spacing-ctl');
	const scale = Object.values(SCALE_STEPS).find((step) => step[4] === parseFloat(String(tile)));
	const [paneHeight, setPaneHeight] = React.useState(0);
	const [headHeight, setHeadHeight] = React.useState(0);
	const [footHeight, setFootHeight] = React.useState(0);
	const gap = scale ? scale[0] * 2 : 0;
	const fixedHeight = headHeight + footHeight + gap * KEYPAD_ROWS.length;
	const shrink =
		!!scale && paneHeight > 0 && paneHeight < fixedHeight + KEYPAD_ROWS.length * scale[4];
	const contentHeight = shrink
		? Math.max(paneHeight, fixedHeight + KEYPAD_ROWS.length * parseFloat(String(ctl)))
		: undefined;
	const [choosingReader, setChoosingReader] = React.useState<string | null>(null);
	const [unavailableOpen, setUnavailableOpen] = React.useState(false);
	const method = flow.method;
	if (!method && choosingReader !== null) setChoosingReader(null);
	const givesChange = method?.capabilities.change === true;
	const server = method?.capture.mode === 'server';
	const remote = server || method?.capture.mode === 'device';
	// Contract 1.2: the gateway's declared components are the helpers; its verb is the commit.
	// The entry is pre-typed to the balance and read-only for a method that takes no part payment.
	const fields = method?.capture.mode === 'gateway' ? (method.fields ?? null) : null;
	const missing = fields ? firstMissingRequired(fields, flow.fieldValues) : null;
	const fixedAmount = method?.capture.mode === 'gateway' && !method.capabilities.amount.partial;
	const locked = flow.lockToDefault || (flow.readers.length === 1 && flow.readers[0].isDefault);
	const selectedReader = flow.readers.find(({ id }) => id === flow.state.readerId);
	const needsReader =
		(server && (!selectedReader || selectedReader.inUseBy !== null)) ||
		(method?.capture.mode === 'device' && !flow.deviceReady);
	const reason = flow.tiles.find((tile) => tile.method.id === method?.id)?.reason;

	const plan = flow.plan;
	const done = flow.planLegs.filter((leg) => leg.state === 'done');
	const n = done.length + 1;
	const ways = plan?.kind === 'fixed' ? 2 : Math.max(plan?.ways ?? 1, n);
	const groupDone =
		plan?.kind === 'items' && done.reduce((sum, leg) => sum + leg.minor, 0) >= plan.firstMinor;
	// A cash entry the cash.rounding hook will settle is due the rounded amount (#66, #84); the
	// Exact chip offers it whenever this leg is the whole balance, since tapping it settles.
	const due = flow.roundingMinor !== 0 ? flow.roundedDueMinor : flow.thisPaymentMinor;
	const exactMinor = flow.thisPaymentMinor === flow.balanceMinor ? flow.roundedDueMinor : due;
	// A fixed-amount gateway applies the balance whatever is typed, so excess entry is not an overpayment.
	const noChange = Boolean(
		method && !givesChange && !fixedAmount && flow.state.entryMinor > flow.balanceMinor
	);
	const left = flow.balanceMinor + flow.roundingMinor - flow.entryAppliedMinor;
	// The big figure. The eyebrow and the Full balance chip repeat an amount only when it differs.
	const shownMinor =
		flow.state.view === 'select'
			? due
			: fixedAmount
				? flow.entryAppliedMinor
				: flow.state.entryMinor;
	const canChoose = (tile: TenderTile) =>
		!tile.disabled ||
		(tile.reason === 'offline' &&
			tile.method.capture.mode === 'device' &&
			deviceTransports(tile.method).some((transport) => queuesOffline(tile.method, transport)));
	const unavailable = flow.tiles.filter((tile) => !canChoose(tile));
	const pills = flow.tiles.filter(canChoose).map((tile) => {
		const selected = flow.state.methodId === tile.method.id;
		return (
			<Button
				key={tile.method.id}
				variant="outline"
				className={`min-h-tile border-border bg-background h-auto min-w-0 flex-1 flex-col gap-1 rounded-lg px-2 py-2 ${selected ? 'border-primary bg-muted' : ''} ${busy ? 'opacity-45' : ''}`}
				testID={`checkout-method-${tile.method.id}`}
				disabled={busy}
				onPress={() => {
					setChoosingReader(null);
					flow.pickMethod(tile.method.id);
				}}
			>
				<Icon name={methodIcon(tile.method)} />
				<ButtonText decodeHtml numberOfLines={2} className="text-center">
					{tile.method.title}
				</ButtonText>
				<MethodStatus tile={tile} selected={selected} />
			</Button>
		);
	});
	// One rule: the picked card-reader tile settles later (the payment takes the offline path and
	// its driver can queue it). It outranks the change and part-payment lines.
	const settlesLater = flow.tiles.find((tile) => tile.method.id === method?.id)?.settlesLater;
	const hint = missing
		? t('pos_checkout.enter_field', { label: missing.label })
		: noChange
			? t('pos_checkout.no_change_for_method', {
					amount: format(flow.balanceMinor),
					method: method?.title,
				})
			: settlesLater
				? t('pos_checkout.offline_card_may_decline')
				: flow.entryChangeMinor > 0
					? t('pos_checkout.change_due', { amount: format(flow.entryChangeMinor) })
					: flow.entryAppliedMinor < due && flow.state.entryMinor > 0
						? plan
							? t('pos_checkout.less_than_planned', {
									amount: format(due - flow.entryAppliedMinor),
								})
							: t('pos_checkout.part_payment_left', { left: format(left) })
						: '';
	const commit = method
		? (fields
				? t('pos_checkout.send_verb_amount', {
						label: fields.verb.label,
						amount: format(flow.entryAppliedMinor),
					})
				: t(remote ? 'pos_checkout.send_amount_to' : 'pos_checkout.take_amount_in', {
						amount: format(flow.entryAppliedMinor),
						method: method.title,
					})) +
			(plan && !groupDone
				? ` · ${t('pos_checkout.n_of_ways', { n, ways })}`
				: left > 0
					? ` · ${t('pos_checkout.amount_left', { amount: format(left) })}`
					: flow.rows.length > 0 || flow.balanceMinor < flow.totalMinor
						? ` · ${t('pos_checkout.pays_it_off')}`
						: '')
		: t('pos_checkout.choose_how_paying');

	return (
		<ScrollView
			testID="checkout-keypad-pane"
			className="bg-card flex-1"
			// A declared field leaves the keyboard open: the first tap on Send must reach it.
			keyboardShouldPersistTaps="handled"
			onLayout={(event) => setPaneHeight(event.nativeEvent.layout.height)}
			contentContainerClassName="items-center gap-2"
			contentContainerStyle={{ height: contentHeight }}
			showsVerticalScrollIndicator={false}
		>
			<HStack className="flex-wrap items-center justify-center gap-2">
				<Text
					testID="checkout-label"
					decodeHtml
					className="text-muted-foreground text-xs font-semibold tracking-wider uppercase"
				>
					{plan
						? `${flow.planLabel} · ${t('pos_checkout.amount_left', { amount: format(flow.balanceMinor) })}`
						: t(
								flow.balanceMinor < flow.totalMinor
									? 'pos_checkout.remaining'
									: 'pos_checkout.to_pay'
							)}{' '}
					<Text
						testID="checkout-balance"
						className={plan || flow.balanceMinor === shownMinor ? 'hidden' : 'tabular-nums'}
					>
						{format(flow.balanceMinor)}
					</Text>
				</Text>
				{flow.balanceMinor > 0 && !fixedAmount ? (
					<Chip
						on={!!plan}
						label={t('pos_checkout.split')}
						testID="checkout-split-chip"
						disabled={busy}
						onPress={() =>
							flow.dispatch({
								type: 'open-split',
							})
						}
					/>
				) : null}
				{!flow.online ? (
					<Text testID="checkout-offline" className="text-warning text-xs">
						{t('pos_checkout.offline')}
					</Text>
				) : null}
			</HStack>
			<Text
				testID="checkout-entry"
				className={`text-foreground text-amt font-bold tabular-nums ${flow.state.entryDirty ? 'opacity-100' : 'opacity-70'}`}
			>
				{format(shownMinor)}
			</Text>
			<Text
				testID="checkout-entry-hint"
				className={`min-h-6 text-sm ${noChange ? 'text-warning' : flow.entryChangeMinor > 0 ? 'text-success' : 'text-muted-foreground'}`}
				decodeHtml
			>
				{hint}
			</Text>
			{flow.roundingMinor !== 0 ? (
				<Text testID="checkout-rounded-from" className="text-muted-foreground text-sm" decodeHtml>
					{t('pos_checkout.rounded_from', { amount: format(flow.balanceMinor) })}
				</Text>
			) : null}
			{flow.invoiceSent ? <InvoiceSentLine flow={flow} busy={busy} /> : null}
			{plan ? (
				<View
					testID="checkout-plan"
					className="flex-row flex-wrap items-center justify-center gap-2"
				>
					{flow.planLegs.map((leg, index) => (
						<View
							key={index}
							testID={`checkout-plan-leg-${index}`}
							className={`flex-row items-center gap-1 rounded-full border px-3 py-2 ${leg.state === 'done' ? 'bg-success/20 border-success/30' : leg.state === 'now' ? 'border-primary' : 'border-border opacity-60'} ${leg.state === 'rest' ? 'border-dashed' : ''}`}
						>
							{leg.state === 'done' ? (
								<Icon name="check" size="xs" className="text-success" />
							) : null}
							<Text
								className={
									leg.state === 'done' ? 'text-success text-xs' : 'text-foreground text-xs'
								}
								decodeHtml
							>
								{leg.state === 'rest'
									? t('pos_checkout.then_amount', { amount: format(leg.minor) })
									: `${leg.title ? `${leg.title} ` : ''}${format(leg.minor)}`}
							</Text>
						</View>
					))}
					{flow.planMore ? (
						<Button
							variant="ghost"
							size="sm"
							testID="checkout-plan-pick-items"
							disabled={busy}
							onPress={() => {
								flow.dispatch({ type: 'set-split-tab', tab: 'item' });
								flow.dispatch({ type: 'open-split' });
							}}
						>
							<ButtonText className="underline">{t('pos_checkout.pick_next_items')}</ButtonText>
						</Button>
					) : null}
					<Button
						variant="ghost"
						size="sm"
						testID="checkout-plan-change"
						disabled={busy}
						onPress={() => flow.dispatch({ type: 'open-split' })}
					>
						<ButtonText className="underline">{t('pos_checkout.change_split')}</ButtonText>
					</Button>
				</View>
			) : null}

			<MethodRows>
				{pills.length > 0 || !saving
					? pills
					: Array.from({ length: 4 }, (_, index) => (
							<View
								key={index}
								testID="checkout-tile-skeleton"
								className="bg-muted h-tile min-w-0 flex-1 rounded-lg"
							/>
						))}
			</MethodRows>
			{slow ? (
				<Text testID="checkout-save-slow" className="text-warning text-sm">
					{t('pos_checkout.store_not_answering')}
				</Text>
			) : null}
			{unavailable.length > 0 ? (
				<VStack space="xs" className="w-full max-w-md">
					{/* Styled as the quiet folded line it is: centred muted words, a chevron, no chrome. */}
					<Button
						variant="ghost-quiet"
						className="flex-row gap-1 self-center"
						testID="checkout-unavailable-toggle"
						disabled={busy}
						onPress={() => setUnavailableOpen(!unavailableOpen)}
					>
						<ButtonText decodeHtml numberOfLines={2} className="text-center">
							{unavailable.length === 1
								? t('pos_checkout.method_not_available_right_now', {
										method: unavailable[0].method.title,
									})
								: t('pos_checkout.not_available_right_now_n', { n: unavailable.length })}
						</ButtonText>
						<Icon
							name={unavailableOpen ? 'chevronUp' : 'chevronDown'}
							size="xs"
							className="text-muted-foreground"
						/>
					</Button>
					{unavailableOpen
						? unavailable.map((tile) => (
								<View
									key={tile.method.id}
									testID={`checkout-unavailable-${tile.method.id}`}
									className="bg-muted flex-row items-center gap-2 rounded-md p-2"
								>
									<Icon name={methodIcon(tile.method)} className="text-muted-foreground" />
									<Text className="text-foreground text-sm" decodeHtml>
										{tile.method.title}
									</Text>
									<Text className="text-muted-foreground flex-1 text-xs">
										{tile.reason
											? t(disabledReasonKey(tile.reason), {
													title: tile.method.title,
													...(typeof tile.reason === 'object' ? tile.reason : {}),
												})
											: ''}
									</Text>
								</View>
							))
						: null}
				</VStack>
			) : null}

			{/* The terminal choice sits with the amount, above the keypad: for a card
			    leg the amount is already right and WHICH reader is the decision. */}
			{method?.capture.mode === 'device' && flow.pickTransport ? (
				<ReaderConnection
					bootstrap={flow.bootstrapReader}
					remembered={flow.rememberedReaderId}
					remember={flow.rememberReader}
					method={method}
					transport={flow.deviceTransport ?? null}
					pickTransport={flow.pickTransport}
					online={flow.online}
					disabled={busy || (Boolean(reason) && reason !== 'offline')}
				/>
			) : null}
			{server ? (
				<VStack space="xs">
					{locked ||
					(!needsReader && (choosingReader !== method?.id || flow.readers.length === 1)) ? (
						<HStack className="items-center gap-2">
							<Text
								testID={locked ? 'checkout-reader-locked' : 'checkout-reader-selected'}
								className="text-muted-foreground text-sm"
							>
								{t('pos_checkout.reader_line', {
									label: (locked ? flow.readers[0] : selectedReader)?.label ?? '',
								})}
							</Text>
							{!locked && flow.readers.length > 1 ? (
								<Button
									variant="secondary"
									size="sm"
									testID="checkout-reader-change"
									disabled={busy}
									onPress={() => setChoosingReader(method?.id ?? null)}
								>
									<ButtonText>{t('pos_checkout.change_reader')}</ButtonText>
								</Button>
							) : null}
						</HStack>
					) : (
						<View className="flex-row flex-wrap gap-2">
							{flow.readers.map((reader) => (
								<VStack key={reader.id} space="xs">
									<Button
										size="sm"
										variant={flow.state.readerId === reader.id ? 'default' : 'secondary'}
										testID={`checkout-reader-${reader.id}`}
										disabled={busy || reader.inUseBy !== null}
										onPress={() => flow.pickReader(reader.id)}
									>
										<ButtonText>{reader.label}</ButtonText>
									</Button>
									{reader.inUseBy !== null ? (
										<Text
											className="text-muted-foreground text-xs"
											testID={`checkout-reader-${reader.id}-reason`}
										>
											{t('pos_checkout.reader_in_use', { number: reader.inUseBy })}
										</Text>
									) : null}
								</VStack>
							))}
						</View>
					)}
					{needsReader ? (
						<Text className="text-muted-foreground text-sm">
							{t('pos_checkout.choose_a_terminal')}
						</Text>
					) : null}
				</VStack>
			) : null}

			{fields ? (
				<DeclaredFieldsView
					fields={fields}
					values={flow.fieldValues}
					errors={flow.fieldErrors}
					onChange={flow.setFieldValues}
					disabled={busy}
				/>
			) : null}

			{method && !fixedAmount ? (
				<View className="flex-row flex-wrap justify-center gap-2">
					{(givesChange && !remote ? flow.quickAmountsMinor : []).map((minor) => (
						<Chip
							key={minor}
							label={format(minor)}
							testID={`checkout-quick-${fromMinor(minor, flow.dp)}`}
							disabled={busy}
							onPress={() => flow.dispatch({ type: 'set-entry', minor })}
						/>
					))}
					<Chip
						label={t(
							(givesChange && !remote) || plan
								? 'pos_checkout.exact_amount'
								: exactMinor === shownMinor
									? 'pos_checkout.full_balance_label'
									: 'pos_checkout.full_balance',
							{ amount: format(exactMinor) }
						)}
						testID={givesChange && !remote ? 'checkout-quick-exact' : 'checkout-quick-balance'}
						disabled={busy}
						onPress={() => flow.dispatch({ type: 'set-entry', minor: exactMinor })}
					/>
				</View>
			) : null}

			<Keypad
				rows={KEYPAD_ROWS.map((row) =>
					row.map((key) => ({ ...key, disabled: busy || fixedAmount }))
				)}
				onPress={(value) => flow.dispatch({ type: 'key', key: value as TenderKey })}
				fit={shrink ? 'shrink' : 'tile'}
				testID="checkout-keypad"
				onLayout={(event) => setHeadHeight(event.nativeEvent.layout.y)}
				className="w-full"
			/>
			{/* On a phone the full-size dialog keeps this 8 above the bottom inset: the shell's `fill` pads the inset and the panel keeps `py-2` (`lib/overlay.tsx`, `dialog/index.tsx`). */}
			<View className="w-full" onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}>
				<Button
					variant="default"
					size="lg"
					className="w-full"
					testID="checkout-commit"
					loading={busy}
					disabled={
						!method ||
						busy ||
						// A cash due rounded to nothing still settles the sale.
						(flow.entryAppliedMinor <= 0 && flow.roundingMinor === 0) ||
						needsReader ||
						Boolean(reason) ||
						noChange ||
						missing !== null
					}
					onPress={() => void flow.takeTender()}
				>
					<ButtonText decodeHtml>
						{saving ? t('pos_checkout.saving_order_commit') : commit}
					</ButtonText>
				</Button>
			</View>
		</ScrollView>
	);
}

function methodIcon(method: TenderTile['method']) {
	return method.kind === 'cash' ? 'cashRegister' : 'creditCard';
}

/**
 * §4.3: an order sent to the customer and opened again. The keypad above takes money on the
 * full balance (a counting row clears the stamp), the gateway pill sends again under a new
 * attempt, and Cancel invoice names the attempt the store is holding.
 */
function InvoiceSentLine({ flow, busy }: { flow: TenderFlow; busy: boolean }) {
	const t = useT();
	const stamp = flow.invoiceSent!;
	const sentOn = useDateFormat(stamp.sent_at_gmt, 'MMM d, h:mm a', false);
	return (
		<View
			testID="checkout-invoice-sent"
			className="bg-muted w-full max-w-md flex-row flex-wrap items-center gap-2 rounded-md px-3 py-2"
		>
			<Icon name="clock" size="xs" className="text-muted-foreground" />
			<Text className="text-foreground flex-1 text-sm" decodeHtml>
				{stamp.destination
					? t('pos_checkout.invoice_sent_to_on', {
							destination: stamp.destination,
							date: sentOn ?? '',
						})
					: t('pos_checkout.invoice_sent_on', { date: sentOn ?? '' })}
			</Text>
			<Button
				variant="ghost-destructive"
				size="sm"
				testID="checkout-cancel-invoice"
				disabled={busy || !flow.online}
				onPress={() => void flow.cancelInvoice()}
			>
				<ButtonText className="underline">{t('pos_checkout.cancel_invoice')}</ButtonText>
			</Button>
		</View>
	);
}

/**
 * One status language on every tile: a success dot in the corner while the reader or driver is
 * connected (or a cloud reader is online), nothing otherwise; the battery only on the selected tile.
 */
function MethodStatus({ tile, selected }: { tile: TenderTile; selected: boolean }) {
	const { method } = tile;
	const t = useT();
	// A disabled tile never subscribes to its driver.
	const status = useDriverStatus(
		method.capture.mode === 'device' && !tile.disabled
			? getDriver(method.capture.provider)
			: undefined
	);
	if (tile.disabled || (method.capture.mode !== 'server' && method.capture.mode !== 'device'))
		return null;
	const connected =
		method.capture.mode === 'device'
			? status.connection === 'connected'
			: selectableReaders(method).readers.length > 0;
	const battery = selected && connected ? status.reader?.battery : null;
	return (
		<>
			{connected ? (
				<View
					testID={`checkout-method-dot-${method.id}`}
					className="bg-success absolute top-2 right-2 size-2 rounded-full"
				/>
			) : null}
			{battery != null ? (
				<Text
					testID={`checkout-method-status-${method.id}`}
					className="text-muted-foreground text-xs"
				>
					{t('pos_checkout.reader_battery_percent', { battery })}
				</Text>
			) : null}
		</>
	);
}
