import * as React from 'react';
import { View } from 'react-native';

import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';

import { useDocField } from '@wcpos/query';
import { Card } from '@wcpos/components/card';
import { Button, ButtonText } from '@wcpos/components/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { EASE_BEAT, STAMP } from '@wcpos/components/lib/motion';
import { Icon } from '@wcpos/components/icon';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { Text } from '@wcpos/components/text';
import { ToneDisc } from '@wcpos/components/tone-disc';
import type { ReadonlyClosureDocument } from '@wcpos/query/register-session';

import { formatClosureDate } from '../../../../services/register-session/closure-document';
import { useSessionReport } from '../../../../services/register-session/use-session-report';
import { useLocale } from '../../../../hooks/use-locale';
import { useStoreDay } from '../../../../hooks/use-store-day';
import { ReceiptBody } from '../../receipt/receipt-body';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePanelSide } from '../contexts/overlay-side';
import { countVariance, varianceText } from './register-count.helpers';

export type ClosureCount = {
	closure: ReadonlyClosureDocument;
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
	const { store } = useStoreSession();
	const storeName = useDocField(store, (value) => value.name);
	const report = useSessionReport(closure);
	const number = useDocField(closure, (row) => row.server_number ?? row.number);
	const [preview, setPreview] = React.useState(false);
	const [printedAt, setPrintedAt] = React.useState(closure.printed_at);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const t = useT();
	const { format } = useCurrencyFormat();
	const side = usePanelSide('cart');
	// The store's timezone and locale, as the Z-report prints it: the header and the
	// document must show the same day and time.
	const { timezone } = useStoreDay();
	const { code: locale } = useLocale();
	const date = formatClosureDate(closure.closed_at, { timezone, locale }).datetime;
	const figures = [
		['counted', t('register.counted'), format(Number(counted))],
		['expected', t('register.expected_label'), format(Number(expected))],
		['variance', t('register.variance'), varianceText(countVariance(counted, expected), format, t)],
	].filter(([key]) => !blind || key === 'counted');
	const printReport = async () => {
		setBusy(true);
		setError('');
		try {
			setPrintedAt(await report.print());
		} catch {
			setError(t('register.print_failed'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onDone();
			}}
		>
			<DialogContent side={side} size="lg" portalHost="pos" testID="closure-sheet">
				<DialogHeader className="flex-row items-center gap-3">
					<Animated.View
						// Decision 29: the stamp lands on the shared overshoot.
						entering={ZoomIn.duration(STAMP).easing(EASE_BEAT).reduceMotion(ReduceMotion.System)}
					>
						<ToneDisc tone="ok" size="sm" />
					</Animated.View>
					<View className="flex-1 gap-1">
						<DialogTitle testID="closure-title">
							{t('register.closure_written_n', { n: number })}
						</DialogTitle>
						{/* The minted number on its own, for E2E: the title around it is translated. */}
						<Text testID="closure-number" className="hidden">
							{number}
						</Text>
						<DialogDescription>
							{storeName} · {date}
						</DialogDescription>
					</View>
				</DialogHeader>
				{/* Tiles wrap on a narrow page (the phone's full-width sheet, long amounts). */}
				<View className="flex-row flex-wrap gap-2">
					{figures.map(([key, label, value]) => (
						<Card key={key} padding="row" className="min-w-28 flex-1">
							<Text variant="key">{label}</Text>
							<AmountFigure
								testID={`closure-${key}`}
								size="tile"
								tone={
									key === 'variance' && countVariance(counted, expected) < 0 ? 'bad' : 'default'
								}
							>
								{value}
							</AmountFigure>
						</Card>
					))}
				</View>
				{!blind && closure.unsynced_count > 0 && (
					<Text testID="closure-unsynced" className="text-muted-foreground">
						{t('register.unsynced_closure', { count: closure.unsynced_count })}
					</Text>
				)}
				{!blind && (
					<View className="border-border border-t">
						<Button
							testID="closure-preview-fold"
							variant="ghost"
							className="flex-row justify-start gap-2 px-0"
							onPress={() => setPreview(!preview)}
						>
							<Icon
								name={preview ? 'chevronDown' : 'chevronRight'}
								className="text-muted-foreground"
							/>
							<ButtonText>{t('register.z_report')}</ButtonText>
						</Button>
					</View>
				)}
				{preview && !blind && (
					<View className="h-80">
						<ReceiptBody doc={report.doc} />
					</View>
				)}
				{!blind && printedAt ? (
					<Text testID="closure-printed" className="text-success">
						{t('register.printed_on', {
							time: new Date(printedAt).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
							}),
						})}
					</Text>
				) : null}
				<DialogFooter
					size="lg"
					intent={{ label: t('register.done'), testID: 'closure-done', onPress: onDone }}
					secondary={
						!blind &&
						!printedAt && {
							label: t('register.print_z_report'),
							testID: 'closure-print',
							icon: 'print',
							loading: busy,
							onPress: () => void printReport(),
						}
					}
				/>
				{!!error && (
					<Text testID="closure-print-error" className="text-bad">
						{error}
					</Text>
				)}
			</DialogContent>
		</Dialog>
	);
}
