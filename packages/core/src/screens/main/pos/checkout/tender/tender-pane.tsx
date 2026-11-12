import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';
import { decode } from 'html-entities';
import { useCSSVariable } from 'uniwind';

import { EmptyState } from '@wcpos/components/empty-state';
import { Chip } from '@wcpos/components/chip';
import { DocsLink } from '@wcpos/components/docs-link';
import { DIGIT_ROWS, Keypad, type KeypadKey } from '@wcpos/components/keypad';
import { useIsPhone } from '@wcpos/components/lib/device';
import { SCALE_STEPS } from '@wcpos/components/lib/scale';
import { Button, ButtonText } from '@wcpos/components/button';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { ListItem } from '@wcpos/components/list-item';
import { Notice } from '@wcpos/components/notice';
import { PressableSurface } from '@wcpos/components/pressable-surface';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { TileGrid } from '@wcpos/components/tile-grid';
import { VStack } from '@wcpos/components/vstack';
import { countsTowardPaid, fromMinor, toMinor } from '@wcpos/order-math';

import { firstMissingRequired } from './declared-fields';
import { DeclaredFieldsView } from './declared-fields-view';
import { ReaderConnection } from './reader-connection';
import { TerminalLegView } from './terminal-leg-view';
import { selectableReaders } from './tiles';
import { disabledReasonText } from './labels';
import { evenSplitShareMinor, type PlanLeg, type TenderKey, unitsMinor } from './tender-state';
import { UnitStepper } from './unit-stepper';
import { useDriverStatus } from './use-driver-status';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { CARD_READER_DOCS_URL } from '../../../settings/card-readers/docs';
import { useT } from '../../../../../contexts/translations';
import { useDateFormat } from '../../../hooks/use-date-format';

import type { OrderSaveState } from '../checkout-mode';
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

export function UnansweredGate({ flow }: { flow: TenderFlow }) {
	const t = useT();
	return (
		<Notice
			tone="warning"
			title={t('pos_checkout.payment_unanswered')}
			testID="checkout-unanswered"
			actions={[
				{
					label: t('pos_checkout.try_again'),
					onPress: () => void flow.commands.retryCommand(),
					loading: flow.running === 'retryCommand',
					testID: 'checkout-unanswered-retry',
				},
			]}
		/>
	);
}

/** Offline with nothing choosable and no money held: no payment can start until the link returns. */
function waitsForConnection(flow: TenderFlow) {
	return (
		!flow.hasLiveLeg &&
		flow.tiles.some((tile) => tile.reason === 'offline') &&
		flow.tiles.every((tile) => tile.disabled)
	);
}

export function TenderPane({ flow, format, compact, onLeave }: Props & { onLeave?: () => void }) {
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
	if (waitsForConnection(flow)) return <OfflinePane onLeave={onLeave} />;

	if (flow.tiles.length === 0) {
		return <EmptyState kind="empty" size="inline" title={t('pos_checkout.no_payment_methods')} />;
	}

	return <TenderKeypad flow={flow} format={format} compact={compact} />;
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
		<Notice
			testID="checkout-refused"
			tone="bad"
			title={t('pos_checkout.order_refused')}
			description={
				rejection.message ?? rejection.reason ?? t('pos_checkout.order_refused_no_reason')
			}
			actions={[
				{
					label: t('pos_checkout.open_store_health'),
					testID: 'checkout-refused-store-health',
					onPress: () => router.push('/health/database'),
				},
			]}
		/>
	);
}

/** Offline with nothing to take the sale: the order is already kept, so the way out is back to the cart. */
function OfflinePane({ onLeave }: { onLeave?: () => void }) {
	const t = useT();
	const leave = { label: t('pos_checkout.offline_leave'), testID: 'checkout-offline-leave' };
	return (
		<Notice
			testID="checkout-offline"
			tone="warning"
			title={t('pos_checkout.offline_title')}
			description={t('pos_checkout.offline_description')}
			actions={onLeave && [{ ...leave, onPress: onLeave }]}
		/>
	);
}

const PERCENTS = [10, 20, 25, 50];

const keypadRows = (backspace: string): KeypadKey[][] => [
	...DIGIT_ROWS,
	[
		{ name: 'clear', label: 'C' },
		{ name: '0', label: '0' },
		{ name: 'backspace', label: backspace, icon: 'backspace' },
	],
];

