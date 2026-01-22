import { useAppInfo } from '../../../hooks/use-app-info';

/**
 * Hook to check Pro license status.
 *
 * @deprecated Use `useAppInfo().license` instead for full license details
 */
export const useLicense = () => {
	const { license } = useAppInfo();

	return { isPro: license?.isPro ?? false };
};
