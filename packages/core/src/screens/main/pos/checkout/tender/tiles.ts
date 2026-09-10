import { KNOWN_CAPTURE_MODES, type PaymentMethodDescriptor } from '@wcpos/order-math';
/** Why a tile cannot be tapped. The UI turns each into a cashier-facing line. */
export type TileDisabledReason =
	/** The descriptor names a capture mode this build has never heard of. */
	| 'unsupported_mode'
	/** A known mode whose driver has not shipped yet: device, stored_value. */
	| 'no_driver'
	/** The method needs the network and the till is offline. */
	| 'offline'
	| 'no_readers'
	| { type: 'reader_in_use'; number: string };

type ReadersInUse = ReadonlyMap<string, { orderUuid: string; orderNumber: string }>;
export function selectableReaders(
	method: PaymentMethodDescriptor | null,
	readersInUse: ReadersInUse = new Map(),
	currentOrderUuid?: string
) {
	const hardware = method?.capture.hardware;
	const lockToDefault = Boolean(
		method?.capture.mode === 'server' &&
		hardware &&
		'readers' in hardware &&
		hardware.lock_to_default
	);
	const readers =
		method?.capture.mode === 'server' && hardware && 'readers' in hardware
			? hardware.readers
					.filter(
						(reader) =>
							reader.status === 'online' &&
							(!lockToDefault || reader.id === hardware.default_reader)
					)
					.map((reader) => {
						const holder = readersInUse.get(reader.id);
						return {
							id: reader.id,
							label: reader.label,
							isDefault: reader.id === hardware.default_reader || reader.default,
							inUseBy: holder && holder.orderUuid !== currentOrderUuid ? holder.orderNumber : null,
						};
					})
			: [];
	return { readers, lockToDefault };
}

/** The till's last confirmed choice wins unless the store has locked its default. */
export function initialReaderId(
	readers: readonly ReturnType<typeof selectableReaders>['readers'][number][],
	lockToDefault: boolean,
	remembered: string | null
): string | null {
	if (lockToDefault) return readers.find((reader) => reader.isDefault)?.id ?? null;
	return (
		readers.find((reader) => reader.id === remembered && reader.inUseBy === null)?.id ??
		readers.find((reader) => reader.isDefault && reader.inUseBy === null)?.id ??
		null
	);
}

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
	options: { online: boolean; readersInUse?: ReadersInUse; currentOrderUuid?: string }
): TenderTile[] {
	return methods
		.filter((method) => method.pos_enabled && method.capture.mode !== 'webview')
		.sort(byOrderThenTitle)
		.map((method) => {
			let reason: TileDisabledReason | null = null;
			if (!KNOWN_CAPTURE_MODES.some((mode) => mode === method.capture.mode)) {
				reason = 'unsupported_mode';
			} else if (method.capture.mode === 'device' || method.capture.mode === 'stored_value') {
				reason = 'no_driver';
			} else if (method.capture.mode === 'server') {
				const { readers } = selectableReaders(
					method,
					options.readersInUse,
					options.currentOrderUuid
				);
				if (!options.online) reason = 'offline';
				else if (!readers.length) reason = 'no_readers';
				else if (readers.every((reader) => reader.inUseBy !== null))
					reason = { type: 'reader_in_use', number: readers[0].inUseBy! };
			} else if (!options.online && method.capabilities.offline === 'none') {
				reason = 'offline';
			}
			return {
				method,
				disabled: reason !== null,
				reason,
				worksOffline: method.capture.mode !== 'server' && method.capabilities.offline === 'record',
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
