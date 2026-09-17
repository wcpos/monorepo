import * as React from 'react';
import { Platform, ScrollView, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Icon } from '@wcpos/components/icon';
import { PortalHost } from '@wcpos/components/portal';
import { registerPortalContainer } from '@wcpos/components/lib/portal-container';
import { Text } from '@wcpos/components/text';

import { useTheme } from '../../../../contexts/theme';
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
import { ClosureList } from './closure-list';
import { RemoteSessionCard, SessionCard } from './session-card';
import { type ClosureScope, useClosureRows } from './use-closure-rows';

export function Closures({
	scope: requested,
	initialClosureId,
}: {
	scope: ClosureScope;
	initialClosureId?: string;
}) {
	const { rows, scope, status, hasMore, loadMore, refreshRow, unavailableIds } =
		useClosureRows(requested);
	const [selected, setSelected] = React.useState<string | null>(initialClosureId ?? null);
	const row = rows.find(
		(row) => row.id === selected && !unavailableIds.has(row.server_closure_id ?? row.id)
	);
	const { store } = useStoreSession();
	const binding = useRegisterBinding();
	const directory = useRegisterDirectory(scope.storeId);
	const { screenSize } = useTheme();
	const t = useT();
	const names = useRegisterNames();
	const [error, setError] = React.useState('');
	const lastKnownClosure = rows
		.filter(
			(row) =>
				row.register_id === binding.registerId &&
				!unavailableIds.has(row.server_closure_id ?? row.id)
		)
		.sort((a, b) => b.closed_at.localeCompare(a.closed_at))[0];
	const registerContainer = React.useCallback((node: View | null) => {
		registerPortalContainer(
			'reports',
			Platform.OS === 'web' ? (node as unknown as HTMLElement) : null
		);
	}, []);
	if (row && screenSize === 'sm')
		return (
			<ClosurePanel
				key={row.id}
				row={row}
				onRecountSaved={() => void refreshRow(row)}
				onClose={() => setSelected(null)}
			/>
		);
	return (
		<View ref={registerContainer} testID="reports-closures" className="min-h-0 flex-1 flex-row">
			<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							testID="closures-overflow"
							accessibilityLabel={t('reports.more')}
							variant="ghost"
							className="h-12 w-12 self-end p-0"
						>
							<Icon name="ellipsisVertical" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							testID="closures-export"
							className="min-h-12"
							onPress={async () => {
								setError('');
								try {
									await saveOrShareCsv(
										exportCsv(rows, t, names, store.name),
										`closures-${scope.from}-${scope.to}.csv`
									);
								} catch {
									setError(t('reports.export_failed'));
								}
							}}
						>
							<Text>{t('reports.export_csv')}</Text>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				{!!error && <Text testID="closures-export-error">{error}</Text>}
				{scope.storeId === store.id &&
					(!scope.registerId || scope.registerId === binding.registerId) && (
						<SessionCard lastKnownClosure={lastKnownClosure} />
					)}
				{directory.registers
					.filter(
						(register) =>
							(!scope.registerId || register.id === scope.registerId) &&
							!(scope.storeId === store.id && register.id === binding.registerId)
					)
					.map((register) => (
						<RemoteSessionCard
							key={`${scope.storeId}:${register.id}`}
							register={register}
							storeId={scope.storeId}
						/>
					))}
				{status !== 'ready' && (
					<Text testID={`closures-${status}`}>
						{t(
							status === 'unavailable'
								? 'reports.unavailable_offline'
								: status === 'denied'
									? 'reports.no_access'
									: status === 'error'
										? 'reports.load_failed'
										: 'common.loading'
						)}
					</Text>
				)}
				{(rows.length > 0 || status === 'ready') && (
					<ClosureList
						storeId={scope.storeId}
						rows={rows}
						unavailableIds={unavailableIds}
						onSelect={(row) => setSelected(row.id)}
					/>
				)}
				{(status === 'error' || hasMore) && (
					<Button
						testID={status === 'error' ? 'closures-retry' : 'closures-load-more'}
						variant="outline"
						className="min-h-12"
						onPress={loadMore}
					>
						{t(status === 'error' ? 'common.retry' : 'reports.load_more')}
					</Button>
				)}
			</ScrollView>
			{row ? (
				<ClosurePanel
					key={row.id}
					row={row}
					onRecountSaved={() => void refreshRow(row)}
					onClose={() => setSelected(null)}
				/>
			) : (
				screenSize !== 'sm' && (
					<View
						testID="closure-panel-placeholder"
						className="bg-card w-1/3 items-center justify-center border-l p-4"
					>
						<Text className="text-muted-foreground">{t('reports.select_closure')}</Text>
					</View>
				)
			)}
			<PortalHost name="reports" />
		</View>
	);
}
