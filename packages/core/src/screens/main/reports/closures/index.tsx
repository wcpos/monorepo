import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Button } from '@wcpos/components/button';
import { PortalHost } from '@wcpos/components/portal';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';
import { Text } from '@wcpos/components/text';
import { cn } from '@wcpos/components/lib/utils';
import { useGround } from '@wcpos/components/lib/ground';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import {
	useRegisterBinding,
	useRegisterDirectory,
} from '../../../../services/register/use-register-binding';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { exportCsv } from './export-csv';
import { saveOrShareCsv } from './save-or-share-csv';
import { ClosurePanel } from './closure-panel';
import { type ClosureFilter, ClosureList } from './closure-list';
import { RemoteSessionCard, SessionCard, type SessionSummary } from './session-card';
import { SessionCards } from './session-cards';
import { type ClosureScope, useClosureRows } from './use-closure-rows';

export function ClosuresExportButton({
	onPress,
	disabled = false,
}: {
	onPress: () => Promise<void>;
	disabled?: boolean;
}) {
	const t = useT();
	return (
		<Button
			testID="closures-export"
			variant="outline"
			leftIcon="document"
			disabled={disabled}
			onPress={onPress}
		>
			{t('reports.export_csv')}
		</Button>
	);
}

export function Closures({
	scope: requested,
	initialClosureId,
	onClose,
	renderScopeRow,
}: {
	scope: ClosureScope;
	initialClosureId?: string;
	onClose?: () => void;
	renderScopeRow?: (slots: { actions?: React.ReactNode }) => React.ReactNode;
}) {
	const { rows, localRows, scope, status, hasMore, loadMore, refreshRow, unavailableIds } =
		useClosureRows(requested);
	const [selected, setSelected] = React.useState<string | null>(initialClosureId ?? null);
	const close = () => {
		setSelected(null);
		onClose?.();
	};
	const selectedLocal = localRows.find((row) => row.id === selected);
	const selectedId = selectedLocal?.server_closure_id ?? selected;
	const row = rows.find(
		(row) =>
			(row.server_closure_id ?? row.id) === selectedId &&
			!unavailableIds.has(row.server_closure_id ?? row.id)
	);
	const { store } = useStoreSession();
	const sessionKey = `${scope.storeId}:${scope.registerId}`;
	const [resolved, setResolved] = React.useState({
		key: sessionKey,
		sessions: [] as SessionSummary[],
	});
	const sessions = resolved.key === sessionKey ? resolved.sessions : [];
	const setSessions = React.useCallback(
		(sessions: SessionSummary[]) => setResolved({ key: sessionKey, sessions }),
		[sessionKey]
	);
	const binding = useRegisterBinding();
	const directory = useRegisterDirectory(scope.storeId);
	const register = directory.registers.find((register) => register.id === scope.registerId);
	const phone = useIsPhone();
	const ground = useGround();
	const t = useT();
	const names = useRegisterNames();
	const [error, setError] = React.useState('');
	const registerContainer = React.useCallback((node: ViewInstance | null) => {
		registerPortalContainer(
			'reports',
			Platform.OS === 'web' ? (node as unknown as HTMLElement) : null
		);
	}, []);
	const exportRows = async () => {
		setError('');
		try {
			await saveOrShareCsv(
				exportCsv(rows, t, names, store.name),
				`closures-${scope.from}-${scope.to}.csv`
			);
		} catch {
			setError(t('reports.export_failed'));
		}
	};
	// The CSV holds closures; with Open selected nothing shown is a closure, so there is nothing to export.
	const [filter, setFilter] = React.useState<ClosureFilter>('all');
	const header = renderScopeRow?.({
		actions: <ClosuresExportButton onPress={exportRows} disabled={filter === 'open'} />,
	});
	if (row && phone)
		return (
			<>
				{header}
				<ClosurePanel
					key={row.id}
					row={row}
					onRecountSaved={() => void refreshRow(row)}
					onClose={close}
				/>
			</>
		);
	return (
		<View ref={registerContainer} testID="reports-closures" className="min-h-0 flex-1">
			{header}
			<ScrollView className="flex-1" contentContainerClassName={cn(ground.gap, ground.p)}>
				{!!error && <Text testID="closures-export-error">{error}</Text>}
				<ClosureList
					rows={rows}
					storeId={scope.storeId}
					sessions={sessions}
					scopeFrom={scope.from}
					scopeTo={scope.to}
					partial={hasMore}
					filter={filter}
					onFilterChange={setFilter}
					scopeDay={scope.from === scope.to ? scope.from : undefined}
					showEmpty={status === 'ready'}
					unavailableIds={unavailableIds}
					onSelect={(row) => setSelected(row.id)}
					sessionRows={
						!scope.registerId ? (
							<SessionCards
								key={scope.storeId}
								registers={directory.registers}
								storeId={scope.storeId}
								onSessions={setSessions}
								localRegisterId={scope.storeId === store.id ? binding.registerId : undefined}
							/>
						) : scope.storeId === store.id && scope.registerId === binding.registerId ? (
							<SessionCard onSessions={setSessions} />
						) : register ? (
							<RemoteSessionCard
								key={sessionKey}
								register={register}
								storeId={scope.storeId}
								onSessions={setSessions}
							/>
						) : null
					}

					status={
						status !== 'ready' && (
							<Text testID={`closures-${status}`}>
								{status === 'unavailable'
									? t('reports.unavailable_offline')
									: status === 'denied'
										? t('reports.no_access')
										: status === 'error'
											? t('reports.load_failed')
											: t('common.loading')}
							</Text>
						)
					}
					footer={
						(status === 'error' || hasMore) && (
							<View className="p-4">
								<Button
									testID={status === 'error' ? 'closures-retry' : 'closures-load-more'}
									variant="outline"
									className="w-full"
									onPress={loadMore}
								>
									{status === 'error' ? t('common.retry') : t('reports.load_more')}
								</Button>
							</View>
						)
					}
				/>
			</ScrollView>
			{row && (
				<ClosurePanel
					key={row.id}
					row={row}
					onRecountSaved={() => void refreshRow(row)}
					onClose={close}
				/>
			)}
			<PortalHost name="reports" />
		</View>
	);
}
