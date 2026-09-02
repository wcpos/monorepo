import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import {
	getSlotEntries,
	getSlotEntryComponent,
	subscribeSlotRegistry,
	type ReadonlyView,
	type SlotContracts,
	type SlotEntryDescriptor,
	type SlotId,
} from './registry';

export type SlotRenderedEntry = {
	descriptor: SlotEntryDescriptor;
	element: React.ReactNode;
};

/**
 * A slot may hand every entry the same view, or resolve one per entry. The resolver form
 * exists because a host can place the same entry kind in different positions —
 * `pos.columns.panel` tells each panel which side it ended up on — and that is host
 * knowledge the registry has no way to supply.
 */
type SlotData<S extends SlotId> =
	| ReadonlyView<SlotContracts[S]['value']>
	| ((
			entry: SlotEntryDescriptor,
			index: number,
			total: number
	  ) => ReadonlyView<SlotContracts[S]['value']>);

/**
 * The host side of the slot contract. Renders every registered entry, each in its own
 * `ErrorBoundary` + `Suspense`, so one broken entry cannot take the slot — or the screen
 * around it — down.
 */
export function Slot<S extends SlotId>({
	id,
	data,
	api,
	children,
}: {
	id: S;
	data: SlotData<S>;
	api: SlotContracts[S]['api'];
	children?: (entries: SlotRenderedEntry[]) => React.ReactNode;
}) {
	const getSnapshot = React.useCallback(() => getSlotEntries(id), [id]);
	const descriptors = React.useSyncExternalStore(subscribeSlotRegistry, getSnapshot, getSnapshot);

	const entries = React.useMemo<SlotRenderedEntry[]>(
		() =>
			descriptors.map((descriptor, index) => {
				const Component = getSlotEntryComponent(id, descriptor.id);
				const view =
					typeof data === 'function' ? data(descriptor, index, descriptors.length) : data;
				return {
					descriptor,
					element: Component ? (
						<ErrorBoundary>
							<Suspense>
								<Component data={view} api={api} entry={descriptor} />
							</Suspense>
						</ErrorBoundary>
					) : null,
				};
			}),
		[api, data, descriptors, id]
	);

	if (entries.length === 0) return null;
	if (children) return <>{children(entries)}</>;
	return (
		<>
			{entries.map((entry) => (
				<React.Fragment key={entry.descriptor.id}>{entry.element}</React.Fragment>
			))}
		</>
	);
}

/**
 * Adapt a `{ getState, subscribe }` store into a `ReadonlyView`, projecting the slice the
 * contract promises. The projection is cached against the source state's identity so
 * repeated reads return the same object — `useSyncExternalStore` requires that.
 */
export function createReadonlyView<S, T = S>(
	store: { getState(): S; subscribe(listener: () => void): () => void },
	select: (state: S) => T = (state) => state as unknown as T
): ReadonlyView<T> {
	let source: S | undefined;
	let projected: T;
	let primed = false;
	return {
		get value() {
			const state = store.getState();
			if (!primed || source !== state) {
				source = state;
				projected = select(state);
				primed = true;
			}
			return projected as Readonly<T>;
		},
		subscribe: (listener) => store.subscribe(listener),
	};
}

/** `createReadonlyView` for hosts that hold the getter and subscriber separately. */
export function useReadonlyView<T>(
	getValue: () => T,
	subscribe: (listener: () => void) => () => void
): ReadonlyView<T> {
	return React.useMemo(
		() => createReadonlyView({ getState: getValue, subscribe }),
		[getValue, subscribe]
	);
}

/** For entry components: read a view's value and re-render when it changes. */
export function useSlotValue<T>(view: ReadonlyView<T>): Readonly<T> {
	const getSnapshot = React.useCallback(() => view.value, [view]);
	return React.useSyncExternalStore(view.subscribe, getSnapshot, getSnapshot);
}
