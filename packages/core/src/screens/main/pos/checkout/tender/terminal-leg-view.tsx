import * as React from 'react';
import { AccessibilityInfo, ScrollView, Share, View } from 'react-native';

import Animated, {
	cancelAnimation,
	Easing,
	useAnimatedStyle,
	useSharedValue,
	withRepeat,
	withTiming,
} from 'react-native-reanimated';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { StatusBadge } from '@wcpos/components/status-badge';
import { SPINNER } from '@wcpos/components/lib/motion';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { Platform } from '@wcpos/utils/platform';

import { describeEvent, type EventTone, failureReasonLabel, providerErrorMessage } from './labels';
import { CapturedUnfinishedNotice } from './captured-unfinished-notice';
import { useDriverStatus } from './use-driver-status';
import { getDriver } from '../../../../../services/payment-drivers/registry';
import { useTheme } from '../../../../../contexts/theme';
import { useT } from '../../../../../contexts/translations';

import type { TenderFlow } from './use-tender-flow';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'terminal']);
export function TerminalLegView({
	flow,
	format,
}: {
	flow: TenderFlow;
	format: (minor: number) => string;
}) {
	const t = useT();
	const { screenSize } = useTheme();
	const [reduceMotion, setReduceMotion] = React.useState(true);
	// AccessibilityInfo is an async platform API. Read once on mount, keeping motion
	// off until it resolves (or if unavailable); no subscription is needed for this moment.
	React.useEffect(() => {
		void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => {});
	}, []);
	const [open, setOpen] = React.useState(false);
	const leg = flow.terminalLeg!;
	const { row } = leg;
	const final = leg.phase === 'final';
	const method = flow.tiles.find(({ method }) => method.id === row.method_id)?.method;
	const hardware = method?.capture.hardware;
	const readerId = row.provider_refs?.reader ?? leg.reader ?? '';
	const reader =
		hardware && 'readers' in hardware
			? hardware.readers.find(({ id }) => id === readerId)
			: undefined;
	const readerLabel = reader?.label ?? readerId;
	const driverStatus = useDriverStatus(
		row.capture_mode === 'device' ? getDriver(row.provider) : undefined
	);
	const connected =
		row.capture_mode === 'device'
			? driverStatus.connection === 'connected'
			: reader?.status === 'online';
	const battery = row.capture_mode === 'device' ? driverStatus.reader?.battery : undefined;
	const step =
		leg.capturing || leg.captureFailed || leg.phase === 'confirming' || leg.phase === 'capturing'
			? 2
			: leg.phase === 'polling' || leg.phase === 'collecting'
				? 1
				: 0;
	const [currentStep, setCurrentStep] = React.useState(step);
	// Final/cancelling snapshots drop the previous phase; retain the last visible step.
	if (!final && leg.phase !== 'cancelling' && !leg.cancelRequested && step !== currentStep) {
		setCurrentStep(step);
	}
	const steps = [
		t('pos_checkout.step_sent'),
		t('pos_checkout.step_on_terminal'),
		t('pos_checkout.step_approved'),
		t('pos_checkout.step_captured'),
	];
	const failed = final && leg.outcome === 'failed';
	// Nobody lost money on a cancel, a time-out or a release: the mark is grey, not red.
	const ended = final && (leg.outcome === 'voided' || leg.outcome === 'released');
	const failureReason = row.failure_reason ?? ('failureReason' in leg ? leg.failureReason : null);
	const reason = providerErrorMessage(leg.error) ?? failureReasonLabel(failureReason, t);
	let status = t('pos_checkout.waiting_for_terminal');
	let action: 'cancel' | 'capture' | 'cancelling' | 'release' | 'final' | 'none' = 'cancel';
	if (final && ['failed', 'voided', 'released'].includes(leg.outcome ?? '')) {
		status = failed
			? t('pos_checkout.payment_failed_reason', { reason })
			: leg.outcome === 'voided'
				? leg.deadlineHandled
					? t('pos_checkout.payment_timed_out')
					: t('pos_checkout.payment_cancelled_on_terminal')
				: t('pos_checkout.payment_released');
		action = 'final';
	} else if (leg.phase === 'cancelling') {
		status = t('pos_checkout.terminal_cancelling');
		action = 'cancelling';
	} else if (leg.phase === 'polling' && leg.cancelRequested) {
		status = t('pos_checkout.terminal_cancel_waiting');
		action = leg.releaseAvailable ? 'release' : 'none';
	} else if (leg.captureFailed) {
		status = t(
			row.capture_mode === 'device'
				? 'pos_checkout.device_confirmation_failed'
				: 'pos_checkout.capture_failed',
			{ reason: leg.error?.message ?? reason }
		);
		action = 'capture';
	} else if (leg.phase === 'polling' && leg.capturing) {
		status = t('pos_checkout.terminal_capturing');
		action = 'none';
	} else if (
		row.capture_mode === 'device' &&
		leg.cancelRequested &&
		(leg.phase === 'collecting' || leg.phase === 'creating')
	) {
		const cancelOnDevice = 'cancelOnDevice' in leg && leg.cancelOnDevice;
		status = t(
			cancelOnDevice ? 'pos_checkout.cancel_on_reader' : 'pos_checkout.terminal_cancelling'
		);
		action = 'none';
	} else if (leg.phase === 'collecting') status = t('pos_checkout.present_card');
	else if (leg.phase === 'confirming' || leg.phase === 'capturing') {
		status = t('pos_checkout.device_confirming');
		action = 'none';
	} else if (leg.phase === 'creating') status = t('pos_checkout.terminal_starting');
	const events = [...(row.events ?? []), ...leg.clientEvents].sort(
		(a, b) => Date.parse(a.t) - Date.parse(b.t)
	);
	const formatAmount = (amount: string, currency: string) =>
		currency === row.currency ? format(toMinor(amount, flow.dp)) : null;
	const lines = events.map((event) => ({
		event,
		time: new Date(event.t).toTimeString().slice(0, 8),
		line: describeEvent(event, t, { readerLabel, failureReason, formatAmount }),
	}));
	const latest = lines[lines.length - 1];
	// What Copy copies: the words the cashier read, then the wire line support needs.
	const copyText = lines
		.map(({ time, line, event }) =>
			line.text === event.message
				? `${time} · ${event.message}`
				: `${time} · ${line.text} — ${event.message}`
		)
		.concat(
			[
				[t('pos_checkout.log_reader'), readerId],
				[t('pos_checkout.log_action'), row.provider_refs?.action],
				[t('pos_checkout.log_payment'), row.id],
			]
				.filter(([, value]) => Boolean(value))
				.map(([label, value]) => `${label}: ${value}`)
		)
		.join('\n');
	const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
	const copy = async () => {
		try {
			// Match Logs: native uses the share sheet; browser/Electron use the Clipboard API.
			if (Platform.isNative) {
				await Share.share({ message: copyText });
				return;
			}
			await navigator.clipboard.writeText(copyText);
			logger.info(t('pos_checkout.log_copied'), { showToast: true });
		} catch (error) {
			// A refused clipboard is not a payment problem; the log is still on screen.
			logger.warn('Terminal log copy failed', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		}
	};
	if (leg.outcome === 'captured' && leg.settlement?.finishingError) {
		return (
			<ScrollView className="bg-card flex-1">
				<CapturedUnfinishedNotice finishingError={leg.settlement.finishingError} />
			</ScrollView>
		);
	}
	if (leg.outcome === 'captured') return null; // The flow consumes this external outcome and opens the receipt.
	const ids = [
		[t('pos_checkout.log_reader'), readerId],
		[t('pos_checkout.log_action'), row.provider_refs?.action],
		[t('pos_checkout.log_payment'), row.id],
	].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '');
	return (
		<ScrollView
			testID="checkout-terminal-leg"
			className="bg-card flex-1"
			contentContainerClassName="grow items-center gap-4 pb-4"
		>
			<HStack className="w-full flex-wrap justify-between gap-2">
				{leg.orderNumber ? (
					<Text className="text-muted-foreground text-xs">
						{t('common.order')} #{leg.orderNumber} ·{' '}
						{t('coupons.items_summary', { n: flow.lines.length })}
					</Text>
				) : null}
				<Text className="text-muted-foreground text-xs" decodeHtml>
					{flow.plan ? flow.planLabel : t('pos_checkout.payment_n_of', { n: 1, ways: 1 })}
				</Text>
			</HStack>
			<View className="min-h-4 flex-1" />
			<Text className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
				{t('pos_checkout.on_the_terminal')}
			</Text>
			<Text
				className={`text-foreground font-bold tabular-nums ${screenSize === 'sm' ? 'text-5xl' : 'text-7xl'}`}
			>
				{format(toMinor(row.amount, flow.dp))}
			</Text>
			<StatusBadge
				testID="checkout-terminal-status"
				label={status}
				variant={failed || leg.captureFailed ? 'error' : 'muted'}
			/>
			{/* The ring's slot: a spinner while the leg is live, a mark of the same size when
			    it ends, so the end of a payment weighs as much as the Paid tick does. */}
			{!final ? (
				<TerminalRing reduceMotion={reduceMotion} />
			) : failed || ended ? (
				<View
					testID={`checkout-terminal-mark-${failed ? 'failed' : 'ended'}`}
					className={`size-28 items-center justify-center rounded-full ${failed ? 'bg-destructive/15' : 'bg-muted'}`}
				>
					<Icon
						name={failed ? 'xmark' : 'minus'}
						size="4xl"
						className={failed ? 'text-destructive' : 'text-muted-foreground'}
					/>
				</View>
			) : null}
			<VStack className="bg-muted w-full max-w-md rounded-2xl p-4" space="md">
				<HStack className="flex-wrap items-center justify-between gap-2">
					<Text className="text-muted-foreground shrink text-xs" decodeHtml>
						{method?.title ?? row.method_id} · {readerLabel}
					</Text>
					{connected ? (
						<HStack className="items-center gap-1">
							<View className="bg-success size-2 rounded-full" />
							<Text className="text-muted-foreground text-xs">
								{battery != null
									? t('pos_checkout.reader_connected_battery', { battery })
									: t('pos_checkout.reader_connected')}
							</Text>
						</HStack>
					) : null}
				</HStack>
				<HStack className="items-start">
					{steps.map((label, index) => {
						const reached = index <= currentStep;
						const current = index === currentStep;
						const mark = current && failed ? 'failed' : current && ended ? 'ended' : null;
						return (
							<View key={label} className="flex-1 items-center gap-2">
								{/* The line runs node to node behind the discs; a reached segment is green. */}
								<View className="w-full flex-row items-center">
									<View
										className={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : reached ? 'bg-success' : 'bg-border'}`}
									/>
									<View
										testID={`checkout-terminal-step-${index}`}
										aria-selected={current}
										className={`items-center justify-center rounded-full ${
											mark === 'failed'
												? 'bg-destructive size-5'
												: mark === 'ended'
													? 'bg-muted-foreground size-5'
													: current
														? 'bg-card border-primary size-4 border-2'
														: reached
															? 'bg-success size-4'
															: 'bg-border size-4'
										}`}
									>
										{mark ? (
											<Icon
												name={mark === 'failed' ? 'xmark' : 'minus'}
												size="xs"
												className="text-primary-foreground"
											/>
										) : null}
									</View>
									<View
										className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'opacity-0' : index < currentStep ? 'bg-success' : 'bg-border'}`}
									/>
								</View>
								<Text
									className={`text-center text-xs ${
										mark === 'failed'
											? 'text-destructive font-semibold'
											: current
												? 'text-foreground font-semibold'
												: 'text-muted-foreground'
									}`}
								>
									{label}
								</Text>
							</View>
						);
					})}
				</HStack>
				{latest ? (
					<HStack testID="checkout-terminal-latest" className="items-center justify-center gap-2">
						<EventMark tone={latest.line.tone} />
						<Text className={`text-center text-sm ${toneText(latest.line.tone)}`}>
							{latest.line.text}
						</Text>
						<Text className="text-muted-foreground text-xs tabular-nums">· {latest.time}</Text>
					</HStack>
				) : null}
				<Collapsible open={open} onOpenChange={setOpen}>
					<CollapsibleContent testID="checkout-terminal-log">
						<VStack space="xs" className="border-border border-t pt-3">
							{lines.map(({ event, time, line }, i) => (
								<HStack key={`${event.t}-${i}`} className="items-start gap-2">
									<View className="pt-1">
										<EventMark tone={line.tone} />
									</View>
									<VStack className="flex-1">
										<Text className={`text-sm ${toneText(line.tone)}`}>{line.text}</Text>
										{line.detail ? (
											<Text className="text-muted-foreground font-mono text-xs">{line.detail}</Text>
										) : null}
									</VStack>
									<Text className="text-muted-foreground text-xs tabular-nums">{time}</Text>
								</HStack>
							))}
							{ids.map(([label, value]) => (
								<HStack key={label} className="items-start gap-3">
									<Text className="text-muted-foreground w-16 text-xs">{label}</Text>
									<Text className="text-foreground flex-1 font-mono text-xs" selectable>
										{value}
									</Text>
								</HStack>
							))}
							{/* No clipboard (an insecure context) means no button — a dead one explains nothing. */}
							{Platform.isNative || canCopy ? (
								<Button
									size="sm"
									variant="outline"
									className="self-start"
									testID="checkout-terminal-log-copy"
									onPress={() => void copy()}
								>
									<ButtonText>
										{t(Platform.isNative ? 'pos_checkout.share_log' : 'health.logs.copy_entry')}
									</ButtonText>
								</Button>
							) : null}
						</VStack>
					</CollapsibleContent>
					<CollapsibleTrigger testID="checkout-terminal-log-toggle">
						<HStack className="items-center justify-center gap-1">
							<Text className="text-muted-foreground text-sm">
								{open ? t('pos_checkout.hide_details') : t('pos_checkout.details')}
							</Text>
							<Icon
								name={open ? 'chevronUp' : 'chevronDown'}
								size="xs"
								className="text-muted-foreground"
							/>
						</HStack>
					</CollapsibleTrigger>
				</Collapsible>
			</VStack>
			<HStack className="flex-wrap justify-center gap-2">
				{action === 'capture' ? (
					<Button
						variant="default"
						size="lg"
						testID="checkout-terminal-capture-retry"
						onPress={flow.retryTerminalCapture}
					>
						<ButtonText>
							{t(
								row.capture_mode === 'device'
									? 'pos_checkout.retry_confirmation'
									: 'pos_checkout.try_capture_again'
							)}
						</ButtonText>
					</Button>
				) : null}
				{['cancel', 'cancelling'].includes(action) ||
				(action === 'capture' &&
					(row.capture_mode !== 'device' ||
						('resumed' in leg && leg.resumed && row.status === 'authorized'))) ? (
					<Button
						variant="outline"
						size="lg"
						testID="checkout-terminal-cancel"
						disabled={action === 'cancelling'}
						loading={action === 'cancelling'}
						onPress={flow.cancelTerminalLeg}
					>
						<ButtonText>{t('pos_checkout.cancel_on_terminal')}</ButtonText>
					</Button>
				) : null}
				{action === 'release' ? (
					<Button
						variant="outline"
						size="lg"
						testID="checkout-terminal-release"
						onPress={flow.releaseTerminalLeg}
					>
						<ButtonText>{t('pos_checkout.release_this_payment')}</ButtonText>
					</Button>
				) : null}
				{action === 'final' ? (
					<>
						<Button
							variant="default"
							size="lg"
							testID="checkout-terminal-retry"
							onPress={flow.retryTerminalLeg}
						>
							<ButtonText>{t('pos_checkout.try_again')}</ButtonText>
						</Button>
						<Button
							variant="outline"
							size="lg"
							testID="checkout-terminal-another"
							onPress={flow.dismissTerminalLeg}
						>
							<ButtonText>{t('pos_checkout.choose_another_way')}</ButtonText>
						</Button>
					</>
				) : null}
			</HStack>
			{action === 'release' ? (
				<Text className="text-muted-foreground text-sm">{t('pos_checkout.release_explainer')}</Text>
			) : null}
			<View className="min-h-4 flex-1" />
		</ScrollView>
	);
}

