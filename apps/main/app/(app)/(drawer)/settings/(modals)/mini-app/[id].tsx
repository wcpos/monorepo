import { useLocalSearchParams, useRouter } from 'expo-router';

import { MiniAppHost } from '@wcpos/core/screens/main/mini-apps';

export default function MiniAppRoute() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	return <MiniAppHost id={id} onClose={() => router.back()} />;
}
