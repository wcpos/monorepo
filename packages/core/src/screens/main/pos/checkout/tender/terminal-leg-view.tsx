import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { LogCopyButton, type LogLine, logToText, LogView } from '@wcpos/components/log-view';
import { StatusBadge } from '@wcpos/components/status-badge';
import { StepProgress } from '@wcpos/components/step-progress';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';

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
	// The ids the pane knows go where a reader of the log looks for them: what the leg was
	// sent with under the first line, the payment under the last.
	const refs = {
		first: [
			[t('pos_checkout.log_reader'), readerId],
			[t('pos_checkout.log_action'), row.provider_refs?.action],
		],
		last: [[t('pos_checkout.log_payment'), row.id]],
	};
	const idFields = (pairs: (string | null | undefined)[][]) =>
		pairs.filter((pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1] !== '');
	// Before the first event answers, the ids are still worth reading and copying.
	const trailer = events.length ? [] : idFields([...refs.first, ...refs.last]);
	const levelLabels = {
		ok: t('health.logs.level_ok'),
		warn: t('health.logs.level_warn'),
		error: t('health.logs.level_error'),
	};
	const lines: LogLine[] = events.map((event, index) => {
		const line = describeEvent(event, t, { readerLabel, failureReason, formatAmount });
		return {
			time: new Date(event.t).toTimeString().slice(0, 8),
			level: logLevel(line.tone),
			message: line.text,
			fields: [
				// The ids the wire message carried, kept out of the wording.
				...(line.detail ? ([['', line.detail]] as [string, string][]) : []),
				...(index === 0 ? idFields(refs.first) : []),
				...(index === events.length - 1 ? idFields(refs.last) : []),
			],
		};
	});
	const copied = (ok: boolean) => {
		if (ok) logger.info(t('pos_checkout.log_copied'), { showToast: true });
		// A refused clipboard is not a payment problem; the log is still on screen.
		else logger.warn('Terminal log copy failed');
	};
	if (leg.outcome === 'captured' && leg.settlement?.finishingError) {
		return (
			<ScrollView className="bg-card flex-1">
				<CapturedUnfinishedNotice finishingError={leg.settlement.finishingError} />
			</ScrollView>
		);
	}
	if (leg.outcome === 'captured') return null; // The flow consumes this external outcome and opens the receipt.
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
			{/* The status is said once, here. The steps show where; the log, behind Details, says why. */}
			<StatusBadge
				testID="checkout-terminal-status"
				label={status}
				variant={failed || leg.captureFailed ? 'error' : 'muted'}
			/>
			{/* Flat on the pane: no card around the reader, no box around the log (owner, 2026-10-06). */}
			<VStack className="w-full max-w-md" space="md">
				<HStack className="flex-wrap items-center justify-between gap-2 pt-4">
					<Text className="text-muted-foreground shrink text-xs" decodeHtml>
						{method?.title ?? row.method_id} · {readerLabel}
					</Text>
					{connected ? (
						<StatusBadge
							variant="success"
							label={
								battery != null
									? t('pos_checkout.reader_connected_battery', { battery })
									: t('pos_checkout.reader_connected')
							}
						/>
					) : null}
				</HStack>
				<StepProgress
					steps={steps.map((label) => ({ label }))}
					current={currentStep}
					status={failed ? 'failed' : ended ? 'stopped' : 'active'}
					stepTestID={(index) => `checkout-terminal-step-${index}`}
				/>
				<View className="bg-border h-px w-full" />
				<Collapsible open={open} onOpenChange={setOpen} className="gap-0">
					<HStack className="min-h-row items-center justify-between">
						{/* The trigger draws its own chevron. */}
						<CollapsibleTrigger testID="checkout-terminal-log-toggle">
							<Text className="text-muted-foreground text-sm">
								{open ? t('pos_checkout.hide_details') : t('pos_checkout.details')}
							</Text>
						</CollapsibleTrigger>
						{open ? (
							<LogCopyButton
								text={logToText(lines, { trailer, levelLabels })}
								label={t('health.logs.copy_entry')}
								shareLabel={t('pos_checkout.share_log')}
								onCopied={copied}
								testID="checkout-terminal-log-copy"
							/>
						) : null}
					</HStack>
					<CollapsibleContent testID="checkout-terminal-log">
						<LogView
							frame="none"
							lines={lines}
							trailer={trailer}
							levelLabels={levelLabels}
							className="pb-3"
						/>
					</CollapsibleContent>
				</Collapsible>
				<View className="bg-border h-px w-full" />
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

/** The log's four levels from the catalogue's five tones: progress is plain, a void is quiet. */
function logLevel(tone: EventTone): LogLine['level'] {
	return tone === 'error' ? 'error' : tone === 'warning' ? 'warn' : 'info';
}
