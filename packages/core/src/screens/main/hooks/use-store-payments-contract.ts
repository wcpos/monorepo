import { useStorePaymentsContract as useContract } from '@wcpos/query';

import { useStoreSession } from '../../../contexts/app-state';

export function useStorePaymentsContract(): string | null {
	const { extraData } = useStoreSession();
	return useContract(extraData);
}
