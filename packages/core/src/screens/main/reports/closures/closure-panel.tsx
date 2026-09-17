import * as React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import get from 'lodash/get';

import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import type { ClosureRow } from '@wcpos/database';
import { CLOSURE_DOCUMENT_LIMIT } from '@wcpos/database/collections/schemas/closures';
import { log } from '@wcpos/utils/logger';

import { useTheme } from '../../../../contexts/theme';
import { useT } from '../../../../contexts/translations';
import { buildClosureDocument } from '../../../../services/register-session/closure-document';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import {
	type Correction,
	deriveSettled,
	type RecordedFigures,
} from '../../../../services/register-session/settled-figures';
import { useClosureCollection } from '../../../../services/register-session/use-register-session-collections';
import { RecountSheet } from './recount-sheet';
import { ReceiptBody } from '../../receipt/receipt-body';
import { TemplateSwitcher } from '../../receipt/template-switcher';
import { useReceiptDocument } from '../../receipt/use-receipt-document';

// Tablet drawer width; the Reports host already excludes the navigation rail.
const PANEL_WIDTH = 480;

export function ClosurePanel({ row, onClose }: { row: ClosureRow; onClose: () => void }) {
	const t = useT();
	const [recounting, setRecounting] = React.useState(false);
	const [error, setError] = React.useState('');
	const { screenSize } = useTheme();
	const phone = screenSize === 'sm';
	const context = useClosureDocumentContext();
	const collection = useClosureCollection();
	const local = React.useMemo(
		() =>
			row.receipt_snapshot ? (JSON.parse(row.receipt_snapshot) as Record<string, unknown>) : null,
		[row.receipt_snapshot]
	);
	const doc = useReceiptDocument({
		autoPrintAllowed: false,
		isReprint: true,
		getLocalClosure: async () => (await collection?.findOne(row.id).exec()) ?? null,
		document: `closure:${row.server_closure_id ?? row.id}`,
		documentReady: row.sync_status === 'synced' || row.sync_status === 'superseded',
		templateType: 'closure',
		storeId: row.store_id ?? undefined,
		localReport: local ?? buildClosureDocument(row, context),
	});
	const remote = doc.serverReceiptData;
	// Retain the authoritative baseline WITH its corrections, without touching the frozen/outbox fields.
	React.useEffect(() => {
		if (!remote || !collection) return;
		const receipt_snapshot = JSON.stringify(remote);
		if (receipt_snapshot.length > CLOSURE_DOCUMENT_LIMIT) {
			log.warn('Closure document too large for offline history');
			return;
		}
		if (receipt_snapshot === row.receipt_snapshot) return;
		void collection
			.findOne(row.id)
			.exec()
			.then((record) => record?.incrementalPatch({ receipt_snapshot }))
			.catch((error) =>
				log.warn('Closure history could not be saved', { context: { error: String(error) } })
			);
	}, [remote, collection, row.id, row.receipt_snapshot]);
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
	const content = (
		<View
			testID="closure-panel"
			className="bg-card min-h-0 min-w-0 flex-1 overflow-hidden"
			style={
				!phone && Platform.OS === 'web'
					? {
							position: 'absolute',
							top: 0,
							bottom: 0,
							right: 0,
							left: 'auto',
							transform: 'none',
							width: PANEL_WIDTH,
							maxWidth: '100%',
						}
					: undefined
			}
		>
			{phone && (
				<Button
					testID="closure-back"
					variant="ghost"
					className="min-h-12 self-start"
					onPress={onClose}
				>
					{t('common.back')}
				</Button>
			)}
			<View className={`shrink-0 flex-row items-center gap-3 border-b p-3 ${phone ? '' : 'pr-16'}`}>
				{phone ? (
					<Text className="shrink text-lg font-semibold">{title}</Text>
				) : (
					<DialogTitle className="shrink">{title}</DialogTitle>
				)}
				<View className="min-w-0 flex-1">
					<TemplateSwitcher
						templates={doc.templates}
						selectedId={doc.selectedTemplateId}
						onSelect={doc.setSelectedTemplateId}
						isOffline={doc.isOffline}
						alwaysVisible
					/>
				</View>
			</View>
			<ScrollView
				testID="closure-panel-body"
				className="min-h-0 flex-1"
				contentContainerClassName="gap-4 p-4"
				contentContainerStyle={{ overflow: 'hidden' }}
			>
				<ReceiptBody doc={doc} hideSelects fullWidth />
				{!!corrections.length && touched.size > 0 && (
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
				{corrections.map((c) => (
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
			{(doc.isOffline || !['synced', 'superseded'].includes(row.sync_status)) && (
				<Text>{t(doc.isOffline ? 'reports.recount_offline' : 'reports.recount_pending')}</Text>
			)}
			{!!error && <Text testID="closure-action-error">{error}</Text>}
			<View testID="closure-panel-footer" className="bg-card shrink-0 flex-row gap-3 border-t p-4">
				<Button
					testID="closure-recount"
					variant="outline"
					className="min-h-12 flex-1"
					disabled={doc.isOffline || !['synced', 'superseded'].includes(row.sync_status)}
					onPress={() => setRecounting(true)}
				>
					{t('reports.recount')}
				</Button>
				<Button
					testID="closure-reprint"
					className="min-h-12 flex-1"
					loading={doc.isPrinting}
					onPress={async () => {
						setError('');
						try {
							if (!(await doc.print())) setError(t('reports.reprint_failed'));
						} catch (error) {
							setError(error instanceof Error ? error.message : t('reports.reprint_failed'));
						}
					}}
				>
					{t('reports.reprint')}
				</Button>
			</View>
			{recounting && <RecountSheet row={row} onSaved={doc.refetch} onOpenChange={setRecounting} />}
		</View>
	);
	return phone ? (
		content
	) : (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				side="right"
				portalHost="reports"
				className="bg-card flex-col gap-0 overflow-hidden p-0"
				// Keep Dialog focus/close semantics, but no translated box around the web panel.
				style={
					Platform.OS === 'web'
						? { display: 'contents' }
						: { width: PANEL_WIDTH, maxWidth: '100%', height: '100%' }
				}
				closeButtonProps={{
					testID: 'closure-close',
					accessibilityLabel: t('common.close'),
					className: 'h-12 w-12 items-center justify-center',
				}}
			>
				{content}
			</DialogContent>
		</Dialog>
	);
}
