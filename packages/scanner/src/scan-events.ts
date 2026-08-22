import { EMPTY, Observable, Subject } from 'rxjs';

/**
 * The normalized scan event every input source emits (architecture: wcpos/monorepo#715).
 * Structured sources (serial, HID-POS, camera) bypass the wedge timing heuristic
 * and construct these directly; the wedge detector wraps its emissions in one.
 */
export type ScanSourceKind = 'wedge' | 'wedge-attributed' | 'serial' | 'hid-pos' | 'ble' | 'camera';

export interface ScanSource {
	kind: ScanSourceKind;
	/** Scanner profile id for explicitly-configured sources. */
	profileId?: string;
	/** Human-readable device name where the platform provides one. */
	deviceName?: string;
}

export interface ScanEvent {
	code: string;
	/** Symbology where the source knows it (HID-POS reports, camera decoders). */
	symbology?: string;
	source: ScanSource;
	timestamp: number;
}

export interface ScanBus {
	emit: (event: ScanEvent) => void;
	/**
	 * The routed stream consumers subscribe to. v1 has a single product route —
	 * every event flows through; prefix-based routing (customer cards, embedded
	 * barcodes) plugs in here as upstream filters when those features land.
	 */
	events$: Observable<ScanEvent>;
}

export interface ScanHub {
	/** All scan events from every registered source, hot and multicast. */
	readonly events$: Observable<ScanEvent>;
	/** Register a source and return a function that unregisters it. */
	registerSource(source$: Observable<ScanEvent>): () => void;
	/** Emit from a push-style producer such as the camera decoder. */
	emit(event: ScanEvent): void;
}

export const inertScanHub: ScanHub = {
	events$: EMPTY,
	registerSource: () => () => undefined,
	emit: () => undefined,
};

export function createScanHub(): ScanHub {
	const subject = new Subject<ScanEvent>();
	return {
		events$: subject.asObservable(),
		registerSource: (source$) => {
			// A failing source must not take down the shared channel: scanning from
			// every other registered source keeps working; the errored source is
			// simply dropped (its owner is responsible for reconnect/retry).
			const subscription = source$.subscribe({
				next: (event) => subject.next(event),
				error: () => undefined,
			});
			return () => subscription.unsubscribe();
		},
		emit: (event) => subject.next(event),
	};
}

/**
 * A scan bus is scoped to its consumer surface (e.g. the POS products screen
 * wires its input sources into one bus) — deliberately not a global singleton,
 * so the settings test panel's captures never leak into the POS cart.
 */
export function createScanBus(): ScanBus {
	const subject = new Subject<ScanEvent>();
	return {
		emit: (event) => subject.next(event),
		events$: subject.asObservable(),
	};
}
