import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { deriveUserCapabilities } from './user-capabilities';

export function useUserCapabilities() {
	const { wpCredentials } = useAppState();
	const capabilities = useDocField(wpCredentials, (credentials) => credentials.capabilities);

	return deriveUserCapabilities(capabilities);
}
