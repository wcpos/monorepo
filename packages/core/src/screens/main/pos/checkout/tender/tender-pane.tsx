import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';

import { TerminalLegView } from './terminal-leg-view';
import { disabledReasonKey, kindLabelKey } from './labels';
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
	/** Phones get two tiles a row and the keypad beneath, instead of a grid beside the ledger. */
	compact?: boolean;
}

/**
 * The working side of the checkout: every method the till can offer, then the
 * amount for the one that was tapped. Tiles stay on screen behind the keypad on
 * a wide screen so switching tender is one tap, not a back-then-choose.
 */
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

	return (
		<VStack space="md" className="flex-1">
			{/* Two-up on a phone, as many as fit beside the ledger on a wide screen —
			    the tile itself carries the width, so the row only has to wrap. */}
			<View className="flex-row flex-wrap gap-2">
				{flow.tiles.map((tile) => (
					<PaymentTile
						key={tile.method.id}
						tile={tile}
						selected={flow.state.methodId === tile.method.id}
						compact={compact}
						onPress={() => flow.pickMethod(tile.method.id)}
					/>
				))}
			</View>
			{flow.method ? (
				<TenderKeypad key={flow.method.id} flow={flow} format={format} />
			) : (
				<Text className="text-muted-foreground text-sm">
					{flow.state.splitPlan
						? t('pos_checkout.choose_payment_for_leg', {
								n: flow.state.splitPlan.taken + 1,
								ways: flow.state.splitPlan.ways,
								amount: format(flow.thisPaymentMinor),
							})
						: t(
								flow.state.customAmount
									? 'pos_checkout.choose_payment_then_amount'
									: 'pos_checkout.choose_a_payment_type'
							)}
				</Text>
			)}
		</VStack>
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

	return (
		<Button
			testID={`checkout-tile-${tile.method.id}`}
			variant={selected ? 'outline-primary' : 'outline'}
			disabled={saving || tile.disabled}
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
						{t(disabledReasonKey(tile.reason), {
							title: tile.method.title,
							...(typeof tile.reason === 'object' ? tile.reason : {}),
						})}
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
function TenderKeypad({ flow, format }: { flow: TenderFlow; format: (minor: number) => string }) {
	const t = useT();
	const [choosingReader, setChoosingReader] = React.useState(false);
	const method = flow.method!;
	const givesChange = method.capabilities.change === true;
	const server = method.capture.mode === 'server';
	const locked = flow.lockToDefault || (flow.readers.length === 1 && flow.readers[0].isDefault);
	const selectedReader = flow.readers.find(({ id }) => id === flow.state.readerId);
	const needsReader = server && (!selectedReader || selectedReader.inUseBy !== null);
	const reason = flow.tiles.find((tile) => tile.method.id === method.id)?.reason;

	return (
		<VStack space="sm" testID="checkout-keypad" className="max-w-sm">
			<VStack space="xs">
				<Text className="text-muted-foreground text-xs tracking-wider uppercase">
					{givesChange ? t('pos_checkout.tendered') : method.title}
					{flow.state.splitPlan ? (
						<Text testID="checkout-keypad-leg">{` · ${t('pos_checkout.payment_n_of', { n: flow.state.splitPlan.taken + 1, ways: flow.state.splitPlan.ways })}`}</Text>
					) : null}
				</Text>
				<Text testID="checkout-entry" className="text-4xl font-bold tabular-nums">
					{format(flow.state.entryMinor)}
				</Text>
				{givesChange && flow.entryChangeMinor > 0 ? (
					<Text className="text-success text-sm font-semibold">
						{t('pos_checkout.change_due', { amount: format(flow.entryChangeMinor) })}
					</Text>
				) : null}
			</VStack>

			{/* The terminal choice sits with the amount, above the keypad: for a card
			    leg the amount is already right and WHICH reader is the decision. */}
			{server ? (
				<VStack space="xs">
					{locked || (!needsReader && (!choosingReader || flow.readers.length === 1)) ? (
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
									disabled={flow.busy}
									onPress={() => setChoosingReader(true)}
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
										<Text className="text-muted-foreground text-xs">
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

			<View className="flex-row flex-wrap gap-2">
				{givesChange ? (
					flow.quickAmountsMinor.map((minor) => (
						<Button
							key={minor}
							variant="secondary"
							size="sm"
							testID={`checkout-quick-${fromMinor(minor, flow.dp)}`}
							onPress={() => flow.dispatch({ type: 'set-entry', minor })}
						>
							<ButtonText>{format(minor)}</ButtonText>
						</Button>
					))
				) : (
					<Button
						variant="secondary"
						size="sm"
						testID="checkout-quick-balance"
						onPress={() => flow.dispatch({ type: 'set-entry', minor: flow.balanceMinor })}
					>
						<ButtonText>
							{t('pos_checkout.full_balance', { amount: format(flow.balanceMinor) })}
						</ButtonText>
					</Button>
				)}
			</View>

			<VStack space="xs">
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

			{reason ? (
				<Text className="text-warning text-sm">
					{t(disabledReasonKey(reason), {
						title: method.title,
						...(typeof reason === 'object' ? reason : {}),
					})}
				</Text>
			) : null}

			<HStack className="gap-2">
				<Button
					variant="success"
					size="lg"
					className="flex-1"
					testID="checkout-take-payment"
					loading={flow.busy}
					disabled={flow.busy || flow.entryAppliedMinor <= 0 || needsReader || Boolean(reason)}
					onPress={() => void flow.takeTender()}
				>
					<ButtonText decodeHtml>
						{t('pos_checkout.take_amount_in', {
							amount: format(flow.entryAppliedMinor),
							method: method.title,
						})}
					</ButtonText>
				</Button>
				<Button
					variant="outline"
					size="lg"
					testID="checkout-tender-back"
					disabled={flow.busy}
					onPress={() => flow.dispatch({ type: 'back' })}
				>
					<ButtonText>{t('common.cancel')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
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
			variant="muted"
			size="lg"
			className="flex-1"
			testID={testID ?? `checkout-key-${value}`}
			onPress={() => flow.dispatch({ type: 'key', key: value })}
		>
			{icon ? <Icon name={icon} /> : <ButtonText>{label}</ButtonText>}
		</Button>
	);
}