/**
 * Digits shift in from the right, till-style: the entry is pre-filled with the
 * balance and the first keypress starts a fresh number. There is no decimal key
 * because there is no decimal to get wrong.
 */
function TenderKeypad({ flow, format, saving = false, slow = false }: Props) {
	const t = useT();
	const KEYPAD_ROWS = keypadRows(t('common.backspace'));
	const phone = useIsPhone();
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
	// The hook computed every number (`tenderFigures`); this view only formats them. The eyebrow and
	// the Full balance chip repeat an amount only when it differs from the big figure (`shownMinor`).
	const { figures } = flow;
	const {
		fixedAmount,
		plan,
		n,
		ways,
		toCome,
		groupDone,
		shared,
		dueMinor: due,
		exactMinor,
	} = figures;
	const { shownMinor, noChange, typed, restMinor, shareMinor } = figures;
	const left = figures.afterThisPaymentMinor;
	const locked =
		flow.terminal.lockToDefault ||
		(flow.terminal.readers.length === 1 && flow.terminal.readers[0].isDefault);
	const selectedReader = flow.terminal.readers.find(({ id }) => id === flow.state.readerId);
	const needsReader =
		(server && (!selectedReader || selectedReader.inUseBy !== null)) ||
		(method?.capture.mode === 'device' && !flow.terminal.deviceReady);
	const reason = flow.tiles.find((tile) => tile.method.id === method?.id)?.reason;

	const { extraMinor, shareOpen, doneOpen, pickerOpen } = flow.state;
	const { splitOn, picked } = flow.split;
	const picking = Object.keys(picked).length > 0;
	const pickedCount = Object.values(picked).reduce((sum, units) => sum + units, 0);
	// On a phone there is no bill on screen: its picks are a list in the keypad's place.
	const pickList = splitOn && phone && pickerOpen && !doneOpen;
	const percent = flow.state.entryMode === 'percent';
	const done = figures.legs.filter((leg) => leg.state === 'done');
	const counted = flow.rows.filter(countsTowardPaid);
	const name = (id: string | number) =>
		decode(flow.split.lines.find((line) => String(line.id) === String(id))?.name ?? '');
	const doneLeg = (row: TenderFlow['rows'][number]): PlanLeg => ({
		minor: toMinor(row.amount, flow.dp),
		state: 'done',
		title:
			flow.tiles.find((item) => item.method.id === row.method_id)?.method.title ?? row.method_id,
	});
	const setPlan = (next: NonNullable<typeof plan>) =>
		flow.commands.dispatch({ type: 'set-plan', plan: next, balanceMinor: flow.balanceMinor });
	const exact = { amount: format(exactMinor) };
	// A disabled tile, an offline reader included (only manual records journal offline), is listed as
	// unavailable, never a pill whose commit button stays dead (CodeRabbit 4328362658).
	const unavailable = flow.tiles.filter((tile) => tile.disabled);
	const choosable = flow.tiles.filter((tile) => !tile.disabled);
	const pills = choosable.map((tile) => {
		const selected = flow.state.methodId === tile.method.id;
		return (
			<Tile
				key={tile.method.id}
				selected={selected}
				testID={`checkout-method-${tile.method.id}`}
				disabled={busy}
				onPress={() => {
					setChoosingReader(null);
					flow.commands.pickMethod(tile.method.id);
				}}
				title={tile.method.title}
				sub={<MethodStatus tile={tile} selected={selected} />}
			>
				<Icon name={methodIcon(tile.method)} />
			</Tile>
		);
	});
	const hint = missing
		? t('pos_checkout.enter_field', { label: missing.label })
		: noChange
			? t('pos_checkout.no_change_for_method', {
					amount: format(flow.balanceMinor),
					method: method?.title,
				})
			: figures.entryChangeMinor > 0
				? t('pos_checkout.change_due', { amount: format(figures.entryChangeMinor) })
				: figures.entryAppliedMinor < due && flow.state.entryMinor > 0
					? plan
						? t('pos_checkout.less_than_planned', {
								amount: format(due - figures.entryAppliedMinor),
							})
						: t('pos_checkout.part_payment_left', { left: format(left) })
					: '';
	// The split's one fact, after the field, no-change and change lines; the less-than and
	// part-payment lines follow it.
	const splitHint = percent
		? t('pos_checkout.percent_of_amount_type', {
				percent: flow.state.entryMinor,
				amount: format(flow.balanceMinor),
			})
		: shared && plan?.kind === 'items' && done.length === 0
			? t('pos_checkout.share_hint', {
					ways: plan.ways,
					amount: format(plan.firstMinor),
					last: format(
						plan.firstMinor - evenSplitShareMinor(plan.firstMinor, plan.ways) * (plan.ways - 1)
					),
				})
			: plan && toCome > 1 && figures.entryAppliedMinor < due && flow.state.entryMinor > 0
				? toCome === 2
					? t('pos_checkout.less_than_planned_n', {
							amount: format(due - figures.entryAppliedMinor),
							from: n + 1,
							to: n + 2,
						})
					: t('pos_checkout.less_than_planned_next_n', {
							amount: format(due - figures.entryAppliedMinor),
							n: toCome,
						})
				: '';
	const rounding =
		figures.allUnpaidPicked && flow.balanceMinor > figures.pickedMinor
			? t('pos_checkout.includes_rounding_left', {
					amount: format(flow.balanceMinor - figures.pickedMinor),
				})
			: '';
	const fact =
		missing || noChange || figures.entryChangeMinor > 0 ? hint : splitHint || hint || rounding;
	// While the taken payments are unfolded, their list has the keypad's place and no helpers.
	const showDone = doneOpen && counted.length >= 1;
	const legs: (PlanLeg & { index: number; run: number })[] = [];
	(plan
		? [...flow.rows.slice(0, plan.from).filter(countsTowardPaid).map(doneLeg), ...figures.legs]
		: [
				...counted.map(doneLeg),
				{ minor: figures.nowMinor, state: 'now' as const },
				...(left > 0 ? [{ minor: left, state: 'rest' as const }] : []),
			]
	).forEach((leg, index) => {
		const last = legs.at(-1);
		// The taken payments are one disclosure pill (two or more fold into a count); a run of
		// equal payments to come is one pill.
		if (leg.state === 'done' && counted.length >= 1) return;
		if (leg.state === 'todo' && last?.state === 'todo' && last.minor === leg.minor) last.run += 1;
		else legs.push({ ...leg, index, run: 1 });
	});
	const choice = (testID: string, title: string, sub: string | undefined, onPress: () => void) => (
		<Tile key={testID} testID={testID} disabled={busy} onPress={onPress} title={title} sub={sub} />
	);
	const changeLeads = !missing && !noChange && figures.entryChangeMinor > 0;
	const entry = { amount: format(figures.entryAppliedMinor), method: method?.title };
	const commit = method
		? (fields
				? t('pos_checkout.send_verb_amount', {
						label: fields.verb.label,
						amount: format(figures.entryAppliedMinor),
					})
				: remote
					? t('pos_checkout.send_amount_to', entry)
					: t('pos_checkout.take_amount_in', entry)) +
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
			// `minHeight`, never `height`: a native ScrollView scrolls only to its content container's
			// own height, not to children overflowing it (a browser counts overflow, Yoga does not), so
			// content taller than the fit (Split's tiles wrapping) must grow the container.
			contentContainerStyle={{ minHeight: contentHeight }}
			showsVerticalScrollIndicator={false}
		>
			<HStack className="flex-wrap items-center justify-center gap-2">
				<Text testID="checkout-label" decodeHtml variant="caption">
					{shared
						? t('pos_checkout.shared_payment_n_of', { n, ways })
						: plan
							? `${flow.planLabel} · ${t('pos_checkout.amount_left', { amount: format(flow.balanceMinor) })}`
							: counted.length > 0
								? t('pos_checkout.payment_n_left', {
										n: counted.length + 1,
										amount: format(flow.balanceMinor),
									})
								: flow.balanceMinor < flow.totalMinor
									? t('pos_checkout.remaining')
									: t('pos_checkout.to_pay')}{' '}
					<Text
						testID="checkout-balance"
						className={
							plan || counted.length > 0 || flow.balanceMinor === shownMinor
								? 'hidden'
								: 'tabular-nums'
						}
					>
						{format(flow.balanceMinor)}
					</Text>
				</Text>
				{flow.balanceMinor > 0 && !fixedAmount ? (
					<Chip
						on={splitOn}
						label={t('pos_checkout.split')}
						testID="checkout-split-chip"
						disabled={busy}
						// Off clears the plan and the picks; nothing taken is touched.
						onPress={() =>
							flow.commands.dispatch(
								splitOn
									? { type: 'clear-plan', balanceMinor: flow.balanceMinor }
									: { type: 'split-on' }
							)
						}
					/>
				) : null}
				{!flow.online ? (
					<Text testID="checkout-offline" className="text-warning-text text-xs">
						{t('pos_checkout.offline')}
					</Text>
				) : null}
			</HStack>
			{changeLeads ? (
				<>
					<AmountFigure testID="checkout-entry-hint" tone="ok" decodeHtml>
						{hint}
					</AmountFigure>
					<Text testID="checkout-tendered-line" variant="key" className="min-h-6">
						{t('pos_checkout.tendered')}{' '}
						<Text testID="checkout-entry" className="tabular-nums">
							{format(shownMinor)}
						</Text>
						{flow.totalMinor !== flow.balanceMinor
							? ` · ${t('common.total')} ${format(flow.totalMinor)}`
							: ''}
					</Text>
				</>
			) : (
				<>
					<AmountFigure
						testID="checkout-entry"
						className={flow.state.entryDirty ? '' : 'opacity-70'}
					>
						{format(shownMinor)}
					</AmountFigure>
					<Text
						testID="checkout-entry-hint"
						variant="key"
						className={`min-h-6 ${noChange ? 'text-warning-text' : ''}`}
						decodeHtml
					>
						{fact}
					</Text>
				</>
			)}
			{figures.roundingMinor !== 0 ? (
				<Text testID="checkout-rounded-from" variant="key" decodeHtml>
					{t('pos_checkout.rounded_from', { amount: format(flow.balanceMinor) })}
				</Text>
			) : null}
			{flow.invoiceSent ? <InvoiceSentLine flow={flow} busy={busy} /> : null}
			{flow.unansweredAttempt ? <AttemptUnansweredLine flow={flow} busy={busy} /> : null}
			{/* Two columns on a phone so six gateways' names fit (three rows), never an ellipsis. */}
			<TileGrid columns={phone ? 2 : 5}>
				{pills.length > 0 || !saving
					? pills
					: Array.from({ length: 4 }, (_, index) => (
							<Skeleton key={index} shape="tile" testID="checkout-tile-skeleton" />
						))}
			</TileGrid>
			{plan || counted.length > 0 ? (
				<View
					testID="checkout-plan"
					className="w-full flex-row flex-wrap items-center justify-center gap-2"
				>
					{showDone ? (
						<View testID="checkout-plan-done-open" className="w-full gap-2">
							{counted.map((row, index) => (
								<ListItem
									key={row.id}
									testID={`checkout-plan-payment-${index}`}
									leading={<Icon name="check" className="text-success" />}
									title={decode(`${doneLeg(row).title} · ${format(toMinor(row.amount, flow.dp))}`)}
									subtitle={Object.entries(flow.split.allocations[row.id] ?? {})
										.map(([id, units]) =>
											t('pos_checkout.units_of_name', { units, name: name(id) })
										)
										.join(', ')}
									trailing={
										<Button
											variant="ghost-destructive"
											size="sm"
											testID={`checkout-plan-payment-${index}-cancel`}
											disabled={busy}
											onPress={() => void flow.commands.cancelOnePayment(row.id)}
										>
											<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
										</Button>
									}
								/>
							))}
							<Button
								variant="ghost"
								className="self-center"
								testID="checkout-plan-hide"
								disabled={busy}
								onPress={() => flow.commands.dispatch({ type: 'toggle-done' })}
							>
								<ButtonText>{t('pos_checkout.hide')}</ButtonText>
							</Button>
						</View>
					) : counted.length >= 1 ? (
						<PressableSurface
							testID="checkout-plan-done"
							role="button"
							disabled={busy}
							onPress={() => flow.commands.dispatch({ type: 'toggle-done' })}
							className="bg-success/20 border-success/30 min-h-ctl flex-row items-center gap-1 rounded-full border px-3"
						>
							<Icon name="check" size="xs" className="text-success" />
							<Text className="text-foreground text-xs" decodeHtml>
								{counted.length === 1
									? `${(done[0] ?? doneLeg(counted[0])).title} ${format(toMinor(counted[0].amount, flow.dp))}`
									: t('pos_checkout.n_paid_amount', {
											n: counted.length,
											amount: format(flow.paidMinor),
										})}
							</Text>
							<Icon name="chevronDown" size="xs" className="text-muted-foreground" />
						</PressableSurface>
					) : null}
					{legs.map((leg) => (
						<View
							key={leg.index}
							testID={`checkout-plan-leg-${leg.index}`}
							className={`min-h-ctl flex-row items-center gap-1 rounded-full border px-3 ${leg.state === 'done' ? 'bg-success/20 border-success/30' : leg.state === 'now' ? 'border-primary' : 'border-border opacity-60'} ${leg.state === 'rest' ? 'border-dashed' : ''}`}
						>
							{leg.state === 'done' ? (
								<Icon name="check" size="xs" className="text-success" />
							) : null}
							{/* Words stay in the foreground on every leg: green text on the done leg's
							    green wash reads under 4.5:1; the wash and the check carry the state. */}
							<Text className="text-foreground text-xs" decodeHtml>
								{leg.state === 'rest'
									? t('pos_checkout.then_amount', { amount: format(leg.minor) })
									: leg.run > 1
										? t('pos_checkout.then_n_times', { n: leg.run, amount: format(leg.minor) })
										: `${leg.title ? `${leg.title} ` : ''}${format(leg.minor)}`}
							</Text>
						</View>
					))}
					{plan ? (
						<Button
							variant="ghost"
							size="sm"
							testID="checkout-plan-change"
							disabled={busy}
							// The even row comes back over what is left; payments taken never move.
							onPress={() =>
								flow.commands.dispatch({
									type: 'clear-plan',
									balanceMinor: flow.balanceMinor,
									keepSplit: true,
								})
							}
						>
							<ButtonText className="underline">{t('pos_checkout.change_split')}</ButtonText>
						</Button>
					) : null}
				</View>
			) : null}

			{slow ? (
				<Text testID="checkout-save-slow" className="text-warning-text text-sm">
					{t('pos_checkout.store_not_answering')}
				</Text>
			) : null}
			{unavailable.length > 0 ? (
				<VStack space="xs" className="w-full max-w-md">
					{/* Styled as the quiet folded line it is: centred muted words, a chevron, no chrome. */}
					<Button
						variant="ghost"
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
									<VStack space="xs" className="flex-1">
										<Text variant="help">
											{tile.reason ? disabledReasonText(tile.reason, tile.method.title, t) : ''}
										</Text>
										{tile.reason === 'driver_web' ? (
											<DocsLink
												testID={`checkout-unavailable-${tile.method.id}-docs`}
												href={CARD_READER_DOCS_URL}
											>
												{t('settings.having_trouble')}
											</DocsLink>
										) : null}
									</VStack>
								</View>
							))
						: null}
				</VStack>
			) : null}

			{/* The terminal choice sits with the amount, above the keypad: for a card
			    leg the amount is already right and WHICH reader is the decision. */}
			{method?.capture.mode === 'device' && flow.terminal.pickTransport ? (
				<ReaderConnection
					bootstrap={flow.terminal.bootstrapReader}
					remembered={flow.terminal.rememberedReaderId}
					remember={flow.terminal.rememberReader}
					method={method}
					transport={flow.terminal.deviceTransport ?? null}
					pickTransport={flow.terminal.pickTransport}
					online={flow.online}
					disabled={busy || (Boolean(reason) && reason !== 'offline')}
				/>
			) : null}
			{server ? (
				<VStack space="xs">
					{locked ||
					(!needsReader &&
						(choosingReader !== method?.id || flow.terminal.readers.length === 1)) ? (
						<HStack className="items-center gap-2">
							<Text
								testID={locked ? 'checkout-reader-locked' : 'checkout-reader-selected'}
								variant="key"
							>
								{t('pos_checkout.reader_line', {
									label: (locked ? flow.terminal.readers[0] : selectedReader)?.label ?? '',
								})}
							</Text>
							{!locked && flow.terminal.readers.length > 1 ? (
								<Button
									variant="outline"
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
							{flow.terminal.readers.map((reader) => (
								<VStack key={reader.id} space="xs">
									{/* A selected choice is a Chip; a Button is never a toggle. */}
									<Chip
										label={reader.label}
										on={flow.state.readerId === reader.id}
										testID={`checkout-reader-${reader.id}`}
										disabled={busy || reader.inUseBy !== null}
										onPress={() => flow.terminal.pickReader(reader.id)}
									/>
									{reader.inUseBy !== null ? (
										<Text variant="help" testID={`checkout-reader-${reader.id}-reason`}>
											{t('pos_checkout.reader_in_use', { number: reader.inUseBy })}
										</Text>
									) : null}
								</VStack>
							))}
						</View>
					)}
					{needsReader ? <Text variant="key">{t('pos_checkout.choose_a_terminal')}</Text> : null}
				</VStack>
			) : null}

			{fields ? (
				<DeclaredFieldsView
					fields={fields}
					values={flow.fieldValues}
					errors={flow.fieldErrors}
					onChange={flow.commands.setFieldValues}
					disabled={busy}
				/>
			) : null}

			{showDone ? null : (
				<View testID="checkout-helpers" className="w-full flex-row flex-wrap justify-center gap-2">
					{splitOn && phone ? (
						<Chip
							label={pickerOpen ? t('pos_checkout.back_to_keypad') : t('pos_checkout.pick_items')}
							count={pickerOpen ? pickedCount : undefined}
							on={pickerOpen}
							testID="checkout-pick-items"
							disabled={busy}
							onPress={() => flow.commands.dispatch({ type: 'toggle-picker' })}
						/>
					) : null}
					{splitOn && !picking && !plan && !percent ? (
						<>
							<Text variant="key" className="w-full text-center">
								{typed
									? t('pos_checkout.after_this_payment', { amount: format(restMinor) })
									: t('pos_checkout.split_the_rest')}
							</Text>
							{/* One row that scrolls sideways when the six do not fit, as the filter strip
							    does, never a second row that pushes the keypad down (Paul, 2026-11-08:
							    "as you recommend (a)"). */}
							{/* The View holds the line in the wrapping row: a horizontal ScrollView grows and
							    shrinks on its own, so beside the quick amounts it gave up most of the line. */}
							<View className="w-full">
								<ScrollView
									horizontal
									showsHorizontalScrollIndicator={false}
									keyboardShouldPersistTaps="handled"
									contentContainerClassName="grow gap-2"
									testID="checkout-split-ways"
								>
									{[
										choice(
											'checkout-percent',
											t('pos_checkout.percent_tile'),
											t('pos_checkout.percent_tile_sub'),
											() => flow.commands.dispatch({ type: 'set-entry-mode', mode: 'percent' })
										),
										...[2, 3, 4, 5, 6].map((count) =>
											choice(
												`checkout-even-${count}`,
												t('pos_checkout.n_ways', { ways: count }),
												t('pos_checkout.amount_each', {
													amount: format(evenSplitShareMinor(restMinor, count)),
												}),
												() =>
													setPlan(
														typed
															? {
																	kind: 'fixed',
																	firstMinor: figures.entryAppliedMinor,
																	title: null,
																	thenWays: count,
																	from: flow.rows.length,
																}
															: { kind: 'even', ways: count, from: flow.rows.length }
													)
											)
										),
									].map((tile) => (
										// Equal shares of the row while 112 each fits; past that the strip scrolls.
										<View key={tile.key} className="min-w-28 flex-1">
											{tile}
										</View>
									))}
								</ScrollView>
							</View>
						</>
					) : null}
					{percent ? (
						<>
							<Text variant="key" className="w-full text-center">
								{t('pos_checkout.percent_of_the_rest')}
							</Text>
							{PERCENTS.map((value) => (
								<Chip
									key={value}
									label={t('pos_checkout.split_percent_value', { percent: value })}
									on={flow.state.entryMinor === value}
									testID={`checkout-percent-${value}`}
									disabled={busy}
									onPress={() => flow.commands.dispatch({ type: 'set-entry', minor: value })}
								/>
							))}
							<Chip
								label={t('pos_checkout.percent_type')}
								on={!PERCENTS.includes(flow.state.entryMinor)}
								testID="checkout-percent-type"
								disabled={busy}
								onPress={() => flow.commands.dispatch({ type: 'set-entry', minor: 0 })}
							/>
						</>
					) : null}
					{Object.entries(picked).map(([lineId, units]) => (
						<Chip
							key={lineId}
							label={t('pos_checkout.units_of_name', { units, name: name(lineId) })}
							testID={`checkout-leg-${lineId}`}
							disabled={busy}
							action={{
								icon: 'close',
								accessibilityLabel: t('common.remove'),
								onPress: () => flow.commands.dispatch({ type: 'pick-units', lineId, units: 0 }),
							}}
						/>
					))}
					{picking && flow.discountMinor > 0 ? (
						<Text testID="checkout-discount-note" variant="help" className="w-full text-center">
							{t('pos_checkout.prices_include_discount')}
						</Text>
					) : null}
					{picking ? (
						<>
							<Chip
								add
								on={extraMinor !== null}
								label={
									extraMinor === null
										? t('pos_checkout.plus_amount')
										: t('pos_checkout.plus_amount_value', { amount: format(extraMinor) })
								}
								testID="checkout-plus-amount"
								disabled={busy}
								onPress={() => flow.commands.dispatch({ type: 'arm-extra' })}
							/>
							<Chip
								add
								on={shareOpen}
								label={t('pos_checkout.share')}
								testID="checkout-share"
								disabled={busy}
								onPress={() => flow.commands.dispatch({ type: 'toggle-share' })}
							/>
						</>
					) : null}
					{picking && shareOpen ? (
						<>
							<Text variant="key" className="w-full text-center">
								{t('pos_checkout.share_this_payment')}
							</Text>
							<TileGrid columns={3}>
								{[2, 3, 4].map((count) =>
									choice(
										`checkout-share-${count}`,
										t('pos_checkout.ways_each', {
											ways: count,
											amount: format(evenSplitShareMinor(shareMinor, count)),
										}),
										undefined,
										() =>
											setPlan({
												kind: 'items',
												units: picked,
												firstMinor: shareMinor,
												ways: count,
												from: flow.rows.length,
											})
									)
								)}
							</TileGrid>
						</>
					) : null}
					{plan && toCome === 0 && shownMinor !== flow.balanceMinor ? (
						<Chip
							label={t('pos_checkout.the_rest_amount', { amount: format(flow.balanceMinor) })}
							testID="checkout-the-rest"
							disabled={busy}
							onPress={() =>
								flow.commands.dispatch({ type: 'set-entry', minor: flow.balanceMinor })
							}
						/>
					) : null}
					{(method && !fixedAmount && !percent && givesChange && !remote
						? figures.quickAmountsMinor
						: []
					).map((minor) => (
						<Chip
							key={minor}
							label={format(minor)}
							testID={`checkout-quick-${fromMinor(minor, flow.dp)}`}
							disabled={busy}
							onPress={() => flow.commands.dispatch({ type: 'set-entry', minor })}
						/>
					))}
					{method && !fixedAmount && !percent ? (
						<Chip
							label={
								(givesChange && !remote) || plan
									? t('pos_checkout.exact_amount', exact)
									: exactMinor === shownMinor
										? t('pos_checkout.full_balance_label', exact)
										: t('pos_checkout.full_balance', exact)
							}
							testID={givesChange && !remote ? 'checkout-quick-exact' : 'checkout-quick-balance'}
							disabled={busy}
							onPress={() =>
								flow.commands.dispatch({ type: 'set-entry', minor: figures.exactEntryMinor })
							}
						/>
					) : null}
				</View>
			)}

			{pickList ? (
				<View testID="checkout-pick-list" className="w-full gap-2">
					{flow.split.lines.map((line) => {
						const key = String(line.id);
						const units = picked[key] ?? 0;
						const unpaid = flow.split.unpaidUnits[key] ?? 0;
						const paid = flow.split.paidUnits[key];
						const paidN = paid?.units ?? 0;
						const { totalMinor: total, quantity } = line;
						return (
							<ListItem
								key={key}
								selected={units > 0}
								trailing={
									unpaid > 0 ? (
										<>
											<UnitStepper
												picked={units}
												unpaid={unpaid}
												testIDBase={`checkout-line-${key}`}
												onChange={(next) =>
													flow.commands.dispatch({ type: 'pick-units', lineId: key, units: next })
												}
											/>
											{units > 0 ? (
												<Text className="font-semibold tabular-nums">
													{format(
														unitsMinor(total, quantity, paidN + units) -
															unitsMinor(total, quantity, paidN)
													)}
												</Text>
											) : null}
										</>
									) : null
								}
							>
								{/* A tap on the name picks every unpaid unit; the stepper beside it is not inside it. */}
								<PressableSurface
									role="button"
									minTarget
									testID={`checkout-line-${key}-pick`}
									disabled={busy || unpaid === 0}
									onPress={() =>
										flow.commands.dispatch({ type: 'pick-units', lineId: key, units: unpaid })
									}
								>
									<Text variant="subheading" className="leading-tight">
										{decode(line.name)}
									</Text>
									<Text variant="key" className="leading-tight" decodeHtml>
										{paid
											? t('pos_checkout.units_paid_of', {
													n: paid.units,
													total: line.quantity,
													methods: paid.methods.join(' + '),
												})
											: t('pos_checkout.unit_price_each', {
													amount: format(unitsMinor(line.totalMinor, line.quantity, 1)),
												})}
									</Text>
								</PressableSurface>
							</ListItem>
						);
					})}
				</View>
			) : null}
			{/* The opened payments and the phone's pick list take the keypad's place: gone, not shrunk. */}
			{showDone || pickList ? null : (
				<Keypad
					rows={KEYPAD_ROWS.map((row) =>
						row.map((key) => ({ ...key, disabled: busy || fixedAmount }))
					)}
					onPress={(name) => flow.commands.dispatch({ type: 'key', key: name as TenderKey })}
					fit={shrink ? 'shrink' : 'tile'}
					testID="checkout-keypad"
					onLayout={(event) => setHeadHeight(event.nativeEvent.layout.y)}
					className="w-full"
				/>
			)}
			{/* On a phone the full-size dialog keeps this 8 above the bottom inset: the shell's `fill` pads the inset and the panel keeps `py-2` (`lib/overlay`, `dialog/index.tsx`). */}
			<View className="w-full" onLayout={(event) => setFootHeight(event.nativeEvent.layout.height)}>
				<Button
					variant="default"
					size="lg"
					className="w-full"
					testID="checkout-commit"
					loading={saving || flow.running === 'takeTender'}
					disabled={
						!method ||
						busy ||
						// A cash due rounded to nothing still settles the sale.
						(figures.entryAppliedMinor <= 0 && figures.roundingMinor === 0) ||
						needsReader ||
						Boolean(reason) ||
						noChange ||
						missing !== null
					}
					onPress={() => void flow.commands.takeTender()}
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
	return method.kind === 'cash' ? 'register' : 'card';
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
			className="bg-muted w-full max-w-md flex-row flex-wrap items-center gap-2 rounded-lg px-3 py-2"
		>
			<Icon name="pending" size="xs" className="text-muted-foreground" />
			<Text className="text-foreground flex-1 text-sm" decodeHtml>
				{stamp.destination
					? t('pos_checkout.invoice_sent_to_on', {
							destination: stamp.destination,
							date: sentOn ?? '',
						})
					: t('pos_checkout.invoice_sent_on', { date: sentOn ?? '' })}
			</Text>
			<Button
				variant="outline-destructive"
				size="sm"
				testID="checkout-cancel-invoice"
				loading={flow.running === 'cancelInvoice'}
				disabled={busy || !flow.online}
				onPress={() => void flow.commands.cancelInvoice()}
			>
				<ButtonText>{t('pos_checkout.cancel_invoice')}</ButtonText>
			</Button>
		</View>
	);
}

