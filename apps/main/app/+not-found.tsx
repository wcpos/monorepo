import { router, Stack } from 'expo-router';

import { GateScreen } from '@wcpos/components/gate-screen';
import { useT } from '@wcpos/core/contexts/translations';

/**
 * `/` is session-neutral: the register when signed in, Connect when not, so the action
 * says "the start" rather than naming either.
 */
export default function NotFoundScreen() {
	const t = useT();
	return (
		<>
			<Stack.Screen options={{ title: 'Oops!' }} />
			<GateScreen
				tone="muted"
				icon="help"
				testID="not-found-screen"
				title={t('gate.not_found.title')}
				description={t('gate.not_found.description')}
				primary={{ label: t('gate.not_found.action'), onPress: () => router.replace('/') }}
			/>
		</>
	);
}
