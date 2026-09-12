import * as React from 'react';
import { View } from 'react-native';

import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { useDocField } from '@wcpos/query';
import type { ClosureDocument } from '@wcpos/database';
import { Button } from '@wcpos/components/button';
import { Dialog, DialogContent, DialogTitle } from '@wcpos/components/dialog';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';

import { useSessionReport } from './movement-sheet';
import { ReceiptBody } from '../../receipt/receipt-body';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePOSOverlaySide } from '../contexts/overlay-side';
import { countVariance, varianceText } from './register-count.helpers';

export type ClosureCount = {
	closure: ClosureDocument;
	counted: string;
	expected: string;
	blind: boolean;
};
export function ClosureSheet({
	closure,
	counted,
	expected,
	blind,
	onDone,
}: ClosureCount & { onDone: () => void }) {
	const report = useSessionReport(closure);
	const number = useDocField(closure, (row) => row.server_number ?? row.number);
	const [preview, setPreview] = React.useState(false);
	const [printedAt, setPrintedAt] = React.useState(closure.printed_at);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const t = useT();
	const { format } = useCurrencyFormat();
	const side = usePOSOverlaySide();
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onDone();
			}}
		>
			<DialogContent side={side} portalHost="pos" testID="closure-sheet">
				<Animated.View
					entering={ZoomIn.duration(180).reduceMotion(ReduceMotion.System)}
					className="bg-success/10 h-10 w-10 items-center justify-center rounded-full"
				>
					<Icon name="check" className="text-success" />
				</Animated.View>
				<DialogTitle testID="closure-title">
					{t('register.closure_written_n', { n: number })}
				</DialogTitle>
				<Text testID="closure-counted" className="min-h-11 text-[32px] tabular-nums">
					{t('register.counted')} · {format(Number(counted))}
				</Text>
				{!blind && (
					<>
						<Text testID="closure-expected" className="min-h-11 tabular-nums">
							{t('register.expected_line', { amount: format(Number(expected)) })}
						</Text>
						<Text testID="closure-variance" className="min-h-11 tabular-nums">
							{t('register.variance')} · {varianceText(countVariance(counted, expected), format, t)}
						</Text>
					</>
				)}
				{!blind && closure.unsynced_count > 0 && (
					<Text testID="closure-unsynced" className="text-muted-foreground">
						{t('register.unsynced_closure', { count: closure.unsynced_count })}
					</Text>
				)}
				{!blind && (
					<Button
						testID="closure-preview-fold"
						variant="ghost"
						className="min-h-11"
						onPress={() => setPreview(!preview)}
					>
						{t('register.z_report')}
					</Button>
				)}
				{preview && !blind && (
					<View className="h-80">
						<ReceiptBody doc={report.doc} />
					</View>
				)}
				{error && <Text testID="closure-print-error">{error}</Text>}
				{!blind && printedAt ? (
					<Text testID="closure-printed" className="text-success">
						{t('register.printed_on', {
							time: new Date(printedAt).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
							}),
						})}
					</Text>
				) : !blind ? (
					<Button
						testID="closure-print"
						className="min-h-14"
						loading={busy}
						onPress={async () => {
							setBusy(true);
							setError('');
							try {
								setPrintedAt(await report.print());
							} catch {
								setError(t('register.print_failed'));
							} finally {
								setBusy(false);
							}
						}}
					>
						{t('register.print_z_report')}
					</Button>
				) : null}
				<Button
					testID="closure-done"
					variant={blind || printedAt ? 'default' : 'outline'}
					className="min-h-14"
					onPress={onDone}
				>
					{t('register.done')}
				</Button>
			</DialogContent>
		</Dialog>
	);
}
