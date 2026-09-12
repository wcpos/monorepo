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
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { Platform } from '@wcpos/utils/platform';

import { failureReasonLabel, providerErrorMessage } from './labels';
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
	const reason =
		providerErrorMessage(leg.error) ??
		failureReasonLabel(
			row.failure_reason ?? ('failureReason' in leg ? leg.failureReason : null),
			t
		);
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
	const lines = events.map(
		(event) => `${new Date(event.t).toTimeString().slice(0, 8)} · ${event.message}`
	);
	const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard);
	const copy = async () => {
		try {
			// Match Logs: native uses the share sheet; browser/Electron use the Clipboard API.
			if (Platform.isNative) {
				await Share.share({ message: lines.join('\n') });
				return;
			}
			await navigator.clipboard.writeText(lines.join('\n'));
			logger.info(t('pos_checkout.log_copied'), { showToast: true });
		} catch (error) {
			// A refused clipboard is not a payment problem; the log is still on screen.
			logger.warn('Terminal log copy failed', {
				context: { error: error instanceof Error ? error.message : String(error) },
			});
		}
	};
	if (leg.outcome === 'captured') return null; // The flow consumes this external outcome and opens the receipt.
	return (
		<ScrollView
			testID="checkout-terminal-leg"
			className="bg-sidebar flex-1"
			contentContainerClassName="grow items-center gap-4 pb-4"
		>
			<HStack className="w-full flex-wrap justify-between gap-2">
				{leg.orderNumber ? (
					<Text className="text-sidebar-foreground/70 text-xs">
						{t('common.order')} #{leg.orderNumber} ·{' '}
						{t('coupons.items_summary', { n: flow.lines.length })}
					</Text>
				) : null}
				<Text className="text-sidebar-foreground/70 text-xs" decodeHtml>
					{flow.plan ? flow.planLabel : t('pos_checkout.payment_n_of', { n: 1, ways: 1 })}
				</Text>
			</HStack>
			<View className="min-h-4 flex-1" />
			<Text className="text-sidebar-foreground/70 text-xs font-semibold tracking-wider uppercase">
				{t('pos_checkout.on_the_terminal')}
			</Text>
			<Text
				className={`text-sidebar-foreground font-bold tabular-nums ${screenSize === 'sm' ? 'text-5xl' : 'text-7xl'}`}
			>
				{format(toMinor(row.amount, flow.dp))}
			</Text>
			<Text
				testID="checkout-terminal-status"
				className={`text-center ${failed || leg.captureFailed ? 'text-destructive' : 'text-sidebar-foreground/70'}`}
			>
				{status}
			</Text>
			{leg.unstable && action === 'cancel' ? (
				<Text className="text-warning text-sm">{t('pos_checkout.connection_unstable')}</Text>
			) : null}
			{!final ? <TerminalRing reduceMotion={reduceMotion} /> : null}
			<VStack className="bg-sidebar-foreground/10 w-full max-w-md rounded-2xl p-4" space="md">
				<HStack className="flex-wrap items-center justify-between gap-2">
					<Text className="text-sidebar-foreground/70 shrink text-xs" decodeHtml>
						{method?.title ?? row.method_id} · {readerLabel}
					</Text>
					<HStack className="items-center gap-1">
						{connected ? (
							<>
								<View className="bg-success size-2 rounded-full" />
								<Text className="text-sidebar-foreground/70 text-xs lowercase">
									{t('pos_checkout.reader_connected')}
								</Text>
							</>
						) : null}
						{row.capture_mode === 'device' && driverStatus.reader?.battery != null ? (
							<Text className="text-sidebar-foreground/70 text-xs">
								{t('pos_checkout.reader_battery_percent', { battery: driverStatus.reader.battery })}
							</Text>
						) : null}
					</HStack>
				</HStack>
				<HStack className="gap-0">
					{steps.map((label, index) => (
						<View key={label} className="flex-1 items-center gap-2">
							{index < 3 ? (
								<View className="bg-sidebar-foreground/15 absolute top-[13px] left-1/2 h-px w-full" />
							) : null}
							<View
								className={`size-[26px] items-center justify-center rounded-full ${index === currentStep ? 'bg-sidebar-foreground/15' : ''}`}
							>
								<View
									testID={`checkout-terminal-step-${index}`}
									aria-selected={index === currentStep}
									className={`size-[14px] rounded-full ${reduceMotion ? '' : 'web:transition-all web:duration-200 web:ease-out'} ${index < currentStep ? 'bg-success' : index === currentStep ? 'border-sidebar-foreground scale-110 border-2 opacity-100' : 'border-sidebar-foreground/70 border opacity-30'}`}
								/>
							</View>
							<Text
								className={`text-center text-xs ${index === currentStep ? 'text-sidebar-foreground font-semibold' : 'text-sidebar-foreground/70'}`}
							>
								{label}
							</Text>
						</View>
					))}
				</HStack>
			</VStack>
			<HStack className="flex-wrap justify-center gap-2">
				{action === 'capture' ? (
					<Button
						variant="sidebar-solid"
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
						variant="sidebar-quiet"
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
						variant="sidebar-quiet"
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
							variant="sidebar-solid"
							size="lg"
							testID="checkout-terminal-retry"
							onPress={flow.retryTerminalLeg}
						>
							<ButtonText>{t('pos_checkout.try_again')}</ButtonText>
						</Button>
						<Button
							variant="sidebar-quiet"
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
				<Text className="text-sidebar-foreground/70 text-sm">
					{t('pos_checkout.release_explainer')}
				</Text>
			) : null}
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger testID="checkout-terminal-log-toggle">
					<Text className="text-sidebar-foreground/70 text-center">
						{open ? t('pos_checkout.hide_log') : t('pos_checkout.show_log')}
					</Text>
				</CollapsibleTrigger>
				<CollapsibleContent testID="checkout-terminal-log">
					{events.map((event, i) => (
						<Text
							key={`${event.t}-${i}`}
							className={`font-mono text-xs ${event.level === 'error' ? 'text-destructive' : event.level === 'warning' ? 'text-warning' : 'text-sidebar-foreground/70'}`}
						>
							{lines[i]}
						</Text>
					))}
					{/* No clipboard (an insecure context) means no button — a dead one explains nothing. */}
					{Platform.isNative || canCopy ? (
						<Button
							size="sm"
							variant="sidebar-quiet"
							className="self-start"
							testID="checkout-terminal-log-copy"
							onPress={() => void copy()}
						>
							<ButtonText>{t('health.logs.copy_entry')}</ButtonText>
						</Button>
					) : null}
				</CollapsibleContent>
			</Collapsible>
			<View className="min-h-4 flex-1" />
		</ScrollView>
	);
}

function TerminalRing({ reduceMotion }: { reduceMotion: boolean }) {
	const rotation = useSharedValue(0);
	// Reanimated owns a UI-thread animation; start/stop it with this mounted ring.
	React.useEffect(() => {
		if (reduceMotion) return;
		rotation.value = withRepeat(withTiming(360, { duration: 1000, easing: Easing.linear }), -1);
		return () => cancelAnimation(rotation);
	}, [reduceMotion, rotation]);
	const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));
	return (
		<Animated.View
			testID="checkout-terminal-ring"
			className="border-sidebar-foreground/15 border-t-sidebar-foreground/80 size-[112px] rounded-full border-[6px]"
			style={style}
		/>
	);
}
