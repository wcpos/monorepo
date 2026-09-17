import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { useTheme } from '../../../../contexts/theme';
import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { ClosurePanel } from './closure-panel';
import { ClosureList } from './closure-list';
import { SessionCard } from './session-card';
import { type ClosureScope, useClosureRows } from './use-closure-rows';

export function Closures({ scope }: { scope: ClosureScope }) {
	const rows = useClosureRows(scope);
	const [selected, setSelected] = React.useState<string | null>(null);
	const row = rows.find((row) => row.id === selected);
	const { store } = useStoreSession();
	const binding = useRegisterBinding();
	const { screenSize } = useTheme();
	const t = useT();
	if (row && screenSize === 'sm')
		return <ClosurePanel key={row.id} row={row} onClose={() => setSelected(null)} />;
	return (
		<View testID="reports-closures" className="flex-1 flex-row">
			<ScrollView className="flex-1" contentContainerClassName="gap-4 p-4">
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
