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
let mockRunning: typeof mockService | null = mockService;
const mockStartListeners = new Set<() => void>();
jest.mock('../../../../../services/terminal-payments', () => ({
	getTerminalPaymentsService: () => mockRunning,
	subscribeTerminalPaymentsServiceStart: (listener: () => void) => {
		mockStartListeners.add(listener);
		return () => {
			mockStartListeners.delete(listener);
		};
	},
}));
function setLegs(legs: typeof mockLegs) {
	mockLegs = legs;
	mockListeners.forEach((listener) => listener());
}
function startService() {
	mockRunning = mockService;
	mockStartListeners.forEach((listener) => listener());
}
beforeEach(() => {
	mockRunning = mockService;
	setLegs(new Map());
});
it('reads a service that starts after the hook mounted: its collecting leg holds the sheet', () => {
	mockRunning = null;
	const { result } = renderHook(() => usePaymentInFlight());
	expect(result.current).toBe(false);
	act(() => {
		mockLegs = new Map([['o1', { phase: 'collecting' }]]);
		startService();
	});
	expect(result.current).toBe(true);
	act(() => setLegs(new Map([['o1', { phase: 'final' }]])));
	expect(result.current).toBe(false);
});
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
