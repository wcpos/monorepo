import * as React from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';

import { useObservablePickState, useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Label } from '@wcpos/components/label';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { analyzeScanTrace, type TraceAnalysis, type TraceSuggestion } from '@wcpos/scanner';

import { useScanTraceCapture } from './use-scan-trace-capture';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useBarcodeDetection } from '../../hooks/barcodes';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const DOCS_URL = 'https://docs.wcpos.com/products/barcode-scanning';
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
							{t('settings.barcode_test_chart_empty', {
								defaultValue: 'Scan into this page to see keystroke timing',
							})}
						</Text>
					) : null}
				</View>
			</ScrollView>
			<Text className="text-muted-foreground text-xs">
				{t('settings.barcode_test_chart_threshold', {
					threshold,
					defaultValue: 'Dashed line = your {threshold}ms threshold — amber bars exceed it',
				})}
			</Text>
		</VStack>
	);
}

export function TestPanel() {
	const t = useT();
	const { store } = useAppState();
	const { localPatch } = useLocalMutation();
	const { barcode$ } = useBarcodeDetection();
	const detectedBarcode = useObservableState(barcode$) as string | undefined;
	const { currentKeys, attempts, onKeyPress } = useScanTraceCapture();
	// On web a global key listener captures scans; on native `useHotkeys` is
	// inert, so the readout below doubles as a focused capture input that feeds
	// keystrokes in through `onKeyPress`.
	const isWeb = Platform.OS === 'web';

	const storeSettings = useObservablePickState(
		store.$,
		() => {
			const latest = store.getLatest();
			return {
				barcode_scanning_avg_time_input_threshold: latest.barcode_scanning_avg_time_input_threshold,
				barcode_scanning_min_chars: latest.barcode_scanning_min_chars,
				barcode_scanning_prefix: latest.barcode_scanning_prefix || '',
				barcode_scanning_suffix: latest.barcode_scanning_suffix || '',
			};
		},
		'barcode_scanning_avg_time_input_threshold',
		'barcode_scanning_min_chars',
		'barcode_scanning_prefix',
		'barcode_scanning_suffix'
	);

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
			await localPatch({ document: store, data: suggestion.patch });
		},
		[localPatch, store]
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
					onKeyPress={isWeb ? undefined : onKeyPress}
					autoFocus={!isWeb}
					placeholder={
						isWeb
							? undefined
							: t('settings.barcode_test_capture_placeholder', {
									defaultValue: 'Tap here, then scan',
								})
					}
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

			<Pressable onPress={() => Linking.openURL(DOCS_URL)}>
				<Text className="text-muted-foreground text-sm">
					{t('settings.barcode_test_docs_link', {
						defaultValue: 'Setup guides and common problems → WCPOS docs',
					})}
				</Text>
			</Pressable>
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
	let boxClass: string;
	let textClass: string;
	if (analysis.detectedAsScan) {
		headline = t('settings.barcode_test_detected_scan', {
			code: analysis.code,
			defaultValue: 'Detected as a scan → {code}',
		});
		boxClass = 'border-success/40 bg-success/10';
		textClass = 'text-success';
	} else if (analysis.nearMiss) {
		headline = t('settings.barcode_test_near_miss', {
			avg,
			threshold: settings.threshold,
			defaultValue: 'Treated as typing — average gap {avg}ms is above your {threshold}ms threshold',
		});
		boxClass = 'border-warning/40 bg-warning/10';
		textClass = 'text-warning';
	} else {
		headline = t('settings.barcode_test_typing', {
			avg,
			defaultValue: 'Treated as typing (average gap {avg}ms) — correctly ignored',
		});
		boxClass = 'border-border bg-muted/50';
		textClass = 'text-foreground';
	}

	return (
		<VStack space="sm" testID="barcode-test-verdict">
			<View className={`rounded-md border p-2 ${boxClass}`}>
				<Text className={`text-sm font-medium ${textClass}`}>{headline}</Text>
				{analysis.detectedAsScan ? (
					<Text className="text-muted-foreground text-xs">
						{t('settings.barcode_test_scan_detail', {
							avg,
							threshold: settings.threshold,
							defaultValue: 'Average keystroke gap {avg}ms, under the {threshold}ms threshold',
						})}
					</Text>
				) : null}
			</View>

			{analysis.suggestions.map((suggestion) => (
				<HStack key={suggestion.kind} className="border-info/40 bg-info/10 rounded-md border p-2">
					<Text className="flex-1 text-sm">{suggestionText(t, suggestion, avg)}</Text>
					<Button size="sm" onPress={() => onApply(suggestion)}>
						<ButtonText>{t('settings.barcode_test_apply', { defaultValue: 'Apply' })}</ButtonText>
					</Button>
				</HStack>
			))}

			{analysis.shiftMangled ? (
				<View className="border-destructive/40 bg-destructive/10 rounded-md border p-2">
					<Text className="text-destructive text-sm">
						{t('settings.barcode_test_shift_mangled', {
							defaultValue:
								'Scanner is sending Shift as separate keys — reconfigure it to a US-keyboard / no-modifier mode',
						})}
					</Text>
				</View>
			) : null}

			{analysis.trailingEnter ? (
				<Text className="text-muted-foreground text-xs">
					{t('settings.barcode_test_trailing_enter', {
						defaultValue: 'Trailing Enter detected and ignored — no suffix needed',
					})}
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
			defaultValue: 'Raise threshold to {value}ms — your scanner averages {avg}ms',
		});
	}
	if (suggestion.kind === 'lower-min-chars') {
		return t('settings.barcode_test_suggest_min_chars', {
			value: suggestion.value,
			defaultValue: 'Lower minimum length to {value} — this code is {value} characters',
		});
	}
	return t('settings.barcode_test_suggest_prefix', {
		value: suggestion.value,
		defaultValue: 'Strip leading "{value}" — set it as your prefix',
	});
}

function History({ history }: { history: TraceAnalysis[] }) {
	const t = useT();

	return (
		<VStack space="xs" testID="barcode-test-history">
			<Text className="text-sm font-medium">
				{t('settings.barcode_test_recent', { defaultValue: 'Recent attempts' })}
			</Text>
			{history.map((entry, index) => {
				const result = entry.detectedAsScan
					? entry.tooShort
						? t('settings.barcode_test_result_too_short', { defaultValue: 'too short' })
						: t('settings.barcode_test_result_scan', { defaultValue: 'scan' })
					: t('settings.barcode_test_result_typing', { defaultValue: 'typing' });
				const chipClass = entry.detectedAsScan
					? entry.tooShort
						? 'bg-warning/10 text-warning'
						: 'bg-success/10 text-success'
					: 'bg-muted text-muted-foreground';
				return (
					<HStack key={index} className="border-border rounded-md border p-2">
						<Text className="flex-1 font-mono text-sm" numberOfLines={1}>
							{entry.code || entry.raw || '—'}
						</Text>
						<Text className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass}`}>
							{result}
						</Text>
						<Text className="text-muted-foreground w-16 text-right text-xs">
							{Number.isFinite(entry.avgGapMs) ? `${Math.round(entry.avgGapMs)}ms` : '—'}
						</Text>
					</HStack>
				);
			})}
		</VStack>
	);
}
