import * as React from 'react';

import { filter } from 'rxjs';
import { format } from 'date-fns/format';
import { useObservableState } from 'observable-hooks';

import { observeCredentialStores, PENDING_USER_DB_READ } from '@wcpos/query/user-db';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useLocalDate } from '../../../../hooks/use-local-date';
import { useStoreDay, zoneOptions } from '../../../../hooks/use-store-day';
import { useQueryHandleFields, useQueryState } from '../../../../query';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import { useReceiptDocument } from '../../receipt/use-receipt-document';
import { useReportsHandles, useReportsPeriod } from '../context';
import { periodLabel } from '../date-button';
import { useReportFormats } from '../use-report-formats';
import { buildReportDocument } from './document';
import { usePrintWaiting } from './use-print-waiting';

import type { PanelSpec } from './specs';

/**
 * One report's print, shared by the hero and the detail panels: the `report` document built from
 * the spec in the viewed scope, the line saying why Print waits, and the print with its failure
 * line. Rendering the sheet stays with the surface.
 */
export function useReportPrint({
	key,
	title,
	spec,
	scope = [],
	dataReady,
	needsRefunds,
}: {
	key: string;
	title: string;
	spec: PanelSpec;
	/** What the printed scope adds after the period and register (cashier, status, filters). */
	scope?: (string | undefined)[];
	dataReady: boolean;
	needsRefunds: boolean;
}) {
	const t = useT();
	const { dateRange, storeId, timezone } = useReportsPeriod();
	const formats = useReportFormats(storeId);
	const { presets } = useStoreDay(storeId),
		{ formatDate } = useLocalDate();
	const days = {
		from: format(dateRange.start, 'yyyy-MM-dd', zoneOptions(timezone)),
		to: format(dateRange.end, 'yyyy-MM-dd', zoneOptions(timezone)),
	};
	const { text: period } = periodLabel({ scope: days, timezone, ranges: presets(), t, formatDate });
	const { register: registerId, store: storeFilter } = useQueryState<'orders'>().filters;
	const names = useRegisterNames(storeId),
		binding = useRegisterBinding();
	const { wpCredentials } = useStoreSession();
	const storesSource = React.useMemo(
		() =>
			observeCredentialStores(wpCredentials).pipe(
				filter((value) => value !== PENDING_USER_DB_READ)
			),
		[wpCredentials]
	);
	const storeDirectory = useObservableState(storesSource);
	// The sentinel is also a single-store install's own scope (store 0); All stores needs stores to choose from.
	const allStores = storeFilter === 'woocommerce-pos' && (storeDirectory?.length ?? 0) > 1;
	const register = allStores
		? t('reports.all_stores')
		: registerId
			? names[registerId] ||
				(binding.registerId === registerId ? binding.registerName : '') ||
				t('common.unknown')
			: t('reports.all_registers');
	const scopeLine = t('reports.panel_scope', { period, register });
	const label = [scopeLine, ...scope].filter(Boolean).join(' · ');
	const [generatedAt] = React.useState(() => new Date().toISOString());
	const [printError, setPrintError] = React.useState('');
	const context = useClosureDocumentContext(storeId);
	const doc = useReceiptDocument({
		autoPrintAllowed: false,
		templateType: 'report',
		storeId,
		localReport: buildReportDocument(
			spec,
			{
				key,
				title,
				label,
				storeId: storeId ?? 0,
				registerId: registerId ?? '',
				registerName: register,
				from: dateRange.start.toISOString(),
				to: dateRange.end.toISOString(),
				generatedAt,
			},
			context
		),
	});
	// A range still arriving over ranged sync passes is a partial set (see ReportsSyncProgress):
	// the document would claim a whole period it does not hold, so Print waits for the lane.
	// Ready-gated, as the progress line: a read that has not answered reports no lane.
	const { handle: salesHandle, refundsHandle } = useReportsHandles();
	const sales = useQueryHandleFields(salesHandle, ['laneProgress']);
	const refunds = useQueryHandleFields(refundsHandle, ['laneProgress']);
	const { waiting, label: waitingLabel } = usePrintWaiting({
		doc,
		storeReady: !!formats.store,
		dataReady,
		salesLane: sales.ready && !!sales.laneProgress,
		refundsLane: refunds.ready && !!refunds.laneProgress,
		needsRefunds,
	});
	const print = async () => {
		setPrintError('');
		try {
			if ((await doc.print()) === false) setPrintError(t('reports.print_failed'));
		} catch {
			setPrintError(t('reports.print_failed'));
		}
	};
	return {
		doc,
		/** Why Print waits, or null when it can print. */
		waiting: waiting ? waitingLabel : null,
		print,
		error: printError || doc.documentError?.message || null,
		/** The period and register: the sheet's description. */
		scopeLine,
		/** The scope line and its additions, as the document prints it. */
		label,
	};
}