function toneText(tone: EventTone): string {
	return tone === 'error'
		? 'text-destructive'
		: tone === 'warning'
			? 'text-warning'
			: tone === 'muted'
				? 'text-muted-foreground'
				: 'text-foreground';
}

/** The level mark of a log line: a dot for progress, an icon where the cashier must read. */
function EventMark({ tone }: { tone: EventTone }) {
	if (tone === 'error') return <Icon name="circleXmark" size="sm" className="text-destructive" />;
	if (tone === 'warning')
		return <Icon name="triangleExclamation" size="sm" className="text-warning" />;
	if (tone === 'void')
		return <Icon name="circleMinus" size="sm" className="text-muted-foreground" />;
	return (
		<View
			className={`size-2 rounded-full ${tone === 'ok' ? 'bg-success' : 'bg-muted-foreground'}`}
		/>
	);
}

function TerminalRing({ reduceMotion }: { reduceMotion: boolean }) {
	const rotation = useSharedValue(0);
	// Reanimated owns a UI-thread animation; start/stop it with this mounted ring.
	React.useEffect(() => {
		if (reduceMotion) return;
		rotation.value = withRepeat(withTiming(360, { duration: SPINNER, easing: Easing.linear }), -1);
		return () => cancelAnimation(rotation);
	}, [reduceMotion, rotation]);
	const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
	return (
		<Animated.View
			testID="checkout-terminal-ring"
			className="border-border border-t-primary size-28 rounded-full border-4"
			style={style}
		/>
	);
}
