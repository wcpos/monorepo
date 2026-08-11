import * as React from 'react';
import { Platform, ScrollView, Share, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Loader } from '@wcpos/components/loader';
import { Suspense } from '@wcpos/components/suspense';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import { useQueryRuntime } from '@wcpos/query';
import { isVerboseDiagnostics } from '@wcpos/utils/logger';

import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import {
	QueryStateProvider,
	useLogsBinding,
	useQueryState,
	useQueryStateActions,
} from '../../../query';
import { QuerySearchInput } from '../components/query-search-input';
import { Chip, type LevelKind, Stat, StatHeader } from '../health/components';
import { useNowMs, useRelativeTime } from '../health/use-relative-time';
import { useEngineStatus, useMutationCounts } from '../hooks/use-engine-monitor';
import { Ledger, useLevelLabel } from './ledger';
import {
	buildDebugInfo,
	formatCadence,
	type LogPreset,
	type LogRow,
	presetFilters,
	shouldExtendLedger,
} from './logs-logic';
import { useLogStats } from './use-log-stats';
import { useVerboseDiagnostics } from './use-verbose-diagnostics';

const LOGS_PAGE_SIZE = 20;
const NOW_TICK_MS = 5_000;

type LogsCollectionLike = {
	find(query: {
		selector: Record<string, unknown>;
		sort: Record<string, 'asc' | 'desc'>[];
		limit: number;
	}): { exec(): Promise<{ toJSON(): LogRow }[]> };
};

/**
 * The live line the retired grey "Sync status" box collapses into: watching
 * state, last check, and the cadence currently in effect — straight from the
 * engine's change-signal lane.
 * NOTE — deferred: the spec's live idle-check feed (§4 recent-checks ring) is
 * not produced yet; when the ring lands it feeds this line and a live top row.
 */
function StatusLine() {
	const t = useT();
	const status = useEngineStatus();
	const nowMs = useNowMs(NOW_TICK_MS);
	const relative = useRelativeTime();

	const lane = status.lanes['change-signal'];
	const lastTick = lane?.lastTick ?? null;
	// The armed next-due boundary is the only honest schedule signal the facade
	// exposes: `nextDueAtMs − lastTick.atMs` under-reports the cadence (the
	// timer arms BEFORE a tick runs, lastTick lands after it finishes), so this
	// line shows the countdown to the next check instead of claiming a rate.
	const nextCheck =
		lane?.nextDueAtMs !== undefined ? formatCadence(lane.nextDueAtMs - nowMs) : null;

	const watching =
		lastTick === null
			? t('health.database.first_check_pending')
			: lastTick.status === 'error'
				? t('health.database.last_check_error')
				: t('health.logs.watching', {
						ago: relative(lastTick.atMs, nowMs),
					});
	const cadenceText =
		nextCheck === null
			? null
			: nextCheck.unit === 's'
				? t('health.logs.next_check_s', { n: nextCheck.value })
				: t('health.logs.next_check_min', {
						n: nextCheck.value,
					});

	return (
		<HStack testID="logs-status-line" className="items-center gap-1.5">
			<View
				className={
					lastTick?.status === 'error'
						? 'bg-warning h-2 w-2 rounded-full'
						: 'bg-success h-2 w-2 rounded-full'
				}
			/>
			<Text className="text-muted-foreground text-xs">
				{cadenceText ? `${watching} · ${cadenceText}` : watching}
			</Text>
		</HStack>
	);
}

