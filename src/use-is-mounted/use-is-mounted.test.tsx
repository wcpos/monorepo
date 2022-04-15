import { renderHook } from '@testing-library/react-hooks';
import useIsMounted from './use-is-mounted';

describe('useIsMounted', () => {
	it('returns true when component is mounted', () => {
		const { result } = renderHook(() => useIsMounted());
		const isMounted = result.current;
		expect(isMounted.current).toBe(true);
	});

	it('returns false when component is unmounted', () => {
		const { result, unmount } = renderHook(() => useIsMounted());
		const isMounted = result.current;
		unmount();
		expect(isMounted.current).toBe(false);
	});
});
