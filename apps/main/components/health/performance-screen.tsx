import * as React from 'react';
import { Linking, ScrollView, View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';
import { Slider } from '@wcpos/components/slider';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { useT } from '@wcpos/core/contexts/translations';
import { Section } from '@wcpos/core/screens/main/health/components';
import { formatCadence } from '@wcpos/core/screens/main/logs/logs-logic';
import { useLocalMutation } from '@wcpos/core/screens/main/hooks/mutations/use-local-mutation';
import { useEngineStatus } from '@wcpos/core/screens/main/hooks/use-engine-monitor';

import { getMetricsBuckets } from '../../lib/metrics';
import {
	DEFAULT_CHECK_INTERVAL_MS,
	DEFAULT_PULL_BATCH_SIZE,
	deriveUptimeCells,
	presetBudget,
	presetFor,
	type PresetName,
	PRESETS,
	summarizeLast24h,
} from './performance-logic';
import { TrendLine } from './trend-line';
import { UptimeStrip } from './uptime-strip';

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
		(useObservableEagerState(store.sync_check_interval_ms$) as number | undefined) ??
		DEFAULT_CHECK_INTERVAL_MS;
	const storedPullBatchSize =
		(useObservableEagerState(store.sync_pull_batch_size$) as number | undefined) ??
		DEFAULT_PULL_BATCH_SIZE;

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
	const hasLoadSamples = summary.loadPoints.length > 0;
	// Only a server we have actually talked to can be said to not report its
	// load — before the first request there is nothing to conclude, and telling
	// a merchant their server is deficient minutes after setup would be a guess.
	const loadUnavailable = hasHistory && !hasLoadSamples;
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
	const uptimeCells = deriveUptimeCells(snapshot.buckets, snapshot.nowMs);

	// The armed next-due boundary is the only honest schedule signal the facade
	// exposes: `nextDueAtMs − lastTick.atMs` under-reports the cadence (the
	// timer arms BEFORE a tick, lastTick lands after it finishes, and a manual
	// sync moves lastTick without rearming) — so show the countdown to the
	// next check instead of claiming a rate. Rides the 10 s snapshot clock.
	const changeLane = status.lanes['change-signal'];
	const nextCheck =
		changeLane?.nextDueAtMs !== undefined
			? formatCadence(changeLane.nextDueAtMs - snapshot.nowMs)
			: null;

	// Both budget lines, straight off the preset table (#908) — the description can never
	// drift from the numbers the radio actually applies.
	const describePreset = (name: PresetName) => {
		const { intervalSeconds, records } = presetBudget(name);
		const every =
			intervalSeconds >= 60
				? t('health.performance.every_min', {
						m: Math.round(intervalSeconds / 60),
					})
				: t('health.performance.every_s', { s: intervalSeconds });
		return `${every} · ${t('health.performance.n_records_per_request', {
			n: records,
		})}`;
	};

	const applyPreset = (name: PresetName) => {
		// Cancel any pending debounced draft so a stale slider write doesn't
		// overwrite the freshly-applied preset (greptile P1).
		if (persistTimer.current !== null) {
			clearTimeout(persistTimer.current);
			persistTimer.current = null;
		}
		setDraft({});
		void persist({
			sync_check_interval_ms: PRESETS[name].checkIntervalMs,
			sync_pull_batch_size: PRESETS[name].pullBatchSize,
		});
	};

	return (
		<ScrollView className="flex-1">
			<VStack testID="screen-health-performance" className="max-w-3xl gap-4 p-4 md:p-6">
				{/* One status line */}
				<HStack className="flex-wrap items-baseline gap-2">
					<Text className={healthy ? 'text-success font-semibold' : 'text-warning font-semibold'}>
						{healthy
							? t('health.performance.status_normal')
							: t('health.performance.status_attention')}
					</Text>
					<Text className="text-muted-foreground text-sm" testID="performance-summary">
						{hasHistory
							? t('health.performance.summary', {
									requests: summary.requests.toLocaleString(),
									mb: summary.megabytes.toFixed(1),
									typical:
										summary.typicalMs !== null
											? ` · ${t('health.performance.typical_response', { ms: summary.typicalMs })}`
											: '',
								})
							: t('health.performance.no_history')}
					</Text>
				</HStack>

				{/* Engine uptime — the sync engine's own hourly footprint */}
				<Section
					first
					testID="uptime-section"
					title={t('health.performance.uptime_title')}
					sub={t('health.performance.uptime_sub')}
				>
					<UptimeStrip cells={uptimeCells} />
				</Section>

				{/* Sync controls — the #559 contract */}
				<Section
					testID="sync-section"
					title={
						preset === 'custom'
							? `${t('health.performance.sync')} · ${t('health.performance.custom')}`
							: t('health.performance.sync')
					}
				>
					<VStack className="gap-4">
						<RadioGroup
							value={preset === 'custom' ? '' : preset}
							onValueChange={(value) => applyPreset(value as PresetName)}
						>
							<HStack className="flex-wrap gap-4">
								{(
									[
										['eco', t('health.performance.eco'), describePreset('eco')],
										[
											'balanced',
											t('health.performance.balanced'),
											`${describePreset('balanced')} · ${t('health.performance.default')}`,
										],
										['realtime', t('health.performance.realtime'), describePreset('realtime')],
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
								<Text className="font-medium">{t('health.performance.check_frequency')}</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.every_s', {
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
								<Text className="font-medium">{t('health.performance.records_per_request')}</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.up_to_n', { n: pullBatchSize })}
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
								{nextCheck !== null
									? `${t('health.performance.right_now', {
											every:
												nextCheck.unit === 's' ? `${nextCheck.value} s` : `${nextCheck.value} min`,
										})} · ${t('health.performance.math_line', {
											perDay: Math.round(requestsPerDay).toLocaleString(),
										})}`
									: t('health.performance.math_line', {
											perDay: Math.round(requestsPerDay).toLocaleString(),
										})}
							</Text>
							<Button variant="outline" size="sm" onPress={() => void applyPreset('balanced')}>
								<ButtonText>{t('health.performance.reset')}</ButtonText>
							</Button>
						</HStack>
					</VStack>
				</Section>

				{/* Your server, over time — two aligned trends */}
				<Section
					testID="server-over-time-section"
					title={t('health.performance.server_over_time')}
					sub={t('health.performance.server_over_time_note')}
				>
					<VStack className="gap-3">
						{/* Three states, kept distinct. Asked and never told = a missing
						    metric, so say so. Told once = a trend still filling in, and the
						    frame says so. Not yet asked = we know nothing about this server
						    yet, so claim nothing — the frame covers that too. */}
						{loadUnavailable ? (
							<Text className="text-muted-foreground text-sm" testID="server-load-unavailable">
								{t('health.performance.load_unavailable')}
							</Text>
						) : (
							<TrendLine
								testID="server-load-trend"
								label={t('health.performance.server_load')}
								points={summary.loadPoints}
								tone="neutral"
							/>
						)}
						{/* Always mounted — the frame holds the page's shape from the first
						    render and says "not enough data yet" until it can draw. */}
						<TrendLine
							testID="pos-requests-trend"
							label={t('health.performance.pos_requests')}
							points={summary.requestPoints}
							tone="accent"
						/>
						{hasHistory && summary.serverMinutes !== null ? (
							<Text className="text-muted-foreground text-sm">
								{t('health.performance.total_cost', { minutes: summary.serverMinutes })}
							</Text>
						) : null}
					</VStack>
				</Section>

				{/* One evidence sentence */}
				<Text className="text-muted-foreground text-sm">
					{t('health.performance.evidence')}{' '}
					<Text
						className="text-primary text-sm"
						role="link"
						onPress={() => void Linking.openURL(HOW_WE_MEASURE_URL)}
					>
						{t('health.performance.how_we_measure')}
					</Text>
				</Text>

				{/* Diagnostics readout (#559) */}
				<Text className="text-muted-foreground font-mono text-xs" testID="effective-settings">
					{t('health.performance.effective', {
						s: Math.round(checkIntervalMs / 1000),
						n: pullBatchSize,
						preset: preset === 'custom' ? t('health.performance.custom') : preset,
					})}
				</Text>
				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
