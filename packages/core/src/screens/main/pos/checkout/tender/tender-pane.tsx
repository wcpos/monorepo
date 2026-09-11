import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';

import { ReaderConnection } from './reader-connection';
import { TerminalLegView } from './terminal-leg-view';
import { deviceTransports, selectableReaders } from './tiles';
import { disabledReasonKey, kindLabelKey } from './labels';
import { SplitView } from './split-view';
import { useDriverStatus } from './use-driver-status';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { useT } from '../../../../../contexts/translations';

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
	/** Phones scroll the selector sideways and use a smaller entry. */
	compact?: boolean;
}

export function TenderPane({ flow, format, compact }: Props) {
	const t = useT();

	const slow = useElapsed(flow.saveState?.kind === 'saving', SLOW_SAVE_NOTICE_MS);

	if (flow.terminalLeg) return <TerminalLegView flow={flow} format={format} />;

	// A refused save offers no tiles; a queued offline save uses each tile’s capability rule.
	if (flow.saveState?.kind === 'rejected') {
		return <RefusedPane rejection={flow.saveState} />;
	}
	if (flow.saveState?.kind === 'saving') {
		return (
			<VStack space="md" className="flex-1">
				<View className="flex-row flex-wrap gap-2">
					{flow.tiles.length > 0
						? flow.tiles.map((tile) => (
								<PaymentTile
									key={tile.method.id}
									tile={tile}
									selected={flow.state.methodId === tile.method.id}
									compact={compact}
									saving
									onPress={() => flow.pickMethod(tile.method.id)}
								/>
							))
						: Array.from({ length: 4 }, (_, index) => (
								<View
									key={index}
									testID="checkout-tile-skeleton"
									className={`bg-muted h-[4.25rem] rounded-md ${
										compact ? 'min-w-[45%] flex-1' : 'min-w-[9.5rem]'
									}`}
								/>
							))}
				</View>
				{/* Each real tile already says it; the line below is for the skeleton fallback only. */}
				{flow.tiles.length === 0 ? (
					<Text className="text-muted-foreground text-sm">{t('pos_checkout.saving_order')}</Text>
				) : null}
				{slow ? (
					<Text testID="checkout-save-slow" className="text-warning text-sm">
						{t('pos_checkout.store_not_answering')}
					</Text>
				) : null}
			</VStack>
		);
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

/**
 * A method the app cannot drive is shown disabled with the reason, never hidden
 * (payments contract §13) — a cashier looking for a gateway they know is enabled
 * on the store needs to be told why it is not on this till.
 */
function PaymentTile({
	tile,
	selected,
	saving,
	compact,
	onPress,
}: {
	tile: TenderTile;
	selected: boolean;
	saving?: boolean;
	compact?: boolean;
	onPress: () => void;
}) {
	const t = useT();
	const canChooseOffline =
		tile.reason === 'offline' &&
		tile.method.capture.mode === 'device' &&
		deviceTransports(tile.method).some((item) => item.offline === 'queue');

	return (
		<Button
			testID={`checkout-tile-${tile.method.id}`}
			variant={selected ? 'outline-primary' : 'outline'}
			disabled={saving || (tile.disabled && !canChooseOffline)}
			onPress={onPress}
			className={`h-auto items-stretch justify-start px-3 py-3 ${
				compact ? 'min-w-[45%] flex-1' : 'min-w-[9.5rem]'
			}`}
		>
			<VStack space="xs" className="flex-1">
				<HStack className="items-center justify-between gap-2">
					<Text className="text-muted-foreground text-[10px] tracking-wider uppercase">
						{t(kindLabelKey(tile.method.kind))}
					</Text>
					{tile.settlesLater ? (
						<StatusBadge label={t('pos_checkout.settles_later')} variant="muted" />
					) : null}
					{tile.worksOffline ? (
						<StatusBadge label={t('pos_checkout.works_offline')} variant="muted" />
					) : null}
				</HStack>
				<Text className="text-base font-semibold" decodeHtml>
					{tile.method.title}
				</Text>
				{saving ? (
					<Text testID="checkout-tile-saving" className="text-muted-foreground text-xs">
						{t('pos_checkout.saving_order')}
					</Text>
				) : tile.reason ? (
					<Text className="text-warning text-xs">
						{t(
							canChooseOffline
								? 'pos_checkout.choose_offline_transport'
								: disabledReasonKey(tile.reason),
							{
								title: tile.method.title,
								...(typeof tile.reason === 'object' ? tile.reason : {}),
							}
						)}
					</Text>
				) : null}
			</VStack>
		</Button>
	);
}

const KEYPAD_ROWS = [
	['1', '2', '3'],
	['4', '5', '6'],
	['7', '8', '9'],
] as const;

/**
 * Digits shift in from the right, till-style: the entry is pre-filled with the
 * balance and the first keypress starts a fresh number. There is no decimal key
 * because there is no decimal to get wrong.
 */
function TenderKeypad({ flow, format, compact }: Props) {
	const t = useT();
	const [choosingReader, setChoosingReader] = React.useState<string | null>(null);
	const [unavailableOpen, setUnavailableOpen] = React.useState(false);
	const method = flow.method;
	if (!method && choosingReader !== null) setChoosingReader(null);
	const givesChange = method?.capabilities.change === true;
	const server = method?.capture.mode === 'server';
	const remote = server || method?.capture.mode === 'device';
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
	const due = flow.thisPaymentMinor;
	const noChange = Boolean(method && !givesChange && flow.state.entryMinor > flow.balanceMinor);
	const left = flow.balanceMinor - flow.entryAppliedMinor;
	const canChoose = (tile: TenderTile) =>
		!tile.disabled ||
		(tile.reason === 'offline' &&
			tile.method.capture.mode === 'device' &&
			deviceTransports(tile.method).some((transport) => transport.offline === 'queue'));
	const unavailable = flow.tiles.filter((tile) => !canChoose(tile));
	const pills = flow.tiles.filter(canChoose).map((tile) => {
		const selected = flow.state.methodId === tile.method.id;
		return (
			<Button
				key={tile.method.id}
				variant={selected ? 'sidebar-solid' : 'sidebar-quiet'}
				className="h-12 shrink-0 flex-row gap-2 rounded-xl"
				testID={`checkout-method-${tile.method.id}`}
				disabled={flow.busy}
				onPress={() => {
					setChoosingReader(null);
					flow.pickMethod(tile.method.id);
				}}
			>
				<Icon name={methodIcon(tile.method)} />
				<ButtonText decodeHtml>{tile.method.title}</ButtonText>
				<MethodStatus tile={tile} selected={selected} />
			</Button>
		);
	});
	const hint = noChange
		? t('pos_checkout.no_change_for_method', {
				amount: format(flow.balanceMinor),
				method: method?.title,
			})
		: flow.entryChangeMinor > 0
			? t('pos_checkout.change_due', { amount: format(flow.entryChangeMinor) })
			: flow.entryAppliedMinor < due && flow.state.entryMinor > 0
				? plan
					? t('pos_checkout.less_than_planned', { amount: format(due - flow.entryAppliedMinor) })
					: t('pos_checkout.part_payment_left', { left: format(left) })
				: '';
	const commit = method
		? t(remote ? 'pos_checkout.send_amount_to' : 'pos_checkout.take_amount_in', {
				amount: format(flow.entryAppliedMinor),
				method: method.title,
			}) +
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
			className="bg-sidebar text-sidebar-foreground flex-1"
			contentContainerClassName="items-center gap-2 pb-4"
			showsVerticalScrollIndicator={false}
		>
			<HStack className="flex-wrap items-center justify-center gap-2">
				<Text
					testID="checkout-label"
					decodeHtml
					className="text-sidebar-foreground/70 text-xs font-semibold tracking-wider uppercase"
				>
					{plan
						? `${flow.planLabel} · ${t('pos_checkout.amount_left', { amount: format(flow.balanceMinor) })}`
						: t(
								flow.balanceMinor < flow.totalMinor
									? 'pos_checkout.remaining'
									: 'pos_checkout.to_pay'
							)}{' '}
					<Text testID="checkout-balance" className={plan ? 'hidden' : undefined}>
						{format(flow.balanceMinor)}
					</Text>
				</Text>
				{flow.balanceMinor > 0 ? (
					<Button
						variant="sidebar-quiet"
						size="sm"
						className="rounded-full"
						testID="checkout-split-chip"
						disabled={flow.busy}
						onPress={() =>
							flow.dispatch({
								type: 'open-split',
							})
						}
					>
						<ButtonText>{t('pos_checkout.split')}</ButtonText>
					</Button>
				) : null}
				{!flow.online ? (
					<Text testID="checkout-offline" className="text-warning text-xs">
						{t('pos_checkout.offline')}
					</Text>
				) : null}
			</HStack>
			<Text
				testID="checkout-entry"
				className={`text-sidebar-foreground font-bold tabular-nums ${compact ? 'text-6xl' : 'text-8xl'} ${flow.state.entryDirty ? 'opacity-100' : 'opacity-70'}`}
			>
				{format(flow.state.view === 'select' ? due : flow.state.entryMinor)}
			</Text>
			<Text
				testID="checkout-entry-hint"
				className={`min-h-6 text-sm ${noChange ? 'text-warning' : flow.entryChangeMinor > 0 ? 'text-success' : 'text-sidebar-foreground/70'}`}
				decodeHtml
			>
				{hint}
			</Text>
			{plan ? (
				<View
					testID="checkout-plan"
					className="flex-row flex-wrap items-center justify-center gap-2"
				>
					{flow.planLegs.map((leg, index) => (
						<View
							key={index}
							testID={`checkout-plan-leg-${index}`}
							className={`flex-row items-center gap-1 rounded-full border px-3 py-2 ${leg.state === 'done' ? 'bg-success/20 border-success/30' : leg.state === 'now' ? 'border-sidebar-foreground' : 'border-sidebar-border opacity-60'} ${leg.state === 'rest' ? 'border-dashed' : ''}`}
						>
							{leg.state === 'done' ? (
								<Icon name="check" size="xs" className="text-success" />
							) : null}
							<Text
								className={
									leg.state === 'done' ? 'text-success text-xs' : 'text-sidebar-foreground text-xs'
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
							variant="sidebar"
							size="sm"
							testID="checkout-plan-pick-items"
							onPress={() => {
								flow.dispatch({ type: 'set-split-tab', tab: 'item' });
								flow.dispatch({ type: 'open-split' });
							}}
						>
							<ButtonText className="underline">{t('pos_checkout.pick_next_items')}</ButtonText>
						</Button>
					) : null}
					<Button
						variant="sidebar"
						size="sm"
						testID="checkout-plan-change"
						onPress={() => flow.dispatch({ type: 'open-split' })}
					>
						<ButtonText className="underline">{t('pos_checkout.change_split')}</ButtonText>
					</Button>
				</View>
			) : null}

			{compact ? (
				<ScrollView horizontal className="w-full grow-0" showsHorizontalScrollIndicator={false}>
					<HStack className="gap-2">{pills}</HStack>
				</ScrollView>
			) : (
				<View className="flex-row flex-wrap justify-center gap-2">{pills}</View>
			)}
			{unavailable.length > 0 ? (
				<VStack space="xs" className="w-full max-w-md">
					<Button
						variant="sidebar"
						size="sm"
						className="rounded-md"
						testID="checkout-unavailable-toggle"
						onPress={() => setUnavailableOpen(!unavailableOpen)}
					>
						<ButtonText>
							{t('pos_checkout.not_available_right_now_n', { n: unavailable.length })}
						</ButtonText>
					</Button>
					{unavailableOpen
						? unavailable.map((tile) => (
								<View
									key={tile.method.id}
									testID={`checkout-unavailable-${tile.method.id}`}
									className="bg-sidebar-foreground/10 flex-row items-center gap-2 rounded-md p-2"
								>
									<Icon name={methodIcon(tile.method)} className="text-sidebar-foreground/70" />
									<Text className="text-sidebar-foreground text-sm" decodeHtml>
										{tile.method.title}
									</Text>
									<MethodStatus tile={tile} />
									<Text className="text-sidebar-foreground/70 flex-1 text-xs">
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
					disabled={flow.busy || (Boolean(reason) && reason !== 'offline')}
				/>
			) : null}
			{server ? (
				<VStack space="xs">
					{locked ||
					(!needsReader && (choosingReader !== method?.id || flow.readers.length === 1)) ? (
						<HStack className="items-center gap-2">
							<Text
								testID={locked ? 'checkout-reader-locked' : 'checkout-reader-selected'}
								className="text-sidebar-foreground/70 text-sm"
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
									disabled={flow.busy}
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
										disabled={flow.busy || reader.inUseBy !== null}
										onPress={() => flow.pickReader(reader.id)}
									>
										<ButtonText>{reader.label}</ButtonText>
									</Button>
									{reader.inUseBy !== null ? (
										<Text className="text-sidebar-foreground/70 text-xs">
											{t('pos_checkout.reader_in_use', { number: reader.inUseBy })}
										</Text>
									) : null}
								</VStack>
							))}
						</View>
					)}
					{needsReader ? (
						<Text className="text-sidebar-foreground/70 text-sm">
							{t('pos_checkout.choose_a_terminal')}
						</Text>
					) : null}
				</VStack>
			) : null}

			{method ? (
				<View className="flex-row flex-wrap justify-center gap-2">
					{(givesChange && !remote ? flow.quickAmountsMinor : []).map((minor) => (
						<Button
							key={minor}
							variant="sidebar-quiet"
							size="sm"
							className="rounded-full"
							testID={`checkout-quick-${fromMinor(minor, flow.dp)}`}
							disabled={flow.busy}
							onPress={() => flow.dispatch({ type: 'set-entry', minor })}
						>
							<ButtonText>{format(minor)}</ButtonText>
						</Button>
					))}
					<Button
						variant="sidebar-quiet"
						size="sm"
						className="rounded-full"
						testID={givesChange && !remote ? 'checkout-quick-exact' : 'checkout-quick-balance'}
						disabled={flow.busy}
						onPress={() => flow.dispatch({ type: 'set-entry', minor: due })}
					>
						<ButtonText>
							{t(
								(givesChange && !remote) || plan
									? 'pos_checkout.exact_amount'
									: 'pos_checkout.full_balance',
								{ amount: format(due) }
							)}
						</ButtonText>
					</Button>
				</View>
			) : null}

			<VStack space="xs" testID="checkout-keypad" className="min-h-56 w-full max-w-md">
				{KEYPAD_ROWS.map((row) => (
					<HStack key={row[0]} className="gap-2">
						{row.map((key) => (
							<KeypadKey key={key} flow={flow} value={key} label={key} />
						))}
					</HStack>
				))}
				<HStack className="gap-2">
					<KeypadKey flow={flow} value="clear" label="C" testID="checkout-key-clear" />
					<KeypadKey flow={flow} value="0" label="0" />
					<KeypadKey
						flow={flow}
						value="backspace"
						icon="deleteLeft"
						testID="checkout-key-backspace"
					/>
				</HStack>
			</VStack>

			<Button
				variant="sidebar-solid"
				size="lg"
				className="h-14 w-full max-w-md"
				testID="checkout-commit"
				loading={flow.busy}
				disabled={
					!method ||
					flow.busy ||
					flow.entryAppliedMinor <= 0 ||
					needsReader ||
					Boolean(reason) ||
					noChange
				}
				onPress={() => void flow.takeTender()}
			>
				<ButtonText decodeHtml>{commit}</ButtonText>
			</Button>
		</ScrollView>
	);
}

function KeypadKey({
	flow,
	value,
	label,
	icon,
	testID,
}: {
	flow: TenderFlow;
	value: TenderKey;
	label?: string;
	icon?: 'deleteLeft';
	testID?: string;
}) {
	return (
		<Button
			variant="sidebar-key"
			size="key"
			className={`flex-1 ${value === 'clear' || icon ? 'opacity-60' : ''}`}
			disabled={flow.busy}
			testID={testID ?? `checkout-key-${value}`}
			onPress={() => flow.dispatch({ type: 'key', key: value })}
		>
			{icon ? <Icon name={icon} /> : <ButtonText>{label}</ButtonText>}
		</Button>
	);
}

function methodIcon(method: TenderTile['method']) {
	return method.kind === 'cash' ? 'cashRegister' : 'creditCard';
}

function MethodStatus({ tile, selected }: { tile: TenderTile; selected?: boolean }) {
	const { method } = tile;
	const t = useT();
	// A folded (unavailable) row shows a grey dot and never subscribes to its driver.
	const status = useDriverStatus(
		method.capture.mode === 'device' && !tile.disabled
			? getDriver(method.capture.provider)
			: undefined
	);
	if (method.capture.mode !== 'server' && method.capture.mode !== 'device') return null;
	const connected =
		!tile.disabled &&
		(method.capture.mode === 'device'
			? status.connection === 'connected'
			: selectableReaders(method).readers.length > 0);
	return (
		<View testID={`checkout-method-status-${method.id}`} className="flex-row items-center gap-1">
			<View className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground'}`} />
			{!tile.disabled && status.reader?.battery != null ? (
				<Text className={`text-xs ${selected ? 'text-sidebar' : 'text-sidebar-foreground'}`}>
					{t('pos_checkout.reader_battery_percent', { battery: status.reader.battery })}
				</Text>
			) : null}
		</View>
	);
}
