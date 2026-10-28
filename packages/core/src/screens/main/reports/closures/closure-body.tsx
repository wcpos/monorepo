import * as React from 'react';
import { View } from 'react-native';

import get from 'lodash/get';

import { AmountFigure } from '@wcpos/components/amount-figure';
import { Button } from '@wcpos/components/button';
import { DialogDescription, DialogTitle } from '@wcpos/components/dialog';
import { Icon } from '@wcpos/components/icon';
import { cn } from '@wcpos/components/lib/utils';
import { MenuRow } from '@wcpos/components/menu-row';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { fromMinor, toMinor } from '@wcpos/order-math';
import { useDocField } from '@wcpos/query';
import type { ClosureRow } from '@wcpos/query/register-session';

import { useT } from '../../../../contexts/translations';
import { useViewedStore } from '../../../../hooks/use-store-day';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import {
	buildClosureDocument,
	type ClosureContext,
	formatClosureDate,
} from '../../../../services/register-session/closure-document';
import { useClosureDocumentContext } from '../../../../services/register-session/use-closure-document-context';
import { countVariance, varianceText } from '../../pos/cart/register-count.helpers';
import { ReceiptBody } from '../../receipt/receipt-body';
import { PrinterSwitcher } from '../../receipt/printer-switcher';
import { TemplateSwitcher } from '../../receipt/template-switcher';

import type {
	Correction,
	RecordedFigures,
} from '../../../../services/register-session/settled-figures';
import type { useReceiptDocument } from '../../receipt/use-receipt-document';

const STATIC_ROW =
	'min-h-row border-border flex-row items-center justify-between gap-2 border-b px-2.5';
const ACTION_ROW = 'border-border rounded-none border-b';
const NOTE = 'text-muted-foreground px-2.5 py-1 text-sm';
const MUTED = 'text-muted-foreground';

type HeadingProps = {
	row: ClosureRow;
	settled: RecordedFigures;
	blind: boolean;
	title?: string;
	leading?: React.ReactNode;
	testID?: string;
};

export function ClosureHeading({ row, settled, blind, title, leading, testID }: HeadingProps) {
	const t = useT();
	const store = useViewedStore(row.store_id ?? 0);
	const storeName = useDocField(store, (value) => value.name);
	const names = useRegisterNames();
	const context = useClosureDocumentContext(row.store_id ?? 0);
	const opened = formatClosureDate(row.opened_at, context);
	const closed = formatClosureDate(row.closed_at, context);
	const span =
		opened.date_ymd === closed.date_ymd
			? `${opened.weekday_short} ${Number(opened.day)} ${opened.month_short} ${opened.time}–${closed.time}`
			: `${opened.date} ${opened.time} → ${closed.date} ${closed.time}`;
	const variance = countVariance(settled.counted.cash ?? '0', settled.expected.cash ?? '0');
	return (
		<>
			{leading}
			<ToneDisc size="sm" tone={blind ? 'muted' : variance < 0 ? 'bad' : 'ok'} />
			<View testID={testID} className="min-w-0 flex-1 gap-1">
				<DialogTitle>
					{title ??
						t('reports.closure_n', { n: row.printed_number ?? row.server_number ?? row.number })}
				</DialogTitle>
				<DialogDescription>
					{/* place · register · when · closer; a missing place or register leaves no empty slot. */}
					{[storeName, String(row.breakdowns.register_name || names[row.register_id] || ''), span]
						.filter(Boolean)
						.join(' · ')}
					{' · '}
					<Text className="text-foreground font-semibold">
						{String(row.breakdowns.closed_by_name || t('register.unknown_cashier'))}
					</Text>
				</DialogDescription>
			</View>
		</>
	);
}

type BodyProps = Pick<HeadingProps, 'row' | 'settled' | 'blind' | 'testID'> & {
	doc: ReturnType<typeof useReceiptDocument>;
	touched: ReadonlySet<string>;
	corrections: readonly Correction[];
	context: ClosureContext;
};

