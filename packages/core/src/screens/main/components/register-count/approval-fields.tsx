import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../contexts/translations';

export function ApprovalFields({
	username,
	password,
	setUsername,
	setPassword,
}: {
	username: string;
	password: string;
	setUsername: (value: string) => void;
	setPassword: (value: string) => void;
}) {
	const t = useT();
	return (
		<>
			<Text>{t('register.username')}</Text>
			<Input
				testID="approve-username"
				className="min-h-row border-border"
				value={username}
				onChangeText={setUsername}
				autoCapitalize="none"
				autoCorrect={false}
			/>
			<Text>{t('register.password')}</Text>
			<Input
				testID="approve-password"
				className="min-h-row border-border"
				value={password}
				onChangeText={setPassword}
				secureTextEntry
				autoCapitalize="none"
				autoCorrect={false}
			/>
		</>
	);
}
