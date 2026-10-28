import * as React from 'react';
import { ScrollView, View } from 'react-native';

import get from 'lodash/get';

import { Button } from '@wcpos/components/button';
import { DialogFooter, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import {
	CLOSURE_DOCUMENT_LIMIT,
	type ClosureRow,
	readClosure,
	setClosureReceiptSnapshot,
} from '@wcpos/query/register-session';
import { log } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../contexts/app-state';
import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { buildClosureDocument } from '../../../../services/register-session/closure-document';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import {
	type Correction,
	deriveSettled,
	type RecordedFigures,
} from '../../../../services/register-session/settled-figures';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { RecountSheet } from './recount-sheet';
import { ReportPanel } from '../report-panel';
import { ReceiptBody } from '../../receipt/receipt-body';
import { TemplateSwitcher } from '../../receipt/template-switcher';
import { PrinterSwitcher } from '../../receipt/printer-switcher';
import { useReceiptDocument } from '../../receipt/use-receipt-document';

export function ClosurePanel({
	row,
	onClose,
	onRecountSaved,
}: {
	row: ClosureRow;
	onClose: () => void;
	onRecountSaved?: () => void;
}) {
	const t = useT();
	const http = useRestHttpClient();
	const [recounting, setRecounting] = React.useState(false);
	const [error, setError] = React.useState('');
	const { screenSize } = useTheme();
	const phone = screenSize === 'sm';
	const context = useClosureDocumentContext(row.store_id ?? 0);
	const { storeDB } = useStoreSession();
	const getLocalClosure = React.useCallback(
		() => readClosure(storeDB, { id: row.id, serverClosureId: row.server_closure_id ?? row.id }),
		[storeDB, row.id, row.server_closure_id]
	);
	const local = React.useMemo(
		() =>
			row.receipt_snapshot ? (JSON.parse(row.receipt_snapshot) as Record<string, unknown>) : null,
		[row.receipt_snapshot]
	);
	const doc = useReceiptDocument({
		autoPrintAllowed: false,
		isReprint: true,
		getLocalClosure,
		document: `closure:${row.server_closure_id ?? row.id}`,
		documentReady: row.sync_status === 'synced' || row.sync_status === 'superseded',
		templateType: 'closure',
		storeId: row.store_id ?? 0,
		localReport: local ?? buildClosureDocument(row, context),
	});
	const remote = doc.serverReceiptData;
	const persistSnapshot = React.useCallback(
		async (document: Record<string, unknown>) => {
			const receipt_snapshot = JSON.stringify(document);
			if (receipt_snapshot.length > CLOSURE_DOCUMENT_LIMIT) {
				log.warn('Closure document too large for offline history');
				return;
			}
			if (receipt_snapshot === row.receipt_snapshot) return;
			const record = await getLocalClosure();
			if (record) await setClosureReceiptSnapshot(storeDB, record.id, receipt_snapshot);
		},
		[getLocalClosure, storeDB, row.receipt_snapshot]
	);
	// Retain the authoritative baseline WITH its corrections, without touching the frozen/outbox fields.
	React.useEffect(() => {
		if (!remote) return;
		void persistSnapshot(remote).catch((error) =>
			log.warn('Closure history could not be saved', { context: { error: String(error) } })
		);
	}, [remote, persistSnapshot]);
	const documentError = doc.documentError && !doc.isOffline;
	const recorded = get(doc.receiptData, 'closure', row) as RecordedFigures & {
		number: number;
		corrections?: Correction[];
	};
	const corrections = recorded.corrections ?? [];
	const { settled, touched } = deriveSettled(recorded, corrections);
	const labels: Record<string, string> = {
		expected: t('register.expected', { amount: '' }).trim(),
		counted: t('register.counted'),
		variance: t('register.variance'),
		period_sales_total: t('register.period_sales'),
		period_refunds_total: t('register.period_refunds'),
		perpetual_sales_total: t('register.perpetual_sales'),
		perpetual_refunds_total: t('register.perpetual_refunds'),
	};
	const title = t('reports.closure_n', { n: recorded.number });
	const synced = ['synced', 'superseded'].includes(row.sync_status);
	const reprint = async () => {
		setError('');
		try {
			if (!(await doc.print())) setError(t('reports.reprint_failed'));
		} catch (error) {
			setError(error instanceof Error ? error.message : t('reports.reprint_failed'));
		}
	};
	return (
		<ReportPanel testID="closure-panel" onClose={onClose}>
			{phone && (
				<Button testID="closure-back" variant="ghost" className="self-start" onPress={onClose}>
					{t('common.back')}
				</Button>
			)}
			<DialogHeader className="flex-row items-center gap-3">
				{phone ? (
					<Text variant="dialog" className="shrink">
						{title}
					</Text>
				) : (
					<DialogTitle className="shrink">{title}</DialogTitle>
				)}
				<View className="min-w-0 flex-1 gap-2">
					<TemplateSwitcher
						templates={doc.templates}
						selectedId={doc.selectedTemplateId}
						onSelect={doc.setSelectedTemplateId}
						isOffline={doc.isOffline}
						alwaysVisible
					/>
					<PrinterSwitcher
						printers={doc.allPrinters}
						printerSelection={doc.printerSelection}
						resolvedPrinterId={doc.resolvedPrinter?.id ?? null}
						onSelect={doc.setPrinterSelection}
					/>
				</View>
			</DialogHeader>
			<ScrollView
				testID="closure-panel-body"
				className="min-h-0 flex-1"
				contentContainerClassName="gap-4 px-4"
				contentContainerStyle={{ overflow: 'hidden' }}
			>
				{documentError ? (
					<View className="gap-3">
						<Text testID="closure-document-error">{t('reports.load_failed')}</Text>
						<Button testID="closure-document-retry" variant="outline" onPress={doc.refetch}>
							{t('common.retry')}
						</Button>
					</View>
				) : (
					<ReceiptBody doc={doc} hideSelects fullWidth />
				)}
				{!documentError && !!corrections.length && touched.size > 0 && (
					<View testID="closure-settled" className="gap-2 border-t pt-3">
						<Text className="font-semibold">{t('reports.recorded_settled')}</Text>
						{[...touched].map((field) => (
							<View
								key={field}
								testID={`closure-settled-${field}`}
								className="flex-row justify-between gap-3"
							>
								<Text>
									{labels[field.split('.')[0]]}
									{field.includes('.') ? ` · ${field.split('.')[1]}` : ''}
								</Text>
								<Text className="tabular-nums">
									{context.formatMoney(get(recorded, field, '0'))} →{' '}
									{context.formatMoney(get(settled, field, '0'))}
								</Text>
							</View>
						))}
					</View>
				)}
				{(documentError ? [] : corrections).map((c) => (
					<View key={c.id} testID={`closure-correction-${c.id}`} className="gap-1 border-t pt-3">
						<Text className="font-semibold">{t(`reports.${c.type}`)}</Text>
						<Text>
							{c.actor.name}
							{c.approver ? ` · ${t('reports.approver', { name: c.approver.name })}` : ''}
						</Text>
						<Text>{c.reason}</Text>
						<Text className="text-muted-foreground">
							{new Intl.DateTimeFormat(context.locale, {
								dateStyle: 'medium',
								timeStyle: 'short',
								...(context.timezone === 'device' ? {} : { timeZone: context.timezone }),
							}).format(
								new Date(
									c.created_at.endsWith('Z') ? c.created_at : `${c.created_at.replace(' ', 'T')}Z`
								)
							)}
						</Text>
					</View>
				))}
			</ScrollView>
			{(doc.isOffline || !synced) && (
				<Text className="px-4">
					{t(doc.isOffline ? 'reports.recount_offline' : 'reports.recount_pending')}
				</Text>
			)}
			{!!error && (
				<Text testID="closure-action-error" className="px-4">
					{error}
				</Text>
			)}
			<DialogFooter
				testID="closure-panel-footer"
				record={{
					label: t('reports.recount'),
					testID: 'closure-recount',
					disabled: doc.isOffline || doc.isSyncing || !!documentError || !remote || !synced,
					onPress: () => setRecounting(true),
				}}
				secondary={{
					label: t('reports.reprint'),
					testID: 'closure-reprint',
					loading: doc.isPrinting,
					onPress: () => void reprint(),
				}}
			/>
			{recounting && (
				<RecountSheet
					row={row}
					corrections={corrections}
					onSaved={async () => {
						const response = await http.get('/receipts/0', {
							params: { mode: 'fiscal', document: `closure:${row.server_closure_id ?? row.id}` },
						});
						await persistSnapshot(response.data.data);
						doc.refetch();
						onRecountSaved?.();
					}}
					onOpenChange={setRecounting}
				/>
			)}
		</ReportPanel>
	);
}
