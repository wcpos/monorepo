import * as React from 'react';
import { Platform, ScrollView, View, type ViewInstance } from 'react-native';

import { useIsPhone } from '@wcpos/components/lib/device';
import { Button } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { IconButton } from '@wcpos/components/icon-button';
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
import { ClosureList } from './closure-list';
import { RemoteSessionCard, SessionCard } from './session-card';
import { SessionCards } from './session-cards';
import { type ClosureScope, useClosureRows } from './use-closure-rows';

export function Closures({
	scope: requested,
	initialClosureId,
	onClose,
}: {
	scope: ClosureScope;
	initialClosureId?: string;
	onClose?: () => void;
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
	const binding = useRegisterBinding();
	const directory = useRegisterDirectory(scope.storeId);
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
	if (row && phone)
		return (
			<ClosurePanel
				key={row.id}
				row={row}
				onRecountSaved={() => void refreshRow(row)}
				onClose={close}
			/>
		);
	return (
		<View ref={registerContainer} testID="reports-closures" className="min-h-0 flex-1 flex-row">
			<ScrollView className="flex-1" contentContainerClassName={cn(ground.gap, ground.p)}>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton
							name="more"
							testID="closures-overflow"
							accessibilityLabel={t('reports.more')}
							className="self-end"
						/>
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
				{!scope.registerId ? (
					<SessionCards
						key={scope.storeId}
						registers={directory.registers}
						storeId={scope.storeId}
						localRegisterId={scope.storeId === store.id ? binding.registerId : undefined}
					/>
				) : (
					<>
						{scope.storeId === store.id &&
							(!scope.registerId || scope.registerId === binding.registerId) && <SessionCard />}
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
					</>
				)}

				{status !== 'ready' && (
					<Text testID={`closures-${status}`}>
						{status === 'unavailable'
							? t('reports.unavailable_offline')
							: status === 'denied'
								? t('reports.no_access')
								: status === 'error'
									? t('reports.load_failed')
									: t('common.loading')}
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
						onPress={loadMore}
					>
						{status === 'error' ? t('common.retry') : t('reports.load_more')}
					</Button>
				)}
			</ScrollView>
			{row ? (
				<ClosurePanel
					key={row.id}
					row={row}
					onRecountSaved={() => void refreshRow(row)}
					onClose={close}
				/>
			) : (
				!phone && (
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
