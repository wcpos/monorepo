import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Icon } from '@wcpos/components/icon';
import { ListRow } from '@wcpos/components/list-row';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';
import { useDateFormat } from '../../hooks/use-date-format';

function RegisterStatus({
	register: { session, last_closure },
}: {
	register: ReturnType<typeof useRegisterBinding>['registers'][number];
}) {
	const t = useT();
	const time = useDateFormat(session?.opened_at_gmt, 'p', false);
	const date = useDateFormat(last_closure?.closed_at_gmt, 'MMM d, p', false);
	const name = session?.opened_by.name || t('register.unknown_cashier');
	if (session?.status === 'open')
		return <StatusBadge variant="ok" label={t('register.open_since_by', { time, name })} />;
	if (session?.status === 'counting')
		return <StatusBadge variant="warning" label={t('register.counting_by', { name })} />;
	return (
		<StatusBadge
			variant="muted"
			label={
				last_closure?.closed_at_gmt
					? t('register.closed_last_closure', { number: last_closure.number, date })
					: t('register.closed')
			}
		/>
	);
}

export function RegisterPicker({ onBound }: { onBound?: () => void }) {
	const { registers, bind, refresh } = useRegisterBinding();
	const t = useT();
	// Refresh live sessions whenever the picker opens, without changing the binding or gate.
	React.useEffect(() => {
		void refresh();
	}, [refresh]);
	return (
		<View className="flex-1">
			<Text className="text-muted-foreground px-3 pt-3 pb-1">{t('register.which_register')}</Text>
			<ScrollView>
				{registers.map((register) => (
					<ListRow
						key={register.id}
						size="default"
						testID={`register-picker-row-${register.id}`}
						onPress={async () => {
							await bind(register.id);
							onBound?.();
						}}
						trailing={<Icon name="chevronRight" className="text-muted-foreground" />}
					>
						<Text className="font-medium">{register.name}</Text>
						<RegisterStatus register={register} />
					</ListRow>
				))}
				<Text className="text-muted-foreground px-3 py-2 text-xs">
					{t('register.change_later_from_avatar')}
				</Text>
			</ScrollView>
		</View>
	);
}
