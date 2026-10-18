import * as React from 'react';
import { ScrollView } from 'react-native';

import { MenuRow } from '@wcpos/components/menu-row';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';
import { useRegisterBinding } from '../../../../services/register/use-register-binding';

export function RegisterPicker({ onBound }: { onBound?: () => void }) {
	const { registers, bind } = useRegisterBinding();
	const t = useT();
	return (
		<Card className="flex-1">
			<CardHeader>
				<Text>{t('register.choose_register')}</Text>
			</CardHeader>
			<CardContent>
				<ScrollView>
					{registers.map((register) => (
						<MenuRow
							key={register.id}
							testID={`register-picker-row-${register.id}`}
							onPress={async () => {
								await bind(register.id);
								onBound?.();
							}}
							label={register.name}
							description={<StatusBadge label={t('register.not_opened')} variant="muted" />}
						/>
					))}
				</ScrollView>
			</CardContent>
		</Card>
	);
}