function LogsScreenContent() {
	const t = useT();
	const state = useQueryState<'logs'>();
	const actions = useQueryStateActions<'logs'>();
	const binding = useLogsBinding(state);
	const runtime = useQueryRuntime();
	const status = useEngineStatus();
	const stats = useLogStats();
	const mutations = useMutationCounts();
	const { appVersion } = useAppInfo();
	const { verbose, setVerbose } = useVerboseDiagnostics();
	const [preset, setPreset] = React.useState<LogPreset>('all');

	const logsCollection = (runtime.localDB as { collections?: Record<string, unknown> })?.collections
		?.logs as LogsCollectionLike | undefined;

	const applyFilters = React.useCallback(
		(nextPreset: LogPreset, verboseOn: boolean) => {
			const filters = presetFilters(nextPreset, verboseOn);
			if (filters.level) actions.setFilter('level', filters.level);
			else actions.clearFilter('level');
			if (filters.category_prefix) actions.setFilter('category_prefix', filters.category_prefix);
			else actions.clearFilter('category_prefix');
			if (filters.has_actor) actions.setFilter('has_actor', true);
			else actions.clearFilter('has_actor');
		},
		[actions]
	);

	const applyPreset = React.useCallback(
		(next: LogPreset) => {
			setPreset(next);
			applyFilters(next, verbose);
		},
		[applyFilters, verbose]
	);

	const toggleVerbose = React.useCallback(() => {
		setVerbose(!verbose);
	}, [setVerbose, verbose]);

	// A1.5: the LEVEL-pill kind filter composes with the preset (it never
	// resets it); tapping the active pill — or the clearable chip — clears it.
	const activeKind = state.filters.kind;
	const levelLabel = useLevelLabel();
	const toggleKind = React.useCallback(
		(kind: LevelKind) => {
			if (state.filters.kind === kind) actions.clearFilter('kind');
			else actions.setFilter('kind', kind);
		},
		[actions, state.filters.kind]
	);

	// A1.4: infinite scroll replaces "Show more". The guard is pure
	// (shouldExtendLedger) and the ref carries the #1132 phantom-trigger
	// protection: one extend per materialized window.
	const total = useObservableState(binding.total$, 0);
	const lastExtendLimitRef = React.useRef<number | null>(null);
	const handleScroll = React.useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
			const extend = shouldExtendLedger({
				offsetY: contentOffset.y,
				contentHeight: contentSize.height,
				viewportHeight: layoutMeasurement.height,
				limit: state.limit,
				total,
				lastExtendLimit: lastExtendLimitRef.current,
			});
			if (extend) {
				lastExtendLimitRef.current = state.limit;
				actions.extendLimit();
			}
		},
		[actions, state.limit, total]
	);

	// Effect (last resort per project.mdc): `verbose` can flip OUTSIDE any
	// event handler — the logger's 24 h TTL expires while the screen is mounted
	// (surfaced by the hook's poll) — and the ledger's level filter must follow
	// or debug rows keep showing after persistence stopped. Handles the manual
	// toggle too, so the filter logic lives in exactly one place.
	// Ref updated in its own effect — the compiler forbids ref writes in render.
	const presetRef = React.useRef(preset);
	React.useEffect(() => {
		presetRef.current = preset;
	});
	const isFirstVerboseRun = React.useRef(true);
	React.useEffect(() => {
		if (isFirstVerboseRun.current) {
			isFirstVerboseRun.current = false;
			return;
		}
		applyFilters(presetRef.current, verbose);
	}, [applyFilters, verbose]);

	// Web/Electron copy to clipboard; native delivers via the share sheet (the
	// spec §7 delivery channel for mobile — RN has no browser Clipboard API).
	const canShare = Platform.OS !== 'web';
	const canCopy = !canShare && typeof navigator !== 'undefined' && !!navigator.clipboard;
	// NOTE — deferred: "Export diagnostics…" (ZIP bundle) ships with the export
	// workstream (spec §7). No button until it exists — no dead buttons.
	const handleCopy = React.useCallback(async () => {
		try {
			const docs = logsCollection
				? await logsCollection
						.find({
							selector: { level: { $eq: 'error' } },
							sort: [{ timestamp: 'desc' }],
							limit: 10,
						})
						.exec()
				: [];
			const lane = status.lanes['change-signal'];
			const text = buildDebugInfo({
				generatedAt: new Date().toISOString(),
				appVersion,
				connectivity: status.connectivity,
				eventsToday: stats.eventsToday,
				errorsToday: stats.errorsToday,
				changesWaiting: mutations.pending,
				stuckRecords: stats.stuck,
				verboseDiagnostics: verbose,
				lastCheck: lane?.lastTick ?? null,
				recentErrors: docs.map((doc) => doc.toJSON()),
			});
			if (canShare) {
				// The share sheet is its own confirmation UI — no toast on this path.
				await Share.share({ message: text });
				return;
			}
			await navigator.clipboard.writeText(text);
			Toast.show({
				type: 'success',
				text1: t('health.logs.debug_copied'),
			});
		} catch {
			Toast.show({
				type: 'error',
				text1: t('health.logs.debug_copy_failed'),
			});
		}
	}, [appVersion, canShare, logsCollection, mutations.pending, stats, status, t, verbose]);

	return (
		<ScrollView className="flex-1" onScroll={handleScroll} scrollEventThrottle={64}>
			<VStack testID="screen-logs" className="mx-auto w-full max-w-4xl gap-3 p-4 md:p-6">
				<StatusLine />

				<StatHeader
					testID="logs-stats"
					actions={
						canCopy || canShare ? (
							<Button
								variant="outline"
								size="sm"
								testID="logs-copy-debug"
								onPress={() => void handleCopy()}
							>
								<ButtonText>
									{canShare ? t('health.logs.share_debug') : t('health.logs.copy_debug')}
								</ButtonText>
							</Button>
						) : null
					}
				>
					<Stat
						value={stats.eventsToday}
						label={t('health.logs.events_today')}
						onPress={() => applyPreset('all')}
						testID="logs-stat-events"
					/>
					<Stat
						value={stats.errorsToday}
						tone={stats.errorsToday > 0 ? 'bad' : 'default'}
						label={t('health.logs.errors_today')}
						onPress={() => applyPreset('errors')}
						testID="logs-stat-errors"
					/>
					<Stat
						value={stats.stuck.length}
						tone={stats.stuck.length > 0 ? 'bad' : 'good'}
						label={t('health.logs.stuck_records')}
						// Sync preset, not Errors: stuck rows are sync-domain terminal rows
						// that can persist at WARN level — the error-only filter would hide
						// the very rows this number counts.
						onPress={() => applyPreset('sync')}
						testID="logs-stat-stuck"
					/>
					<Stat
						value={mutations.pending}
						tone={mutations.pending > 0 ? 'bad' : 'good'}
						label={t('health.database.waiting_to_send')}
						testID="logs-stat-waiting"
					/>
				</StatHeader>

				<QuerySearchInput
					collectionName="logs"
					placeholder={t('logs.search_logs')}
					testID="search-logs"
				/>

				<HStack className="flex-wrap items-center gap-2">
					<Chip on={preset === 'all'} onPress={() => applyPreset('all')} testID="logs-chip-all">
						{t('health.logs.preset_all')}
					</Chip>
					<Chip
						on={preset === 'actions'}
						onPress={() => applyPreset('actions')}
						testID="logs-chip-actions"
					>
						{t('health.logs.preset_actions')}
					</Chip>
					<Chip
						on={preset === 'errors'}
						onPress={() => applyPreset('errors')}
						testID="logs-chip-errors"
					>
						{t('health.logs.preset_errors')}
					</Chip>
					<Chip on={preset === 'sync'} onPress={() => applyPreset('sync')} testID="logs-chip-sync">
						{t('health.logs.preset_sync')}
					</Chip>
					{activeKind ? (
						<Chip on onPress={() => actions.clearFilter('kind')} testID="logs-chip-kind">
							{`${levelLabel(activeKind)} ×`}
						</Chip>
					) : null}
					<View className="flex-1" />
					<Chip on={verbose} onPress={toggleVerbose} testID="logs-chip-verbose">
						{verbose ? t('health.logs.verbose_on') : t('health.logs.verbose_off')}
					</Chip>
				</HStack>

				<ErrorBoundary>
					<Suspense
						fallback={
							<View className="items-center py-8">
								<Loader />
							</View>
						}
					>
						<Ledger
							resource={binding.resource}
							total$={binding.total$}
							activeKind={activeKind}
							onKindPress={toggleKind}
						/>
					</Suspense>
				</ErrorBoundary>
			</VStack>
		</ScrollView>
	);
}

/**
 * Store health · Logs — the flat ledger (approved mockup v3, ticket #843).
 * One durable stream, presets instead of level pickers, inline error detail
 * built from the error catalogue.
 */
export function LogsScreen() {
	return (
		<QueryStateProvider
			collection="logs"
			initialPageSize={LOGS_PAGE_SIZE}
			initialSort={{ field: 'timestamp', direction: 'desc' }}
			initialFilters={presetFilters('all', isVerboseDiagnostics())}
		>
			<LogsScreenContent />
		</QueryStateProvider>
	);
}