export function ClosureBody({
	row,
	doc,
	settled,
	touched,
	corrections,
	blind,
	context,
	testID,
}: BodyProps) {
	const t = useT();
	const [preview, setPreview] = React.useState(false);
	const format = (value: number) => context.formatMoney(String(value));
	const counted = settled.counted.cash ?? '0',
		expected = settled.expected.cash ?? '0';
	const variance = countVariance(counted, expected);
	const recorded = get(doc.receiptData, 'closure', row) as RecordedFigures;
	const breakdowns = row.breakdowns;
	const opening = breakdowns.opening_float as
		{ counted?: string | null; expected?: string } | undefined;
	const methods = (breakdowns.payment_methods ?? {}) as Record<
		string,
		{ method?: string; sales?: string; refunds?: string; count?: number }
	>;
	const cash = Object.values(methods).find((method) => method.method === 'cash') ?? methods.cash;
	const movements = (breakdowns.movements ?? []) as {
		id: string;
		type: string;
		amount?: string;
		reason?: string;
		voided_by?: string | null;
		voids?: string | null;
	}[];
	const active = movements.filter(
		(m) => m.type !== 'void' && !m.voided_by && !movements.some((v) => v.voids === m.id)
	);
	const others = buildClosureDocument(
		{ ...row, expected: settled.expected },
		context
	).closure.tenders.filter(
		({ name }) => name !== 'cash' && Number(settled.expected[name] ?? 0) !== 0
	);
	const cashiers = (breakdowns.cashiers ?? []) as (string | { name: string })[];
	const term = (label: string, suffix?: React.ReactNode, quiet?: boolean, strong?: boolean) => (
		<Text
			numberOfLines={1}
			className={cn('min-w-0 flex-1', quiet && MUTED, strong && 'font-semibold')}
		>
			{label}
			{suffix != null && suffix !== '' && <Text className={`${MUTED} text-sm`}> {suffix}</Text>}
		</Text>
	);
	const amount = (value: string, quiet?: boolean, strong?: boolean) =>
		!blind && (
			<Text className={cn('tabular-nums', quiet && MUTED, strong && 'font-semibold')}>{value}</Text>
		);
	const minus = (value: string) =>
		Number(value) ? `−${format(Math.abs(Number(value)))}` : format(0);
	const band = (label: string) => (
		<View className="h-band border-border justify-center border-b px-2.5">
			<Text className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
				{label}
			</Text>
		</View>
	);
	const figures = [
		['counted', t('register.counted'), context.formatMoney(counted)],
		['expected', t('register.expected_label'), context.formatMoney(expected)],
		['result', t('reports.result'), varianceText(variance, format, t)],
	].filter(([key]) => !blind || key === 'counted');
	return (
		<View testID={testID} className="gap-4">
			<View className="flex-row gap-2">
				{figures.map(([key, label, value]) => (
					<View key={key} className="border-border flex-1 rounded-lg border px-3 py-2.5">
						<Text className="text-muted-foreground text-sm">{label}</Text>
						<AmountFigure
							testID={`closure-figure-${key}`}
							size="tile"
							tone={key === 'result' ? (variance < 0 ? 'bad' : 'ok') : 'default'}
						>
							{value}
						</AmountFigure>
					</View>
				))}
			</View>
			{touched.size > 0 && (
				<Notice
					testID="closure-settled"
					tone="warning"
					title={t('reports.recorded_settled_line', {
						recorded: context.formatMoney(recorded.counted.cash ?? '0'),
						result: varianceText(
							countVariance(recorded.counted.cash ?? '0', recorded.expected.cash ?? '0'),
							format,
							t
						),
						settled: context.formatMoney(counted),
						count: corrections.filter((c) => c.type === 'recount').length,
					})}
				/>
			)}
			<View>
				{band(t('reports.drawer'))}
				<View testID="closure-drawer">
					<View className={STATIC_ROW}>
						{term(
							t('register.float'),
							`${t('register.opened_at_by', { time: formatClosureDate(row.opened_at, context).time })} ${breakdowns.opened_by_name || t('register.unknown_cashier')}`
						)}
						{amount(context.formatMoney(opening?.counted ?? opening?.expected ?? '0'))}
					</View>
					<View className={STATIC_ROW}>
						{term(t('register.cash_sales'), cash?.count)}
						{amount(context.formatMoney(cash?.sales ?? '0'))}
					</View>
					<View className={STATIC_ROW}>
						{term(t('register.cash_refunds'), undefined, !Number(cash?.refunds))}
						{amount(minus(cash?.refunds ?? '0'), !Number(cash?.refunds))}
					</View>
					{(['paid_in', 'paid_out'] as const).map((type) => {
						const entries = active.filter((m) => m.type === type);
						const total = fromMinor(
							entries.reduce((sum, m) => sum + toMinor(m.amount ?? '0', 4), 0),
							4
						);
						const note =
							entries.length === 1 && entries[0].reason
								? `1 · ${entries[0].reason}`
								: entries.length || undefined;
						return (
							<View key={type} className={STATIC_ROW}>
								{term(t(`register.${type}`), note, !Number(total))}
								{amount(
									type === 'paid_out' ? minus(total) : context.formatMoney(total),
									!Number(total)
								)}
							</View>
						);
					})}
					{active.some((m) => m.type === 'no_sale') && (
						<View className={STATIC_ROW}>
							{term(t('register.no_sales'), undefined, true)}
							<Text className={`${MUTED} tabular-nums`}>
								{active.filter((m) => m.type === 'no_sale').length}
							</Text>
						</View>
					)}
					<View className={STATIC_ROW}>
						{term(t('register.expected_in_drawer'), undefined, false, true)}
						{amount(context.formatMoney(expected), false, true)}
					</View>
					<View className={STATIC_ROW}>
						{term(
							t('register.counted'),
							touched.has('counted.cash') ? t('reports.settled') : undefined,
							false,
							true
						)}
						{amount(context.formatMoney(counted), false, true)}
					</View>
				</View>
				{others.length > 0 && (
					<>
						{band(t('register.other_tenders'))}
						{others.map(({ name, label }) => (
							<View key={name} className={STATIC_ROW}>
								{term(String(label))}
								{amount(context.formatMoney(settled.expected[name]))}
							</View>
						))}
					</>
				)}
				{band(t('reports.session'))}
				{cashiers.length > 0 && (
					<View className={STATIC_ROW}>
						{term(t('reports.document.cashiers'))}
						<Text className={MUTED}>
							{cashiers.map((c) => (typeof c === 'string' ? c : c.name)).join(' · ')}
						</Text>
					</View>
				)}
				{breakdowns.transaction_count != null && row.period_sales_total != null && (
					<View className={STATIC_ROW}>
						{term(t('reports.sales'))}
						<Text className="tabular-nums">
							{String(breakdowns.transaction_count)}
							{!blind && ` · ${context.formatMoney(row.period_sales_total)}`}
						</Text>
					</View>
				)}
				<MenuRow
					testID="closure-zreport"
					className={ACTION_ROW}
					onPress={() => setPreview(!preview)}
					label={t('register.z_report')}
					trailing={
						<>
							<Text className={NOTE}>
								{row.print_count
									? t('reports.printed_times', { count: row.print_count })
									: t('reports.not_printed')}
							</Text>
							<Icon name={preview ? 'chevronDown' : 'chevronRight'} size="sm" className={MUTED} />
						</>
					}
				/>
				{preview &&
					(doc.documentError && !doc.isOffline ? (
						<View className="gap-3">
							<Text testID="closure-document-error">{t('reports.load_failed')}</Text>
							<Button testID="closure-document-retry" variant="outline" onPress={doc.refetch}>
								{t('common.retry')}
							</Button>
						</View>
					) : (
						<View className="gap-2 py-2">
							<View className="min-w-0 gap-2">
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
							<View className="h-80">
								<ReceiptBody doc={doc} hideSelects fullWidth />
							</View>
						</View>
					))}
				{corrections.length > 0 && band(t('reports.corrections'))}
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
			</View>
		</View>
	);
}
