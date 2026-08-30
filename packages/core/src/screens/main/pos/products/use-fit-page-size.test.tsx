/**
 * @jest-environment jsdom
 */
import type { LayoutChangeEvent } from 'react-native';

import { act, renderHook } from '@testing-library/react';

import { useFitPageSize } from './use-fit-page-size';

const layoutEvent = (width: number, height: number) =>
	({ nativeEvent: { layout: { width, height } } }) as LayoutChangeEvent;

describe('useFitPageSize', () => {
	it('sends changed fits after layout and display-setting changes', () => {
		const setPageSize = jest.fn();
		const { result, rerender } = renderHook(
			({ viewMode, gridColumns }: { viewMode: 'grid' | 'table'; gridColumns: number }) =>
				useFitPageSize(setPageSize, viewMode, gridColumns),
			{ initialProps: { viewMode: 'grid' as 'grid' | 'table', gridColumns: 4 } }
		);

		act(() => result.current(layoutEvent(1000, 1500)));
		expect(setPageSize).toHaveBeenLastCalledWith(24);

		act(() => result.current(layoutEvent(1000, 1500)));
		expect(setPageSize).toHaveBeenCalledTimes(1);

		rerender({ viewMode: 'table', gridColumns: 4 });
		expect(setPageSize).toHaveBeenLastCalledWith(29);

		rerender({ viewMode: 'grid', gridColumns: 5 });
		expect(setPageSize).toHaveBeenLastCalledWith(30);
	});
});
