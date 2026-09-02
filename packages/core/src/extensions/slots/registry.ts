import type * as React from 'react';

import type { FiltersOf } from '../../query/query-state-types';

/**
 * The contract version every descriptor is stamped with. It is a single number, not a
 * per-slot one, because v1 is a first-party dogfood: everything registered here ships in
 * the same bundle as the host. It exists so the first out-of-bundle consumer has a version
 * to negotiate against instead of a shape to guess at.
 */
export const SLOT_API_VERSION = 1;

/**
 * The closed set of slots. A slot id reads `<screen>.<region>.<entry kind>` with the entry
 * kind LAST, and the map is keyed by that id so a registration infers its own contract
 * from the key it registers under.
 *
 * `value` is the readonly data an entry sees; `api` is the enumerated set of methods it may
 * call. Both are plain and JSON-serializable — never an RxDB collection, document or query.
 */
export interface SlotContracts {
	'pos.columns.panel': { value: { side: 'left' | 'right'; isColumn: boolean }; api: Record<string, never> };
	'pos.products.filter-bar.item': {
		value: { search: string; filters: FiltersOf<'products'> };
		api: {
			setFilter<F extends keyof FiltersOf<'products'>>(
				field: F,
				value: FiltersOf<'products'>[F]
			): Promise<void>;
			clearFilter(field: keyof FiltersOf<'products'>): Promise<void>;
			resetFilters(): Promise<void>;
			setSearch(term: string): Promise<void>;
		};
	};
}

export type SlotId = keyof SlotContracts;

/**
 * What the host knows about an entry without rendering it. Plain data by rule: the
 * descriptor is the part of a registration that could one day cross a process or bundle
 * boundary, so it must survive `JSON.stringify` unchanged.
 */
export type SlotEntryDescriptor = {
	id: string;
	slot: SlotId;
	order: number;
	title: string;
	capabilities: readonly string[];
	slotApiVersion: number;
};

/** A readonly, subscribable window onto host state. The only data channel into an entry. */
export type ReadonlyView<T> = {
	readonly value: Readonly<T>;
	subscribe(listener: () => void): () => void;
};

export type SlotEntryProps<S extends SlotId> = {
	data: ReadonlyView<SlotContracts[S]['value']>;
	api: SlotContracts[S]['api'];
	entry: SlotEntryDescriptor;
};

export type SlotEntryRegistration<S extends SlotId> = Omit<
	SlotEntryDescriptor,
	'slot' | 'slotApiVersion'
> & {
	slot: S;
	/** Defaults to the current `SLOT_API_VERSION`. */
	slotApiVersion?: number;
	component: React.ComponentType<SlotEntryProps<S>>;
};

type Registration = {
	descriptor: SlotEntryDescriptor;
	component: React.ComponentType<SlotEntryProps<SlotId>>;
};

/**
 * Module-level and static: entries register at import time, so there is no provider to
 * mount, no ordering hazard between registration and render, and the whole registry is
 * inspectable from a test without React.
 */
const entriesBySlot = new Map<SlotId, Map<string, Registration>>();
const snapshots = new Map<SlotId, readonly SlotEntryDescriptor[]>();
const listeners = new Set<() => void>();

const EMPTY: readonly SlotEntryDescriptor[] = [];

function invalidate(slot: SlotId) {
	snapshots.delete(slot);
	listeners.forEach((listener) => listener());
}

export function registerSlotEntry<S extends SlotId>({
	component,
	slotApiVersion = SLOT_API_VERSION,
	...descriptor
}: SlotEntryRegistration<S>): void {
	const slot = descriptor.slot;
	let slotEntries = entriesBySlot.get(slot);
	if (!slotEntries) {
		slotEntries = new Map();
		entriesBySlot.set(slot, slotEntries);
	}
	if (slotEntries.has(descriptor.id) && process.env.NODE_ENV !== 'production') {
		// Replace rather than throw: a Fast Refresh re-evaluates the registering module, and
		// so does every test that imports it. Throwing would make both of those fatal.
		console.warn(`Slot entry "${descriptor.id}" re-registered in slot "${slot}" — replacing.`);
	}
	slotEntries.set(descriptor.id, {
		descriptor: { ...descriptor, slotApiVersion },
		component: component as React.ComponentType<SlotEntryProps<SlotId>>,
	});
	invalidate(slot);
}

/** Descriptors for a slot, ordered by `order` then `id`. Stable across calls until a registration changes. */
export function getSlotEntries(slot: SlotId): readonly SlotEntryDescriptor[] {
	const cached = snapshots.get(slot);
	if (cached) return cached;
	const slotEntries = entriesBySlot.get(slot);
	if (!slotEntries || slotEntries.size === 0) return EMPTY;
	const sorted = [...slotEntries.values()]
		.map((entry) => entry.descriptor)
		.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
	snapshots.set(slot, sorted);
	return sorted;
}

export function getSlotEntryComponent<S extends SlotId>(
	slot: S,
	id: string
): React.ComponentType<SlotEntryProps<S>> | undefined {
	return entriesBySlot.get(slot)?.get(id)?.component as
		| React.ComponentType<SlotEntryProps<S>>
		| undefined;
}

/** Subscribe to registrations so a host re-renders when an entry arrives late. */
export function subscribeSlotRegistry(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/** Test-only escape hatch: drop every registration. */
export function resetSlotRegistry(): void {
	const slots = [...entriesBySlot.keys()];
	entriesBySlot.clear();
	snapshots.clear();
	slots.forEach((slot) => invalidate(slot));
}
