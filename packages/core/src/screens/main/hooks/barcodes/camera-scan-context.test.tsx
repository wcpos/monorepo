/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { renderHook } from '@testing-library/react';

import type { ScanEvent } from '@wcpos/scanner';

import { CameraScanProvider, useCameraScanBus } from './camera-scan-context';

describe('CameraScanContext', () => {
	it('defaults to a no-op bus with an EMPTY stream when no provider is present', () => {
		const { result } = renderHook(() => useCameraScanBus());
		const events: ScanEvent[] = [];
		const subscription = result.current.events$.subscribe((event) => events.push(event));
		// emit is a no-op; EMPTY completes immediately with nothing.
		result.current.emit({ code: 'X', source: { kind: 'camera' }, timestamp: 0 });
		expect(events).toEqual([]);
		subscription.unsubscribe();
	});

	it('delivers emitted events to subscribers through the provider bus', () => {
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<CameraScanProvider>{children}</CameraScanProvider>
		);
		const { result } = renderHook(() => useCameraScanBus(), { wrapper });
		const events: ScanEvent[] = [];
		const subscription = result.current.events$.subscribe((event) => events.push(event));

		result.current.emit({
			code: '4006381333931',
			source: { kind: 'camera' },
			timestamp: 1,
		});

		expect(events).toHaveLength(1);
		expect(events[0].code).toBe('4006381333931');
		subscription.unsubscribe();
	});
});
