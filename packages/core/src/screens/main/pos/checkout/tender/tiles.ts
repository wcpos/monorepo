import { KNOWN_CAPTURE_MODES, type PaymentMethodDescriptor } from '@wcpos/order-math';
/** Why a tile cannot be tapped. The UI turns each into a cashier-facing line. */
export type TileDisabledReason =
	/** The descriptor names a capture mode this build has never heard of. */
	| 'unsupported_mode'
	/** A known mode whose driver has not shipped yet: device, server, stored_value. */
	| 'no_driver'
	/** The method needs the network and the till is offline. */
	| 'offline';

export interface TenderTile {
	method: PaymentMethodDescriptor;
	disabled: boolean;
	reason: TileDisabledReason | null;
	/** capabilities.offline === 'record' — the tile carries a "works offline" flag. */
	worksOffline: boolean;
}
/** The order the POS settings page assigns, then title, so the grid never reshuffles itself. */
function byOrderThenTitle(left: PaymentMethodDescriptor, right: PaymentMethodDescriptor): number {
	if (left.order !== right.order) return left.order - right.order;
	return left.title < right.title ? -1 : left.title > right.title ? 1 : 0;
}

export function buildTenderTiles(
	methods: readonly PaymentMethodDescriptor[],
	options: { online: boolean }
): TenderTile[] {
	return methods
		.filter((method) => method.pos_enabled && method.capture.mode !== 'webview')
		.sort(byOrderThenTitle)
		.map((method) => {
			let reason: TileDisabledReason | null = null;
			if (!KNOWN_CAPTURE_MODES.some((mode) => mode === method.capture.mode)) {
				reason = 'unsupported_mode';
			} else if (
				method.capture.mode === 'device' ||
				method.capture.mode === 'server' ||
				method.capture.mode === 'stored_value'
			) {
				reason = 'no_driver';
			} else if (!options.online && method.capabilities.offline === 'none') {
				reason = 'offline';
			}
			return {
				method,
				disabled: reason !== null,
				reason,
				worksOffline: method.capabilities.offline === 'record',
			};
		});
}
/** The methods the Legacy tab offers: webview mode or a declared webview fallback. */
export function legacyPaymentMethods(
	methods: readonly PaymentMethodDescriptor[]
): PaymentMethodDescriptor[] {
	return methods
		.filter(
			(method) =>
				method.pos_enabled &&
				(method.capture.mode === 'webview' || method.capture.webview_available)
		)
		.sort(byOrderThenTitle);
}
