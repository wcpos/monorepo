import * as React from 'react';

import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

import { useAppState } from '../../../../contexts/app-state';
import { useAppInfo } from '../../../../hooks/use-app-info';

import type { TemplateDocument } from '@wcpos/database';

/**
 * Returns active receipt templates for the current store.
 *
 * Pro + store has active_templates: returns only those templates, in assigned sort order.
 * Otherwise: returns all published + virtual templates, sorted by menu_order.
 */
export function useActiveTemplates(): TemplateDocument[] {
	const { store, storeDB } = useAppState();
	const { license } = useAppInfo();
	const isPro = !!license?.isPro;

	// Read per-store template assignments (will be empty until store schema v5)
	const activeTemplates = useObservableEagerState(
		store.active_templates$ ?? of([] as Array<{ template_id: string | number; sort_order: number }>)
	);

	// Query all receipt templates from RxDB
	const query = React.useMemo(() => {
		return storeDB.templates.find({
			selector: { type: 'receipt' },
			sort: [{ menu_order: 'asc' }],
		});
	}, [storeDB]);

	const allTemplates = useObservableState(
		query.$.pipe(map((docs) => docs.filter((doc) => doc.is_virtual || doc.status === 'publish'))),
		[]
	);

	// Apply per-store filtering for Pro users
	return React.useMemo(() => {
		if (!isPro || !activeTemplates || activeTemplates.length === 0) {
			return allTemplates;
		}

		const assignmentMap = new Map(
			activeTemplates.map((a) => [String(a.template_id), a.sort_order])
		);

		const filtered = allTemplates
			.filter((t) => assignmentMap.has(String(t.id)))
			.sort((a, b) => {
				const orderA = assignmentMap.get(String(a.id)) ?? 0;
				const orderB = assignmentMap.get(String(b.id)) ?? 0;
				return orderA - orderB;
			});

		return filtered.length > 0 ? filtered : allTemplates;
	}, [isPro, activeTemplates, allTemplates]);
}
