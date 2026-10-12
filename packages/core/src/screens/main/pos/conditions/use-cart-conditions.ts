import * as React from 'react';

import isEqual from 'lodash/isEqual';
import { useObservableState } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';

import {
	engineCollection,
	observeEngineDatabases,
	useDocField,
	useQueryRuntime,
	useRecordField,
} from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { conditionRules, type UnmetCondition } from './evaluate';
import { countConditionsInSlot } from './snapshot';
import { useStoreSession } from '../../../../contexts/app-state';
import { readStockDocument } from '../hooks/read-stock-document';
import { type CurrentOrderRecord, useCurrentOrder } from '../contexts/current-order/context';

const NONE: UnmetCondition[] = [];
const inIds = (ids: (number | null | undefined)[]) => ({
	remoteId: {
		$in: [...new Set(ids)].map((id) => remoteIdOrNull(id ?? 0)).filter((id) => id !== null),
	},
});

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
			readStockDocument(runtime, kind === 'product' ? 'products' : 'variations', id);
		const count = () => countConditionsInSlot(order, { read: { catalog } }, rules);
		return observeEngineDatabases(runtime.engine).pipe(
			switchMap((database) => {
				const products = engineCollection(database, 'products');
				const variations = engineCollection(database, 'variations');
				return products && variations
					? combineLatest([
							products.find({ selector: inIds(items.map((line) => line.product_id)) }).$,
							variations.find({ selector: inIds(items.map((line) => line.variation_id)) }).$,
						]).pipe(switchMap(count))
					: of(NONE);
			}),
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

/** The quantity cells register here, so the notice and a blocked Pay can reach a mounted line. */
const lines = new Map<string, { scroll: () => void; openQuantity: () => void }>();

/** A quantity input's ref: registers the line while it is mounted (a React 19 ref cleanup). */
export function lineFocusRef(uuid: string, scroll: () => void) {
	return (input: { focus: () => void } | null) => {
		if (!input) return;
		const focus = { scroll, openQuantity: () => input.focus() };
		lines.set(uuid, focus);
		return () => void (lines.get(uuid) === focus && lines.delete(uuid));
	};
}
export const scrollToLine = (uuid: string) => lines.get(uuid)?.scroll();
export function openLineQuantity(uuid: string) {
	lines.get(uuid)?.scroll();
	lines.get(uuid)?.openQuantity();
}
