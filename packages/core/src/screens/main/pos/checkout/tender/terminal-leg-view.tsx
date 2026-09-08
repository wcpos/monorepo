import * as React from 'react';
import { Share } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { Loader } from '@wcpos/components/loader';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import { getLogger } from '@wcpos/utils/logger';
import { Platform } from '@wcpos/utils/platform';

import { failureReasonLabel, providerErrorMessage } from './labels';
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
	const [open, setOpen] = React.useState(false);
	const leg = flow.terminalLeg!;
	const { row } = leg;
	const final = leg.phase === 'final';
	const method = flow.tiles.find(({ method }) => method.id === row.method_id)?.method;
	const hardware = method?.capture.hardware;
	const readerId = row.provider_refs?.reader ?? leg.reader ?? '';
	const readerLabel =
		hardware && 'readers' in hardware
			? (hardware.readers.find(({ id }) => id === readerId)?.label ?? readerId)
			: readerId;
	const failed = final && leg.outcome === 'failed';
	const reason = providerErrorMessage(leg.error) ?? failureReasonLabel(row.failure_reason, t);
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
		status = t('pos_checkout.capture_failed', { reason: leg.error?.message ?? reason });
		action = 'capture';
	} else if (leg.phase === 'polling' && leg.capturing) {
		status = t('pos_checkout.terminal_capturing');
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
		<VStack testID="checkout-terminal-leg" space="md">
			<Text className="text-muted-foreground text-xs tracking-wider uppercase">
				{method?.title ?? row.method_id}
			</Text>
			<Text className="text-4xl font-bold tabular-nums">
				{format(toMinor(row.amount, flow.dp))}
			</Text>
			<HStack className="items-center gap-2">
				{!final ? <Loader /> : null}
				<Text
					testID="checkout-terminal-status"
					className={failed || leg.captureFailed ? 'text-destructive' : ''}
				>
					{status}
				</Text>
			</HStack>
			{leg.unstable && action === 'cancel' ? (
				<Text className="text-warning text-sm">{t('pos_checkout.connection_unstable')}</Text>
			) : null}
			<Text className="text-muted-foreground text-sm">
				{t('pos_checkout.reader_line', { label: readerLabel })}
			</Text>
			<HStack className="flex-wrap gap-2">
				{action === 'capture' ? (
					<Button
						variant="success"
						testID="checkout-terminal-capture-retry"
						onPress={flow.retryTerminalCapture}
					>
						<ButtonText>{t('pos_checkout.try_capture_again')}</ButtonText>
					</Button>
				) : null}
				{['cancel', 'capture', 'cancelling'].includes(action) ? (
					<Button
						variant="secondary"
						testID="checkout-terminal-cancel"
						disabled={action === 'cancelling'}
						loading={action === 'cancelling'}
						onPress={flow.cancelTerminalLeg}
					>
						<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
					</Button>
				) : null}
				{action === 'release' ? (
					<Button
						variant="outline"
						testID="checkout-terminal-release"
						onPress={flow.releaseTerminalLeg}
					>
						<Text className="text-destructive">{t('pos_checkout.release_this_payment')}</Text>
					</Button>
				) : null}
				{action === 'final' ? (
					<>
						<Button
							variant="success"
							testID="checkout-terminal-retry"
							onPress={flow.retryTerminalLeg}
						>
							<ButtonText>{t('pos_checkout.try_again')}</ButtonText>
						</Button>
						<Button
							variant="outline"
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
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger testID="checkout-terminal-log-toggle">
					<Text>{open ? t('pos_checkout.hide_log') : t('pos_checkout.show_log')}</Text>
				</CollapsibleTrigger>
				<CollapsibleContent testID="checkout-terminal-log">
					{events.map((event, i) => (
						<Text
							key={`${event.t}-${i}`}
							className={`font-mono text-xs ${event.level === 'error' ? 'text-destructive' : event.level === 'warning' ? 'text-warning' : 'text-muted-foreground'}`}
						>
							{lines[i]}
						</Text>
					))}
					{/* No clipboard (an insecure context) means no button — a dead one explains nothing. */}
					{Platform.isNative || canCopy ? (
						<Button
							size="sm"
							variant="secondary"
							className="self-start"
							testID="checkout-terminal-log-copy"
							onPress={() => void copy()}
						>
							<ButtonText>{t('health.logs.copy_entry')}</ButtonText>
						</Button>
					) : null}
				</CollapsibleContent>
			</Collapsible>
		</VStack>
	);
}
