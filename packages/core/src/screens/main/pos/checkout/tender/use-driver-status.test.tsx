/** @jest-environment jsdom */
import * as React from 'react';

import { act, renderHook } from '@testing-library/react';

import { getDriver, registerDriver } from '../../../../../services/payment-drivers/registry';
import { createSimulatedDriver } from '../../../../../services/payment-drivers/simulated-driver';
import { method } from '../payments/device/fixtures.test-utils';
import { buildTenderTiles } from './tiles';
import { useDriverChanges, useDriverStatus } from './use-driver-status';

it('observes a driver registered from an effect after mount, its status, and replacements', () => {
	const first = { ...createSimulatedDriver(), provider: 'late-registration' };
	const listeners = new Set<() => void>();
	let status = first.status$.get();
	first.status$ = {
		get: () => status,
		subscribe: (listener) => {
			const notify = () => listener(status);
			listeners.add(notify);
			return () => {
				listeners.delete(notify);
			};
		},
	};
	const methods = [{ ...method, capture: { ...method.capture, provider: first.provider } }];
	const { result, unmount } = renderHook(() => {
		useDriverChanges();
		const driver = getDriver(first.provider);
		const current = useDriverStatus(driver);
		React.useEffect(() => {
			registerDriver(first);
		}, []);
		return { driver, current, tiles: buildTenderTiles(methods, { online: true }) };
	});
	expect(result.current.driver).toBe(first);
	expect(result.current.tiles[0]).toMatchObject({ disabled: false, reason: null });
	act(() => {
		status = { ...status, message: 'Reader powered off' };
		listeners.forEach((listener) => listener());
	});
	expect(result.current.current.message).toBe('Reader powered off');
	const second = { ...createSimulatedDriver(), provider: first.provider };
	act(() => {
		registerDriver(second);
	});
	expect(result.current.driver).toBe(second);
	expect(listeners.size).toBe(0);
	unmount();
});
