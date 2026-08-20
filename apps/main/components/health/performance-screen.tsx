import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { useObservableEagerState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { cn } from '@wcpos/components/lib/utils';
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
	requestsPerHour,
	summarizeLast24h,
} from './performance-logic';
import { TrendLine } from './trend-line';
import { UptimeStrip } from './uptime-strip';

const DOCS_URL = 'https://docs.wcpos.com/products/sync';

/** Load averages read best with a consistent decimal; counts use locale formatting. */
const formatLoad = (value: number) =>
	value.toLocaleString(undefined, {
		minimumFractionDigits: 1,
		maximumFractionDigits: value >= 10 ? 1 : 2,
	});
const formatCount = (value: number) => value.toLocaleString();

/**
 * Store health · Performance — what the POS asks of the server and the #559
 * tuning controls. Layout follows the settings pages: centered max-w column
 * with generous padding. Lives in apps/main because the measured actuals
 * (hourly metrics buckets) are host-level state.
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
	const hourlyRequests = requestsPerHour(checkIntervalMs);
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

	// Cadence straight off the preset table (#908) — the card can never drift
	// from the interval the radio actually applies. The batch size a preset
	// applies stays visible too: selecting a card moves the sliders below.
	const describeCadence = (name: PresetName) => {
		const { intervalSeconds } = presetBudget(name);
		return intervalSeconds >= 60
			? t('health.performance.checks_every_min', { m: Math.round(intervalSeconds / 60) })
			: t('health.performance.checks_every_s', { s: intervalSeconds });
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
			<VStack
				testID="screen-health-performance"
				className="mx-auto w-full max-w-4xl gap-6 px-4 py-6 md:px-10 md:py-8"
			>
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
					sub={t('health.performance.sync_sub')}
				>
					<VStack className="gap-5">
						<RadioGroup
							value={preset === 'custom' ? '' : preset}
							onValueChange={(value) => applyPreset(value as PresetName)}
						>
							<HStack className="flex-wrap items-stretch gap-3">
								{(
									[
										['eco', t('health.performance.eco'), t('health.performance.eco_hint')],
										[
											'balanced',
											t('health.performance.balanced'),
											t('health.performance.balanced_hint'),
										],
										[
											'realtime',
											t('health.performance.realtime'),
											t('health.performance.realtime_hint'),
										],
									] as const
								).map(([value, label, hint]) => (
									<View
										key={value}
										testID={`preset-${value}`}
										className={cn(
											'min-w-40 flex-1 rounded-lg border p-3',
											preset === value ? 'border-primary bg-primary/5' : 'border-border'
										)}
									>
										<HStack className="items-center gap-2">
											<RadioGroupItem value={value} aria-labelledby={`preset-${value}-label`} />
											<Label nativeID={`preset-${value}-label`} className="font-medium">
												{label}
											</Label>
										</HStack>
										<VStack className="gap-0.5 pt-1.5">
											<Text className="text-sm">{hint}</Text>
											<Text className="text-muted-foreground text-xs">
												{describeCadence(value)}
											</Text>
										</VStack>
									</View>
								))}
							</HStack>
						</RadioGroup>

						<VStack className="gap-1.5">
							<HStack className="items-baseline justify-between">
								<Text className="font-medium">{t('health.performance.check_frequency')}</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.every_s', {
										s: Math.round(checkIntervalMs / 1000),
									})}
								</Text>
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
							<HStack className="justify-between">
								<Text className="text-muted-foreground text-xs">
									{t('health.performance.seconds_short', { s: 5 })}
								</Text>
								<Text className="text-muted-foreground text-xs">
									{t('health.performance.minutes_short', { m: 5 })}
								</Text>
							</HStack>
						</VStack>

						<VStack className="gap-1.5">
							<HStack className="items-baseline justify-between">
								<Text className="font-medium">{t('health.performance.records_per_request')}</Text>
								<Text className="text-primary font-semibold">
									{t('health.performance.up_to_n', { n: pullBatchSize })}
								</Text>
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
							<HStack className="justify-between">
								<Text className="text-muted-foreground text-xs">10</Text>
								<Text className="text-muted-foreground text-xs">100</Text>
							</HStack>
						</VStack>

						<HStack className="flex-wrap items-center justify-between gap-2">
							<Text className="text-muted-foreground text-sm" testID="settings-math-line">
								{nextCheck !== null
									? `${t('health.performance.right_now', {
											every:
												nextCheck.unit === 's' ? `${nextCheck.value} s` : `${nextCheck.value} min`,
										})} · ${t('health.performance.math_line_hourly', {
											perHour: hourlyRequests.toLocaleString(),
										})}`
									: t('health.performance.math_line_hourly', {
											perHour: hourlyRequests.toLocaleString(),
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
					<VStack className="gap-5">
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
								formatValue={formatLoad}
							/>
						)}
						{/* Always mounted — the frame holds the page's shape from the first
						    render and says "not enough data yet" until it can draw. */}
						<TrendLine
							testID="pos-requests-trend"
							label={t('health.performance.pos_requests')}
							points={summary.requestPoints}
							tone="accent"
							formatValue={formatCount}
						/>
					</VStack>
				</Section>

				{/* One link out — everything deeper lives in the docs */}
				<DocsLink testID="performance-docs-link" href={DOCS_URL}>
					{t('health.performance.learn_more_in_docs')}
				</DocsLink>
				<View className="h-4" />
			</VStack>
		</ScrollView>
	);
}
