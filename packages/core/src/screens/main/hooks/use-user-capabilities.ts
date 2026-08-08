import { useObservableEagerState } from 'observable-hooks';
import { of } from 'rxjs';

import { useAppState } from '../../../contexts/app-state';
import { deriveUserCapabilities } from './user-capabilities';

const UNKNOWN_CAPABILITIES$ = of(undefined as string[] | undefined);

export function useUserCapabilities() {
	const { wpCredentials } = useAppState();
	const capabilities = useObservableEagerState(
		wpCredentials?.capabilities$ ?? UNKNOWN_CAPABILITIES$
	) as string[] | undefined;

	return deriveUserCapabilities(capabilities);
}
