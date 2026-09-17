import * as React from 'react';
import { ScrollView, View } from 'react-native';

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
import { ReceiptBody } from '../../receipt/receipt-body';
import { TemplateSwitcher } from '../../receipt/template-switcher';
import { useReceiptDocument } from '../../receipt/use-receipt-document';

export function ClosurePanel({ row, onClose }: { row: ClosureRow; onClose: () => void }) {
	const t = useT();
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
		<View testID="closure-panel" className="bg-card min-h-0 flex-1 gap-3 p-4">
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
			{phone ? (
				<Text className="text-lg font-semibold">{title}</Text>
			) : (
				<DialogTitle>{title}</DialogTitle>
			)}
			<TemplateSwitcher
				templates={doc.templates}
				selectedId={doc.selectedTemplateId}
				onSelect={doc.setSelectedTemplateId}
				isOffline={doc.isOffline}
				alwaysVisible
			/>
			<ScrollView className="flex-1" contentContainerClassName="gap-4">
				<View className="min-h-96">
					<ReceiptBody doc={doc} hideSelects />
				</View>
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
			<Text className="text-muted-foreground">{t('reports.actions_unavailable')}</Text>
			<View className="flex-row gap-3">
				<Button testID="closure-recount" variant="outline" className="min-h-12 flex-1" disabled>
					{t('reports.recount')}
				</Button>
				<Button testID="closure-reprint" className="min-h-12 flex-1" disabled>
					{t('reports.reprint')}
				</Button>
			</View>
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
			<DialogContent side="right" size="xl">
				{content}
			</DialogContent>
		</Dialog>
	);
}
