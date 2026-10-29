/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { markPayFrame, usePaymentInFlight } from './payment-in-flight';

let mockLegs = new Map<string, { phase: string }>();
const mockListeners = new Set<() => void>();
const mockService = {
	subscribe: (listener: () => void) => {
		mockListeners.add(listener);
		return () => {
			mockListeners.delete(listener);
		};
	},
	getSnapshot: () => mockLegs,
};
jest.mock('../../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => mockService,
}));
function setLegs(legs: typeof mockLegs) {
	mockLegs = legs;
	mockListeners.forEach((listener) => listener());
}
beforeEach(() => setLegs(new Map()));
it('is false with no legs and no pay frame', () => {
	expect(renderHook(() => usePaymentInFlight()).result.current).toBe(false);
});
it('is true while a terminal leg is not final, false once it is', () => {
	setLegs(new Map([['o1', { phase: 'polling' }]]));
	const { result } = renderHook(() => usePaymentInFlight());
	expect(result.current).toBe(true);
	act(() => setLegs(new Map([['o1', { phase: 'final' }]])));
	expect(result.current).toBe(false);
});
it('is true while a pay frame is mounted', () => {
	const { result } = renderHook(() => usePaymentInFlight());
	act(() => markPayFrame(true));
	expect(result.current).toBe(true);
	act(() => markPayFrame(false));
	expect(result.current).toBe(false);
});
