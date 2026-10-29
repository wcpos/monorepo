import * as React from 'react';
import { ScrollView, View } from 'react-native';

import get from 'lodash/get';

import { useIsPhone } from '@wcpos/components/lib/device';
import { IconButton } from '@wcpos/components/icon-button';
import { Dialog, DialogFooter, DialogHeader } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import {
	CLOSURE_DOCUMENT_LIMIT,
	type ClosureRow,
	readClosure,
	setClosureReceiptSnapshot,
} from '@wcpos/query/register-session';
import { log } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { buildClosureDocument } from '../../../../services/register-session/closure-document';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import {
	type Correction,
	deriveSettled,
	type RecordedFigures,
} from '../../../../services/register-session/settled-figures';
import { useRestHttpClient } from '../../hooks/use-rest-http-client';
import { ClosureBody, ClosureHeading } from './closure-body';
import { RecountSheet } from './recount-sheet';
import { ReportPanel } from '../report-panel';
import { useReceiptDocument } from '../../receipt/use-receipt-document';

export function useClosureView(row: ClosureRow) {
	const t = useT();
	const [error, setError] = React.useState('');
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
	const recorded = get(doc.receiptData, 'closure', row) as RecordedFigures & {
		number: number;
		corrections?: Correction[];
	};
	const corrections = recorded.corrections ?? [];
	const { settled, touched } = deriveSettled(recorded, corrections);
	const synced = ['synced', 'superseded'].includes(row.sync_status);
	// The count this pane's last print reached. A local row updates live and overtakes it; a
	// server-listed row never does; the greater of the two is right either way (Codex, #3036).
	const [printedTo, setPrintedTo] = React.useState(0);
	const reprint = async () => {
		setError('');
		try {
			if (!(await doc.print())) setError(t('reports.reprint_failed'));
			else setPrintedTo((reached) => Math.max(row.print_count ?? 0, reached) + 1);
		} catch (error) {
			setError(error instanceof Error ? error.message : t('reports.reprint_failed'));
		}
	};
	return {
		doc,
		context,
		settled,
		touched,
		corrections,
		synced,
		printCount: Math.max(row.print_count ?? 0, printedTo),
		reprint,
		error,
		persistSnapshot,
	};
}

export function ClosurePanel({
	row,
	onClose,
	onBack,
	onRecountSaved,
}: {
	row: ClosureRow;
	onClose: () => void;
	onBack?: () => void;
	onRecountSaved?: () => void;
}) {
	const t = useT();
	const http = useRestHttpClient();
	const [recounting, setRecounting] = React.useState(false);
	const phone = useIsPhone();
	const {
		doc,
		context,
		settled,
		touched,
		corrections,
		synced,
		printCount,
		reprint,
		error,
		persistSnapshot,
	} = useClosureView(row);
	const remote = doc.serverReceiptData;
	const documentError = doc.documentError && !doc.isOffline;
	const content = (
		<>
			<DialogHeader className="flex-row items-center gap-3">
				<ClosureHeading
					row={row}
					settled={settled}
					blind={false}
					leading={
						(onBack || phone) && (
							<IconButton
								name="chevronLeft"
								testID="closure-back"
								accessibilityLabel={t('common.back')}
								onPress={onBack ?? onClose}
							/>
						)
					}
				/>
			</DialogHeader>
			<ScrollView
				testID="closure-panel-body"
				className="min-h-0 flex-1"
				contentContainerClassName="gap-4 px-4"
				contentContainerStyle={{ overflow: 'hidden' }}
			>
				<ClosureBody
					row={row}
					doc={doc}
					settled={settled}
					touched={touched}
					corrections={corrections}
					blind={false}
					context={context}
					printCount={printCount}
				/>
			</ScrollView>
			{(doc.isOffline || !synced) && (
				<Text className="px-4">
					{doc.isOffline ? t('reports.recount_offline') : t('reports.recount_pending')}
				</Text>
			)}
			{!!error && (
				<Text testID="closure-action-error" className="px-4">
					{error}
				</Text>
			)}
			<DialogFooter
				testID="closure-panel-footer"
				close={onBack ? false : undefined}
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
		</>
	);
	if (onBack)
		return (
			<View testID="closure-panel" className="bg-card min-h-0 flex-1 gap-4 py-4">
				{content}
			</View>
		);
	const panel = (
		<ReportPanel testID="closure-panel" onClose={onClose}>
			{content}
		</ReportPanel>
	);
	// A page has no modal surface, but its shared web title/description still need context.
	return phone ? (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			{panel}
		</Dialog>
	) : (
		panel
	);
}
