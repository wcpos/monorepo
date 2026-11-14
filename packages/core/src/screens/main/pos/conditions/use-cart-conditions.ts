import * as React from 'react';

import isEqual from 'lodash/isEqual';
import { useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';

import {
	observeCatalogByWooIds,
	readStockPayload,
	useDocField,
	useQueryRuntime,
	useRecordField,
} from '@wcpos/query';

import { conditionRules, type UnmetCondition } from './evaluate';
import { countConditionsInSlot } from './snapshot';
import { useStoreSession } from '../../../../contexts/app-state';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order/context';

const NONE: UnmetCondition[] = [];
/** Re-judged when the lines or the catalog records they name move; idle with overselling allowed. */
export function useCartConditions(order: CurrentOrderRecord | undefined): {
	unmet: UnmetCondition[];
} {
	const runtime = useQueryRuntime();
	const { store } = useStoreSession();
	const preventOverselling = useDocField(store, (value) => value.prevent_overselling) === true;
	const lineItems = useRecordField(order, (value) => value.payload.line_items);
	const unmet$ = React.useMemo(() => {
		const items = lineItems ?? [];
		const rules = conditionRules(preventOverselling);
		if (!preventOverselling || !order || items.length === 0) return of(NONE);
		const catalog = (kind: 'product' | 'variation', id: number) =>
			readStockPayload(runtime.engine, kind === 'product' ? 'products' : 'variations', id);
		const count = () => countConditionsInSlot(order, { read: { catalog } }, rules);
		return observeCatalogByWooIds(runtime.engine, {
			productIds: items.map((line) => line.product_id),
			variationIds: items.map((line) => line.variation_id),
		}).pipe(
			switchMap(({ available }) => (available ? count() : of(NONE))),
			distinctUntilChanged(isEqual)
		);
	}, [runtime, preventOverselling, lineItems, order]);
	return { unmet: useObservableState(unmet$, NONE) };
}

const CartConditionsContext = React.createContext<UnmetCondition[]>(NONE);

/** Judged once per cart, on the current order; the notice, the line marks and Pay read it. */
export function CartConditionsProvider({ children }: { children: React.ReactNode }) {
	const value = useCartConditions(useCurrentOrder().currentOrderRecord).unmet;
	return React.createElement(CartConditionsContext.Provider, { value }, children);
}

/** The cart's unmet conditions, in line order; empty outside a cart. */
export const useCartUnmet = () => React.useContext(CartConditionsContext);

// How the notice and Pay reach a line: the name cell (always shown) registers `scroll`, the
// quantity keypad (a column the merchant may hide) `openQuantity`, each only while mounted.
type Part = 'scroll' | 'openQuantity';
const lines = new Map<string, Partial<Record<Part, () => void>>>();
export function lineRef<T>(uuid: string, part: Part, act: (node: T) => void) {
	let run: (() => void) | undefined; // null on detach: merged host refs drop a ref's cleanup
	return (node: T | null) => {
		if (run && lines.get(uuid)?.[part] === run) delete lines.get(uuid)![part];
		run = node ? () => act(node) : undefined;
		if (run) lines.set(uuid, { ...lines.get(uuid), [part]: run });
	};
}
export const scrollToLine = (uuid: string) => lines.get(uuid)?.scroll?.();
export function openLineQuantity(uuid: string) {
	scrollToLine(uuid);
	lines.get(uuid)?.openQuantity?.();
}
