import * as React from 'react';
import { ScrollView } from 'react-native';

import { DialogFooter, DialogHeader } from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import { useDocField } from '@wcpos/query';
import type { ReadonlyClosureDocument } from '@wcpos/query/register-session';

import { useT } from '../../../../contexts/translations';
import { formatClosureDate } from '../../../../services/register-session/closure-document';
import { ClosureBody, ClosureHeading } from '../../reports/closures/closure-body';
import { useClosureView } from '../../reports/closures/closure-panel';

export type ClosureCount = {
	closure: ReadonlyClosureDocument;
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
				<ClosureBody
					row={row}
					doc={doc}
					settled={settled}
					touched={touched}
					corrections={corrections}
					blind={count.blind}
					context={context}
					printCount={printCount}
				/>
				{!count.blind && !error && printed && (
					<Text testID="closure-printed" className="text-success">
						✓{' '}
						{t('register.printed_on', {
							time: formatClosureDate(row.printed_at ?? new Date().toISOString(), context).time,
						})}
					</Text>
				)}
				{!!error && (
					<Text testID="closure-print-error" className="text-bad">
						{error}
					</Text>
				)}
			</ScrollView>
			<DialogFooter
				size="lg"
				intent={{ label: t('register.done'), testID: 'closure-done', onPress: onDone }}
				secondary={
					!count.blind && {
						label: printed || error ? t('register.print_again') : t('register.print_z_report'),
						testID: 'closure-print',
						icon: 'print',
						loading: doc.isPrinting,
						onPress: () => void reprint(),
					}
				}
			/>
		</>
	);
}