/** An attempt the provider never answered (ADR 0040 rule 7): it may yet be paid, never "failed". */
function AttemptUnansweredLine({ flow, busy }: { flow: TenderFlow; busy: boolean }) {
	const t = useT();
	const attempt = flow.unansweredAttempt!;
	const time = useDateFormat(attempt.sentAtGmt, 'MMM d, h:mm a', false);
	return (
		<View
			testID="checkout-attempt-unanswered"
			className="bg-muted w-full max-w-md flex-row flex-wrap items-center gap-2 rounded-lg px-3 py-2"
		>
			<Icon name="pending" size="xs" className="text-muted-foreground" />
			<Text className="text-foreground flex-1 text-sm" decodeHtml>
				{attempt.title && time
					? t('pos_checkout.attempt_unanswered_known', { method: attempt.title, time })
					: t('pos_checkout.attempt_unanswered')}
			</Text>
			<Button
				variant="outline-destructive"
				size="sm"
				testID="checkout-clear-attempt"
				loading={flow.running === 'clearAttempt'}
				disabled={busy || !flow.online}
				onPress={() => void flow.commands.clearAttempt()}
			>
				<ButtonText>{t('pos_checkout.clear_attempt')}</ButtonText>
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
	// ADR 0040 Decided 1 rule 1: a tile taken offline says it is sent later, and the risk.
	if (tile.settlesLater)
		return (
			<View testID={`checkout-method-sent-later-${method.id}`}>
				<Text className="text-warning-text text-center text-xs">
					{t('pos_checkout.tile_sent_later')}
				</Text>
				<Text className="text-warning-text text-center text-xs">
					{t('pos_checkout.tile_store_may_refuse')}
				</Text>
			</View>
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
				<Text testID={`checkout-method-status-${method.id}`} variant="help">
					{t('pos_checkout.reader_battery_percent', { battery })}
				</Text>
			) : null}
		</>
	);
}
