import * as React from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';
import { Slider } from '@wcpos/components/slider';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { useT } from '@wcpos/core/contexts/translations';
import { useLocalMutation } from '@wcpos/core/screens/main/hooks/mutations/use-local-mutation';
import { useEngineStatus } from '@wcpos/core/screens/main/hooks/use-engine-monitor';

import { getMetricsBuckets } from '../../lib/metrics';
import { presetFor, type PresetName, PRESETS, summarizeLast24h } from './performance-logic';
import { TrendLine } from './trend-line';

const HOW_WE_MEASURE_URL =
	'https://github.com/wcpos/woo-rxdb-replication-lab/blob/main/docs/experiments/2026-06-29-pull-cost-at-scale.md';

/**
 * Store health · Performance — what the POS asks of the server, the #559
 * tuning controls, and the tested-efficiency evidence. Approved design:
 * docs/mockups/2026-07-16-health-performance-page.html (rev 2, simplified).
 * Lives in apps/main because the measured actuals (hourly metrics buckets)
 * are host-level state.
 */
export function PerformanceScreen() {
	const t = useT();
	const { store } = useAppState();
	const { localPatch } = useLocalMutation();
	const status = useEngineStatus();

	const storedCheckIntervalMs =
		(useObservableEagerState(store.sync_check_interval_ms$) as number | undefined) ?? 10_000;
	const storedPullBatchSize =
		(useObservableEagerState(store.sync_pull_batch_size$) as number | undefined) ?? 50;

	// The buckets are plain module state — re-read on a slow tick so the page
	// stays current without a reactive seam the metrics module doesn't have.
	// The clock rides the same snapshot (render must stay pure).
	const [snapshot, setSnapshot] = React.useState(() => ({
		buckets: getMetricsBuckets(),
		nowMs: Date.now(),
	}));
	React.useEffect(() => {
		const interval = setInterval(
			() => setSnapshot({ buckets: getMetricsBuckets(), nowMs: Date.now() }),
			10_000
		);
		return () => clearInterval(interval);
	}, []);

	const summary = summarizeLast24h(snapshot.buckets, snapshot.nowMs);
	const hasHistory = summary.requests > 0;
	const hasLoadSamples = summary.recent.some((bucket) => bucket.loadMax !== undefined);
	// Health is the engine's CURRENT state — gating, bootstrap failures, lane
	// errors — not the 24h transport tally (one recovered blip shouldn't scold
	// for a day, and a parse failure isn't a transport error).
	const laneTrouble = Object.values(status.lanes).some((lane) => lane.lastError !== null);
	const healthy =
		status.connectivity === 'online' &&
		status.gatedBy === null &&
		Object.keys(status.bootstrapFailed).length === 0 &&
		!laneTrouble;

	// Draft values render instantly during a drag; the store write (and the
	// engine re-arm it triggers) lands once the hand settles — persisting every
	// slider step would spam RxDB writes and keep re-arming the poll timer.
	const [draft, setDraft] = React.useState<{
		sync_check_interval_ms?: number;
		sync_pull_batch_size?: number;
	}>({});
	const persistTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const persist = async (data: {
		sync_check_interval_ms?: number;
		sync_pull_batch_size?: number;
	}) => {
		// The SyncConfigBridge observes these fields and re-arms the engine live.
		await localPatch({ document: store, data });
	};

	const persistDebounced = (data: {
		sync_check_interval_ms?: number;
		sync_pull_batch_size?: number;
	}) => {
		setDraft((prev) => ({ ...prev, ...data }));
		if (persistTimer.current !== null) clearTimeout(persistTimer.current);
		persistTimer.current = setTimeout(() => {
			persistTimer.current = null;
			setDraft((prev) => {
				void persist(prev);
				return {};
			});
		}, 400);
	};
	React.useEffect(
		() => () => {
			if (persistTimer.current !== null) clearTimeout(persistTimer.current);
		},
		[]
	);

	const checkIntervalMs = draft.sync_check_interval_ms ?? storedCheckIntervalMs;
	const pullBatchSize = draft.sync_pull_batch_size ?? storedPullBatchSize;

	const preset = presetFor(checkIntervalMs, pullBatchSize);
	const requestsPerDay = Math.round((86_400_000 / checkIntervalMs) * 10) / 10;

	const applyPreset = (name: PresetName) =>
		persist({
			sync_check_interval_ms: PRESETS[name].checkIntervalMs,
			sync_pull_batch_size: PRESETS[name].pullBatchSize,
		});

	return (
		<ScrollView className="flex-1">
			<VStack testID="screen-health-performance" className="max-w-3xl gap-4 p-4 md:p-6">
				{/* One status line */}
				<HStack className="flex-wrap items-baseline gap-2">
					<Text className={healthy ? 'text-success font-semibold' : 'text-warning font-semibold'}>
						{healthy
							? t('health.performance.status_normal', '✓ Normal')
							: t('health.performance.status_attention', '⚠ Needs attention')}
					</Text>
					<Text className="text-muted-foreground text-sm" testID="performance-summary">
						{hasHistory
							? t(
									'health.performance.summary',
									'— last 24 h: {requests} requests · {mb} MB{typical}',
									{
										requests: summary.requests.toLocaleString(),
										mb: summary.megabytes.toFixed(1),
										typical:
											summary.typicalMs !== null
												? ` · ${t('health.performance.typical_response', 'typical response {ms} ms', { ms: summary.typicalMs })}`
												: '',
									}
								)
							: t(
									'health.performance.no_history',
									'— no history yet. These numbers fill in as this till runs; the controls below work now.'
								)}
					</Text>
				</HStack>

				{/* Sync controls — the #559 contract */}
				<Card>
					<CardHeader className="pb-2">
						<HStack className="items-center justify-between">
							<CardTitle>{t('health.performance.sync', 'Sync')}</CardTitle>
							{preset === 'custom' ? (
								<Text
									testID="preset-custom-chip"
									className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
								>
									{t('health.performance.custom', 'Custom')}
								</Text>
							) : null}
						</HStack>
					</CardHeader>
					<CardContent className="gap-4">
						<RadioGroup
							value={preset === 'custom' ? '' : preset}
							onValueChange={(value) => applyPreset(value as PresetName)}
						>
							<HStack className="flex-wrap gap-4">
								{(
									[
										[
											'eco',
											t('health.performance.eco', 'Eco'),
											t('health.performance.eco_desc', 'checks every 60 s · gentlest'),
										],
										[
											'balanced',
											t('health.performance.balanced', 'Balanced'),
											t('health.performance.balanced_desc', 'checks every 10 s · default'),
										],
										[
											'realtime',
											t('health.performance.realtime', 'Realtime'),
											t('health.performance.realtime_desc', 'checks every 5 s · freshest'),
										],
									] as const
								).map(([value, label, description]) => (
									<HStack key={value} className="items-center gap-2">
										<RadioGroupItem value={value} aria-labelledby={`preset-${value}`} />
										<VStack className="gap-0">
											<Label nativeID={`preset-${value}`}>{label}</Label>
											<Text className="text-muted-foreground text-xs">{description}</Text>
										</VStack>
									</HStack>
								))}
							</HStack>
						</RadioGroup>

						<VStack className="gap-1">
							<HStack className="items-baseline justify-between">
								<Text className="font-medium">
									{t('health.performance.check_frequency', 'Check for changes')}
								</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.every_s', 'every {s} s', {
										s: Math.round(checkIntervalMs / 1000),
									})}
								</Text>
								<Text className="text-muted-foreground text-xs">5 s – 5 min</Text>
							</HStack>
							<View testID="check-interval-slider">
								<Slider
									value={checkIntervalMs}
									min={5_000}
									max={300_000}
									step={5_000}
									onValueChange={(value: number) =>
										persistDebounced({ sync_check_interval_ms: value })
									}
								/>
							</View>
						</VStack>

						<VStack className="gap-1">
							<HStack className="items-baseline justify-between">
								<Text className="font-medium">
									{t('health.performance.records_per_request', 'Records per request')}
								</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.up_to_n', 'up to {n}', { n: pullBatchSize })}
								</Text>
								<Text className="text-muted-foreground text-xs">10 – 100</Text>
							</HStack>
							<View testID="pull-batch-slider">
								<Slider
									value={pullBatchSize}
									min={10}
									max={100}
									step={5}
									onValueChange={(value: number) =>
										persistDebounced({ sync_pull_batch_size: value })
									}
								/>
							</View>
						</VStack>

						<HStack className="flex-wrap items-center justify-between gap-2">
							<Text className="text-muted-foreground text-sm" testID="settings-math-line">
								{t(
									'health.performance.math_line',
									'At these settings: ~{perDay} requests per day',
									{
										perDay: Math.round(requestsPerDay).toLocaleString(),
									}
								)}
							</Text>
							<Button variant="outline" size="sm" onPress={() => void applyPreset('balanced')}>
								<ButtonText>{t('health.performance.reset', 'Reset to Balanced')}</ButtonText>
							</Button>
						</HStack>
					</CardContent>
				</Card>

				{/* Your server, over time — two aligned trends */}
				<Card>
					<CardHeader className="pb-2">
						<CardTitle>
							{t('health.performance.server_over_time', 'Your server, over time')}
						</CardTitle>
						<Text className="text-muted-foreground text-xs">
							{t(
								'health.performance.server_over_time_note',
								'Server load is everything running on it — not just the POS.'
							)}
						</Text>
					</CardHeader>
					<CardContent className="gap-3">
						{hasLoadSamples ? (
							<TrendLine
								testID="server-load-trend"
								label={t('health.performance.server_load', 'server load')}
								points={summary.recent
									.filter((bucket) => bucket.loadMax !== undefined)
									.map((bucket) => ({ x: bucket.hourStartMs, y: bucket.loadMax as number }))}
								tone="neutral"
							/>
						) : (
							<Text className="text-muted-foreground text-sm" testID="server-load-unavailable">
								{t(
									'health.performance.load_unavailable',
									"Your server doesn't report its load. Everything else on this page still works."
								)}
							</Text>
						)}
						{hasHistory ? (
							<TrendLine
								testID="pos-requests-trend"
								label={t('health.performance.pos_requests', 'POS requests · same period')}
								points={summary.recent.map((bucket) => ({
									x: bucket.hourStartMs,
									y: bucket.requests,
								}))}
								tone="accent"
							/>
						) : null}
						{hasHistory && summary.serverMinutes !== null ? (
							<Text className="text-muted-foreground text-sm">
								{t(
									'health.performance.total_cost',
									'Total cost to your server in the last 24 hours: {minutes} minutes of server time.',
									{ minutes: summary.serverMinutes }
								)}
							</Text>
						) : null}
					</CardContent>
				</Card>

				{/* One evidence sentence */}
				<Text className="text-muted-foreground text-sm">
					{t(
						'health.performance.evidence',
						'Tested on live stores: a 50,000-product store is ready to sell in 3.2 s, and a caught-up check is 216 bytes —'
					)}{' '}
					<Text
						className="text-primary text-sm"
						role="link"
						onPress={() => void Linking.openURL(HOW_WE_MEASURE_URL)}
					>
						{t('health.performance.how_we_measure', 'how we measure ›')}
					</Text>
				</Text>

				{/* Diagnostics readout (#559) */}
				<Text className="text-muted-foreground font-mono text-xs" testID="effective-settings">
					{t(
						'health.performance.effective',
						'checking every {s} s · up to {n} records/request · preset: {preset}',
						{
							s: Math.round(checkIntervalMs / 1000),
							n: pullBatchSize,
							preset: preset === 'custom' ? t('health.performance.custom', 'Custom') : preset,
						}
					)}
				</Text>
				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
