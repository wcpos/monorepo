import * as React from 'react';
import { Platform, ScrollView, type TextInputKeyPressEvent, View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Badge } from '@wcpos/components/badge';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Notice } from '@wcpos/components/notice';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { analyzeScanTrace, type TraceAnalysis, type TraceSuggestion } from '@wcpos/scanner';
import { useDocField } from '@wcpos/query';
import { patchStoreSettings } from '@wcpos/query/user-db';

import { useScanTraceCapture } from './use-scan-trace-capture';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection } from '../../hooks/barcodes';

const DOCS_URL = 'https://docs.wcpos.com/hardware/scanner-setup-wizard';
const BAR_HEIGHT_CAP_MS = 60;

function keyGlyph(key: string): string {
	if (key === 'Shift') return '⇧';
	if (key === 'Enter' || key === 'Return') return '↵';
	return key;
}

function TimingChart({
	analysis,
	keys,
	threshold,
}: {
	analysis: TraceAnalysis;
	keys: string[];
	threshold: number;
}) {
	const t = useT();
	const thresholdHeight = Math.min(threshold, BAR_HEIGHT_CAP_MS);

	return (
		<VStack space="xs" testID="barcode-test-chart">
			<ScrollView horizontal showsHorizontalScrollIndicator={false}>
				<View className="relative flex-row items-end gap-1 pt-2" style={{ height: 96 }}>
					<View
						className="border-border absolute right-0 left-0 border-t border-dashed"
						style={{ bottom: thresholdHeight + 28 }}
					/>
					{analysis.gaps.map((gap, index) => {
						const height = Math.max(3, Math.min(gap, BAR_HEIGHT_CAP_MS));
						const overThreshold = index > 0 && gap > threshold;
						return (
							<View key={index} className="w-6 items-center gap-0.5">
								<View
									className={`w-4 rounded-t-sm ${overThreshold ? 'bg-warning' : 'bg-primary'}`}
									style={{ height }}
								/>
								<Text className="font-mono text-xs">{keyGlyph(keys[index] ?? '')}</Text>
								<Text className="text-muted-foreground text-xs">{index === 0 ? '—' : gap}</Text>
							</View>
						);
					})}
					{analysis.gaps.length === 0 ? (
						<Text className="text-muted-foreground text-sm">
							{t('settings.barcode_test_chart_empty')}
						</Text>
					) : null}
				</View>
			</ScrollView>
			<Text className="text-muted-foreground text-xs">
				{t('settings.barcode_test_chart_threshold', {
					threshold,
				})}
			</Text>
		</VStack>
	);
}

export function TestPanel() {
	const t = useT();
	const { store } = useStoreSession();
	const { barcode$, onKeyPress: detectorOnKeyPress } = useBarcodeDetection();
	const detectedBarcode = useObservableState(barcode$) as string | undefined;
	const { currentKeys, attempts, onKeyPress: captureOnKeyPress } = useScanTraceCapture();
	// On web a global key listener captures scans; on native `useHotkeys` is
	// inert, so the readout below doubles as a focused capture input. Its keys
	// must feed BOTH the trace capture and the production detector — otherwise
	// the detected-barcode readout stays empty on native.
	const isWeb = Platform.OS === 'web';
	const handleNativeKeyPress = React.useCallback(
		(event: TextInputKeyPressEvent) => {
			captureOnKeyPress(event);
			detectorOnKeyPress(event);
		},
		[captureOnKeyPress, detectorOnKeyPress]
	);

	const storeSettings = useDocField(store, (latest) => {
		return {
			barcode_scanning_avg_time_input_threshold: latest.barcode_scanning_avg_time_input_threshold,
			barcode_scanning_min_chars: latest.barcode_scanning_min_chars,
			barcode_scanning_prefix: latest.barcode_scanning_prefix || '',
			barcode_scanning_suffix: latest.barcode_scanning_suffix || '',
		};
	});

	const settings = React.useMemo(
		() => ({
			threshold: storeSettings.barcode_scanning_avg_time_input_threshold ?? 24,
			minChars: storeSettings.barcode_scanning_min_chars ?? 8,
			prefix: storeSettings.barcode_scanning_prefix || '',
			suffix: storeSettings.barcode_scanning_suffix || '',
		}),
		[storeSettings]
	);

	const latestAttempt = attempts[0];
	const analysis = React.useMemo(
		() => (latestAttempt ? analyzeScanTrace(latestAttempt, settings) : null),
		[latestAttempt, settings]
	);

	const history = React.useMemo(
		() => attempts.map((attempt) => analyzeScanTrace(attempt, settings)),
		[attempts, settings]
	);

	const applySuggestion = React.useCallback(
		async (suggestion: TraceSuggestion) => {
			await patchStoreSettings(store, suggestion.settings, t);
		},
		[t, store]
	);

	const liveKeys = (currentKeys.length > 0 ? currentKeys : (latestAttempt ?? []))
		.map((entry) => keyGlyph(entry.key))
		.join('');

	return (
		<VStack space="lg">
			<VStack space="sm">
				<Label nativeID="keypress-event">{t('settings.keypress_event')}</Label>
				<Input
					className="bg-accent font-mono"
					value={liveKeys}
					editable={!isWeb}
					aria-disabled={isWeb}
					onKeyPress={isWeb ? undefined : handleNativeKeyPress}
					autoFocus={!isWeb}
					placeholder={isWeb ? undefined : t('settings.barcode_test_capture_placeholder')}
					testID="barcode-test-keys"
				/>
			</VStack>
			<VStack space="sm">
				<Label nativeID="detected-barcode">{t('settings.detected_barcode')}</Label>
				<Input
					className="bg-accent font-mono"
					value={detectedBarcode}
					editable={false}
					aria-disabled
					testID="barcode-test-detected"
				/>
			</VStack>

			{analysis && latestAttempt ? (
				<TimingChart
					analysis={analysis}
					keys={latestAttempt.map((entry) => entry.key)}
					threshold={settings.threshold}
				/>
			) : null}

			{analysis ? (
				<Verdict analysis={analysis} settings={settings} onApply={applySuggestion} />
			) : null}

			{history.length > 0 ? <History history={history} /> : null}

			<DocsLink testID="barcode-test-docs-link" href={DOCS_URL}>
				{t('settings.barcode_test_docs_link')}
			</DocsLink>
		</VStack>
	);
}

