import { KNOWN_KINDS } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import type { TileDisabledReason } from './tiles';

/**
 * Cashier-facing wording for the open vocabularies in the payments contract.
 *
 * `kind` and `status` are open by design: a descriptor may name a value this
 * build has never seen. Rather than render a raw wire value at a till, an
 * unknown one falls back to the neutral "Other" bucket the contract defines —
 * the tile is disabled-with-reason anyway, so the label never has to explain
 * something the app cannot do.
 */

export function kindLabelKey(kind: string): string {
	return KNOWN_KINDS.some((known) => known === kind)
		? `pos_checkout.kind_${kind}`
		: 'pos_checkout.kind_other';
}

const STATUS_KEYS: Record<PaymentRow['status'], string> = {
	pending: 'pos_checkout.status_pending',
	authorized: 'pos_checkout.status_authorized',
	captured: 'pos_checkout.status_captured',
	failed: 'pos_checkout.status_failed',
	voided: 'pos_checkout.status_voided',
};

export function statusLabelKey(status: PaymentRow['status']): string {
	return STATUS_KEYS[status] ?? 'pos_checkout.status_pending';
}

/** Colour the chip by what the cashier has to do about the row, not by the wire value. */
export function statusVariant(status: PaymentRow['status']) {
	if (status === 'captured' || status === 'authorized') return 'success' as const;
	if (status === 'failed' || status === 'voided') return 'error' as const;
	return 'info' as const;
}

/**
 * The line under a disabled tile. `unsupported_mode` names the method because
 * the cashier's next step is to update the app for THAT gateway; the other two
 * are conditions of the till, so they read as statements about the tile.
 */
export function disabledReasonKey(reason: TileDisabledReason): string {
	if (typeof reason === 'object') return 'pos_checkout.reader_in_use';
	switch (reason) {
		case 'unsupported_mode':
			return 'pos_checkout.update_app_to_use';
		case 'no_driver':
			return 'pos_checkout.update_app_to_use';
		case 'driver_web':
		case 'driver_permission':
		case 'driver_bluetooth_off':
		case 'driver_not_logged_in':
			return `pos_checkout.${reason}`;
		case 'no_readers':
			return 'pos_checkout.no_readers_set_up';
		case 'offline':
			return 'pos_checkout.needs_a_connection';
	}
}

const FAILURE_KEYS: Record<string, string> = {
	reader_session_lost: 'pos_checkout.reader_session_lost',
	card_declined: 'pos_checkout.reason_card_declined',
	expired: 'pos_checkout.reason_expired',
	cancelled: 'pos_checkout.reason_cancelled',
	// A provider that reports a declined card and a cancel on the reader identically (SumUp:
	// both are FAILED with no reason) must not be read back to the cashier as a cancel.
	declined_or_cancelled: 'pos_checkout.reason_declined_or_cancelled',
	not_found: 'pos_checkout.reason_not_found',
	amount_mismatch: 'pos_checkout.reason_amount_mismatch',
	// The leg's own reason for a 4xx that carried no code (a proxy answering for the store).
	refused: 'pos_checkout.reason_refused',
};
export function failureReasonLabel(reason: string | null, t: (key: string) => string): string {
	return reason && FAILURE_KEYS[reason] ? t(FAILURE_KEYS[reason]) : (reason ?? '');
}

export type EventTone = 'ok' | 'muted' | 'void' | 'warning' | 'error';
export interface EventLine {
	/** Cashier wording; the wire message when the catalogue has no entry for it. */
	text: string;
	tone: EventTone;
	/** The ids the message carried, kept out of the wording and shown in mono under it. */
	detail: string | null;
}
type Translate = (key: string, values?: Record<string, unknown>) => string;
interface EventContext {
	readerLabel: string;
	failureReason: string | null;
	/** Formats a wire amount such as "1.00 EUR"; null leaves it as written. */
	formatAmount?: (amount: string, currency: string) => string | null;
}
/**
 * The wire → words catalogue for the terminal log. Pro's Event_Log and the leg
 * controllers write operator messages with ids in them; the cashier reads one line
 * under the stepper, so every message that reaches the screen is rewritten here and
 * its ids move to the detail line. An unknown message falls through unchanged at the
 * event's own level — a new provider line is never hidden, only unpolished.
 */
export function describeEvent(
	event: { message: string; level: 'info' | 'warning' | 'error' },
	t: Translate,
	context: EventContext
): EventLine {
	const { message } = event;
	const tone: EventTone =
		event.level === 'error' ? 'error' : event.level === 'warning' ? 'warning' : 'ok';
	const line = (text: string, lineTone: EventTone = tone, detail: string | null = null) => ({
		text,
		tone: lineTone,
		detail,
	});
	let match: RegExpMatchArray | null;
	if ((match = message.match(/^Reader action (\S+) created on (\S+)$/)))
		return line(t('pos_checkout.event_sent_to', { reader: context.readerLabel }), 'ok', match[1]);
	if ((match = message.match(/^Payment intent (\S+) created$/)))
		return line(t('pos_checkout.event_sent_to', { reader: context.readerLabel }), 'ok', match[1]);
	if (/^Reader action (pending|in_progress)$/.test(message))
		return line(t('pos_checkout.event_on_terminal'), 'ok');
	if ((match = message.match(/^Approved (\S+) (\S+)$/)))
		return line(
			t('pos_checkout.event_approved', {
				amount: context.formatAmount?.(match[1], match[2]) ?? `${match[1]} ${match[2]}`,
			}),
			'ok'
		);
	if (
		/^Reader action voided(: .*)?$/.test(message) ||
		/^Payment intent voided(: .*)?$/.test(message)
	)
		return line(t('pos_checkout.event_terminal_confirmed_cancel'), 'muted');
	if (message === 'Reader action cancelled')
		return line(failureReasonLabel(context.failureReason ?? 'cancelled', t), 'error');
	if ((match = message.match(/^Reader action failed: (.+)$/)))
		return line(failureReasonLabel(match[1], t), 'error');
	if (message === 'Cancel requested by cashier' || message === 'Cancel requested: cashier')
		return line(t('pos_checkout.event_cancelled_from_till'), 'void');
	if (message === 'Deadline reached' || message === 'Cancel requested: expired')
		return line(t('pos_checkout.event_timed_out'), 'void');
	if ((match = message.match(/^Cancel requested: (.+)$/)))
		return line(t('pos_checkout.event_cancel_requested'), 'void', match[1]);
	if ((match = message.match(/^Capture failed: (.+)$/)))
		return line(
			t('pos_checkout.capture_failed', { reason: failureReasonLabel(match[1], t) }),
			'error'
		);
	if ((match = message.match(/^Ignored stale (\S+) after (\S+)$/)))
		return line(t('pos_checkout.event_late_update_ignored'), 'muted', `${match[1]} → ${match[2]}`);
	if (message === 'Connection unstable')
		return line(t('pos_checkout.event_connection_unstable'), 'warning');
	if (message === 'Leg released') return line(t('pos_checkout.event_released'), 'warning');
	if (message === 'Reader session was lost')
		return line(t('pos_checkout.reader_session_lost'), 'error');
	if (/^Offline leg recorded/.test(message))
		return line(t('pos_checkout.event_recorded_offline'), 'ok');
	return line(message);
}

/** The leg normalizes provider errors to their detail code; other errors retain wcpos_* or mirror_failed. */
export function providerErrorMessage(
	error: { code: string; message: string } | null
): string | null {
	return error &&
		(error.code === 'wcpos_provider_error' ||
			(!error.code.startsWith('wcpos_') && error.code !== 'mirror_failed'))
		? error.message
		: null;
}
