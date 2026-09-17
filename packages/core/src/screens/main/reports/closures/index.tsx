import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@wcpos/components/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { Text } from '@wcpos/components/text';

import { useTheme } from '../../../../contexts/theme';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useRegisterNames } from '../../../../services/register/use-register-names';
import { exportCsv } from './export-csv';
import { saveOrShareCsv } from './save-or-share-csv';
import { ClosurePanel } from './closure-panel';
import { ClosureList } from './closure-list';
import { SessionCard } from './session-card';
import { type ClosureScope, useClosureRows } from './use-closure-rows';

export function Closures({
	scope,
	initialClosureId,
}: {
	scope: ClosureScope;
	initialClosureId?: string;
}) {
	const rows = useClosureRows(scope);
	const [selected, setSelected] = React.useState<string | null>(initialClosureId ?? null);
	const row = rows.find((row) => row.id === selected);
	const { store } = useStoreSession();
	const binding = useRegisterBinding();
	const { screenSize } = useTheme();
	const t = useT();
	const names = useRegisterNames();
	const [error, setError] = React.useState('');
	if (row && screenSize === 'sm')
		return <ClosurePanel key={row.id} row={row} onClose={() => setSelected(null)} />;
	return (
		<View testID="reports-closures" className="flex-1 flex-row">
			<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button testID="closures-overflow" variant="ghost" className="min-h-12 self-end">
							{t('reports.more')}
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
					(!scope.registerId || scope.registerId === binding.registerId) && <SessionCard />}
				<ClosureList rows={rows} onSelect={(row) => setSelected(row.id)} />
			</ScrollView>
			{row ? (
				<ClosurePanel key={row.id} row={row} onClose={() => setSelected(null)} />
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
		</View>
	);
}
