import * as React from 'react';
import { ScrollView } from 'react-native';

import { Button } from '@wcpos/components/button';
import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

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
						<Button
							key={register.id}
							testID={`register-picker-row-${register.id}`}
							variant="ghost"
							className="h-11 items-start"
							onPress={async () => {
								await bind(register.id);
								onBound?.();
							}}
						>
							<VStack className="gap-0">
								<Text numberOfLines={1}>{register.name}</Text>
								<Text className="text-muted-foreground text-sm">{t('register.not_opened')}</Text>
							</VStack>
						</Button>
					))}
				</ScrollView>
			</CardContent>
		</Card>
	);
}
