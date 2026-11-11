import * as React from 'react';
import { ScrollView } from 'react-native';

import { DialogFooter, DialogHeader } from '@wcpos/components/dialog';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { useDocField } from '@wcpos/query';
import type { ReadonlyClosureDocument } from '@wcpos/query/register-session';

import { useT } from '../../../../contexts/translations';
import { formatClosureDate } from '../../../../services/register-session/closure-document';
import { ClosureBody, ClosureHeading } from '../../reports/closures/closure-body';
import { useClosureView } from '../../reports/closures/closure-panel';
import { PrintSheet } from '../../receipt/print-sheet';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useRegisterNames } from '../../../../services/register/use-register-names';

export type ClosureCount = {
	closure: ReadonlyClosureDocument;
	/** Each tender a reused closed session kept, when the one just entered differed (POS-30F). */
	kept: { tender: string; amount: string }[] | null;
	counted: string;
	expected: string;
	blind: boolean;
};

export function ClosureWritten({ count, onDone }: { count: ClosureCount; onDone: () => void }) {
	const row = useDocField(count.closure, (value) => value)!;
	// A closure printed at the close reprints from here; one never printed prints first.
	const view = useClosureView(row, { isReprint: (row.print_count ?? 0) > 0 });
	const { doc, context, settled, touched, corrections, printCount, reprint, error } = view;
	const t = useT();
	const { format } = useCurrencyFormat();
	const [sheetOpen, setSheetOpen] = React.useState(false);
	const names = useRegisterNames(row.store_id ?? undefined);
	const printed = !!row.printed_at || printCount > 0;
	return (
		<>
			<DialogHeader testID="closure-written" className="flex-row items-center gap-3">
				<ClosureHeading
					testID="closure-title"
					row={row}
					settled={settled}
					blind={count.blind}
					title={t('register.closure_n_written', { n: row.server_number ?? row.number })}
					leading={<ToneDisc tone="ok" size="sm" />}
				/>
			</DialogHeader>
			<ScrollView className="min-h-0 flex-1" contentContainerClassName="gap-4 px-4">
				{count.kept && (
					<Notice tone="info" testID="closure-count-kept" title={t('register.count_kept')}>
						{count.kept.map(({ tender, amount }) => (
							<Text key={tender} className="text-muted-foreground">
								{t('register.count_kept_tender', { tender, amount: format(Number(amount)) })}
							</Text>
						))}
					</Notice>
				)}
				<ClosureBody
					row={row}
					doc={doc}
					settled={settled}
					touched={touched}
					corrections={corrections}
					blind={count.blind}
					context={context}
					printCount={printCount}
					paperOpen
				/>
				{!count.blind && !error && printed && (
					<Text testID="closure-printed" className="text-success">
						✓{' '}
						{t('register.printed_on', {
							time: formatClosureDate(row.printed_at ?? new Date().toISOString(), context).time,
						})}
					</Text>
				)}
			</ScrollView>
			<DialogFooter
				size="lg"
				// Done is the dismissal (ruled 2026-10-29): the one footer without a separate Close.
				close={false}
				intent={{ label: t('register.done'), testID: 'closure-done', onPress: onDone }}
				secondary={
					!count.blind && {
						label: t('register.print_closure'),
						testID: 'closure-print',
						icon: 'print',
						loading: doc.isPrinting,
						onPress: () => setSheetOpen(true),
					}
				}
			/>
			<PrintSheet
				open={sheetOpen}
				onOpenChange={setSheetOpen}
				doc={doc}
				title={t('reports.document.closure')}
				description={[
					row.breakdowns?.register_name || names[row.register_id],
					formatClosureDate(row.closed_at, context).datetime,
				]
					.filter(Boolean)
					.join(' · ')}
				printLabel={t('register.print_closure')}
				error={error || doc.documentError?.message || null}
				onPrint={() => void reprint()}
				testID="closure-written-print-sheet"
			/>
		</>
	);
}
