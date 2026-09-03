import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';

import { disabledReasonKey, kindLabelKey } from './labels';
import { useT } from '../../../../../contexts/translations';

import type { TenderKey } from './tender-state';
import type { TenderTile } from './tiles';
import type { TenderFlow } from './use-tender-flow';

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
				<TenderKeypad flow={flow} format={format} />
			) : (
				<Text className="text-muted-foreground text-sm">
					{flow.state.splitShareMinor === null
						? t('pos_checkout.choose_a_payment_type')
						: t('pos_checkout.choose_payment_for_amount', {
								amount: format(flow.state.splitShareMinor),
							})}
				</Text>
			)}
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
	compact,
	onPress,
}: {
	tile: TenderTile;
	selected: boolean;
	compact?: boolean;
	onPress: () => void;
}) {
	const t = useT();

	return (
		<Button
			testID={`checkout-tile-${tile.method.id}`}
			variant={selected ? 'outline-primary' : 'outline'}
			disabled={tile.disabled}
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
				{tile.reason ? (
					<Text className="text-warning text-xs">
						{t(disabledReasonKey(tile.reason), { title: tile.method.title })}
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
	const method = flow.method!;
	const givesChange = method.capabilities.change === true;

	return (
		<VStack space="sm" testID="checkout-keypad" className="max-w-sm">
			<VStack space="xs">
				<Text className="text-muted-foreground text-xs tracking-wider uppercase">
					{givesChange ? t('pos_checkout.tendered') : method.title}
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

			<HStack className="gap-2">
				<Button
					variant="success"
					size="lg"
					className="flex-1"
					testID="checkout-take-payment"
					loading={flow.busy}
					disabled={flow.busy || flow.entryAppliedMinor <= 0}
					onPress={() => void flow.takeTender()}
				>
					<ButtonText>
						{t('pos_checkout.take_amount', { amount: format(flow.entryAppliedMinor) })}
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
			{icon ? <Icon name={icon} /> : <ButtonText className="text-lg">{label}</ButtonText>}
		</Button>
	);
}
