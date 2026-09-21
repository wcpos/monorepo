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
	not_found: 'pos_checkout.reason_not_found',
	amount_mismatch: 'pos_checkout.reason_amount_mismatch',
};
export function failureReasonLabel(reason: string | null, t: (key: string) => string): string {
	return reason && FAILURE_KEYS[reason] ? t(FAILURE_KEYS[reason]) : (reason ?? '');
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
