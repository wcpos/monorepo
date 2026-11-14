/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';

import { useStoreDayLabel } from './use-store-day-label';

jest.mock('../contexts/app-state', () => ({}));
jest.mock('../contexts/translations', () => ({
	useT: () => jest.requireActual('../../jest/translate').createTestT(),
}));
jest.mock('./use-locale', () => ({ useLocale: () => ({ shortCode: 'en' }) }));
jest.mock('./use-store-day', () => ({
	...jest.requireActual('./use-store-day'),
	useStoreDay: () => ({ timezone: 'America/New_York' }),
}));

beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-17T02:00:00Z')));
afterEach(() => jest.useRealTimers());

it('labels today, yesterday and a past business day without shifting date-only headings', () => {
	const { result } = renderHook(() => useStoreDayLabel());
	expect(result.current.heading('2026-09-16')).toBe('Today');
	expect(result.current.heading('2026-09-15')).toBe('Yesterday');
	expect(result.current.heading('2026-09-12')).toBe('Saturday, 12 Sep 2026');
});
it('uses the store day across midnight UTC, including Woo dates without Z', () => {
	const { result } = renderHook(() => useStoreDayLabel());
	expect(result.current.dateTime('2026-09-17T00:42:00')).toBe('Today · 20:42');
	expect(result.current.dateTime('2026-09-16T01:20:00Z')).toBe('Yesterday · 21:20');
	expect(result.current.dateTime('2026-09-12T19:48:00Z')).toBe('Sat 12 Sep · 15:48');
	expect(result.current.day('2026-09-12T19:48:00Z')).toBe('Sat 12 Sep');
});