function Verdict({
	analysis,
	settings,
	onApply,
}: {
	analysis: TraceAnalysis;
	settings: { threshold: number; minChars: number };
	onApply: (suggestion: TraceSuggestion) => void;
}) {
	const t = useT();
	const avg = Math.round(analysis.avgGapMs);

	let headline: string;
	if (analysis.detectedAsScan) {
		headline = t('settings.barcode_test_detected_scan', {
			code: analysis.code,
		});
	} else if (analysis.nearMiss) {
		headline = t('settings.barcode_test_near_miss', {
			avg,
			threshold: settings.threshold,
		});
	} else if (!Number.isFinite(analysis.avgGapMs)) {
		// A single (or modifier-only) keypress has no gaps — "Infinityms" is not
		// a number a cashier should ever read.
		headline = t('settings.barcode_test_single_key');
	} else {
		headline = t('settings.barcode_test_typing', {
			avg,
		});
	}

	return (
		<VStack space="sm" testID="barcode-test-verdict">
			{analysis.detectedAsScan ? (
				<>
					<HStack className="min-h-9 items-center gap-2">
						<Icon name="check" className="text-success" />
						<Text className="text-sm font-medium">{headline}</Text>
					</HStack>
					<Text className="text-muted-foreground text-xs">
						{t('settings.barcode_test_scan_detail', {
							avg,
							threshold: settings.threshold,
						})}
					</Text>
				</>
			) : analysis.nearMiss ? (
				<Notice tone="warn" title={headline} />
			) : (
				<Text className="text-muted-foreground text-sm">{headline}</Text>
			)}

			{analysis.suggestions.map((suggestion) => (
				<Notice
					key={suggestion.kind}
					tone="info"
					title={suggestionText(t, suggestion, avg)}
					actions={[
						{ label: t('settings.barcode_test_apply'), onPress: () => onApply(suggestion) },
					]}
				/>
			))}

			{analysis.shiftMangled ? (
				<Notice
					tone="warn"
					title={t('settings.barcode_test_shift_mangled_title')}
					description={t('settings.barcode_test_shift_mangled_description')}
				/>
			) : null}

			{analysis.trailingEnter ? (
				<Text className="text-muted-foreground text-xs">
					{t('settings.barcode_test_trailing_enter')}
				</Text>
			) : null}
		</VStack>
	);
}

function suggestionText(
	t: ReturnType<typeof useT>,
	suggestion: TraceSuggestion,
	avg: number
): string {
	if (suggestion.kind === 'raise-threshold') {
		return t('settings.barcode_test_suggest_threshold', {
			value: suggestion.value,
			avg,
		});
	}
	if (suggestion.kind === 'lower-min-chars') {
		return t('settings.barcode_test_suggest_min_chars', {
			value: suggestion.value,
		});
	}
	return t('settings.barcode_test_suggest_prefix', {
		value: suggestion.value,
	});
}

function History({ history }: { history: TraceAnalysis[] }) {
	const t = useT();

	return (
		<VStack space="xs" testID="barcode-test-history">
			<Text className="text-sm font-medium">{t('settings.barcode_test_recent')}</Text>
			{history.map((entry, index) => {
				const result = entry.detectedAsScan
					? entry.tooShort
						? t('settings.barcode_test_result_too_short')
						: t('settings.barcode_test_result_scan')
					: t('settings.barcode_test_result_typing');
				const tone = entry.detectedAsScan ? (entry.tooShort ? 'warning' : 'success') : 'muted';
				return (
					<HStack key={index} className="border-border rounded-md border p-2">
						<Text className="flex-1 font-mono text-sm" numberOfLines={1}>
							{entry.code || entry.raw || '—'}
						</Text>
						<Badge variant={tone} tinted>
							{result}
						</Badge>
						<Text className="text-muted-foreground w-16 text-right text-xs">
							{Number.isFinite(entry.avgGapMs) ? `${Math.round(entry.avgGapMs)}ms` : '—'}
						</Text>
					</HStack>
				);
			})}
		</VStack>
	);
}
