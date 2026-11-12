/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { demandRecordsByWooId } from '@wcpos/query/record-readers';

import { MAX_REPORT_PRODUCT_DEMAND, useReportProductDemand } from './use-report-product-demand';

import type { LocalProduct } from './aggregate';

const engine = {};
let generation = 0;
let status = 'online-website-available';
const mockDebug = jest.fn();

jest.mock('@wcpos/query', () => ({
	useQueryRuntime: () => ({ engine }),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	demandRecordsByWooId: jest.fn(),
}));
jest.mock('@wcpos/query/query-state', () => ({
	useCoverageGeneration: () => generation,
}));
jest.mock('@wcpos/hooks/use-online-status', () => ({
	useOnlineStatus: () => ({ status }),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ debug: (...args: unknown[]) => mockDebug(...args) }),
}));

const demand = demandRecordsByWooId as jest.Mock;
type Props = { ids: readonly number[]; local: readonly LocalProduct[] | undefined };

function handle(ready: Promise<'settled' | 'released'>) {
	return { ready, release: jest.fn() };
}
function renderDemand(initialProps: Props) {
	return renderHook(({ ids, local }: Props) => useReportProductDemand(ids, local), {
		initialProps,
	});
}
async function advance(ms: number) {
	act(() => {
		jest.advanceTimersByTime(ms);
	});
	await act(async () => {});
}
const wooIdsOf = (call: number) => demand.mock.calls[call][1].wooIds;

describe('useReportProductDemand', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		generation = 0;
		status = 'online-website-available';
		mockDebug.mockReset();
		demand.mockReset();
		demand.mockImplementation(() => handle(Promise.resolve('settled')));
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it('demands the ids that are not on this device, most-named first, after the debounce', async () => {
		renderDemand({ ids: [3, 1, 3, 2, 3, 2], local: [{ id: 1 }] });
		await advance(499);
		expect(demand).not.toHaveBeenCalled();
		await advance(1);
		expect(demand).toHaveBeenCalledTimes(1);
		expect(demand.mock.calls[0][0]).toBe(engine);
		expect(demand.mock.calls[0][1]).toEqual(
			expect.objectContaining({ collection: 'products', wooIds: [3, 2] })
		);
	});

	it('demands nothing while the local products are loading', async () => {
		renderDemand({ ids: [3, 1, 2], local: undefined });
		await advance(1000);
		expect(demand).not.toHaveBeenCalled();
	});

	it('demands nothing offline and demands once the store is reachable', async () => {
		status = 'offline';
		const { rerender } = renderDemand({ ids: [3, 1, 2], local: [] });
		await advance(1000);
		expect(demand).not.toHaveBeenCalled();
		status = 'online-website-unavailable';
		rerender({ ids: [3, 1, 2], local: [] });
		await advance(1000);
		expect(demand).not.toHaveBeenCalled();
		status = 'online-website-available';
		rerender({ ids: [3, 1, 2], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(1);
	});

	it('caps one demand at MAX_REPORT_PRODUCT_DEMAND ids', async () => {
		const ids = [...Array.from({ length: 600 }, (_, index) => index + 1), 600, 600, 600];
		renderDemand({ ids, local: [] });
		await advance(500);
		const wooIds: number[] = wooIdsOf(0);
		expect(wooIds).toHaveLength(MAX_REPORT_PRODUCT_DEMAND);
		expect(wooIds[0]).toBe(600);
		expect(wooIds.filter((id) => id >= 500 && id !== 600)).toEqual([]);
		expect(wooIds).toEqual([600, ...Array.from({ length: 499 }, (_, index) => index + 1)]);
	});

	it('does not demand a settled id again when the period grows', async () => {
		const { rerender } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		expect(wooIdsOf(0)).toEqual([7]);
		rerender({ ids: [7, 8], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(2);
		expect(wooIdsOf(1)).toEqual([8]);
	});

	it('demands a released id again', async () => {
		demand.mockImplementationOnce(() => handle(Promise.resolve('released')));
		const { rerender } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		rerender({ ids: [7, 8], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(2);
		expect(wooIdsOf(1)).toEqual([7, 8]);
	});

	it('demands a failed id again and logs at debug', async () => {
		demand.mockImplementationOnce(() => handle(Promise.reject(new Error('offline'))));
		const { rerender } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		expect(mockDebug).toHaveBeenCalledTimes(1);
		expect(mockDebug).toHaveBeenCalledWith('Report product demand failed');
		rerender({ ids: [7, 8], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(2);
		expect(wooIdsOf(1)).toEqual([7, 8]);
	});

	it('releases the in-flight demand on unmount and on a superseding change', async () => {
		const first = handle(new Promise(() => {}));
		const second = handle(new Promise(() => {}));
		demand.mockReturnValueOnce(first).mockReturnValueOnce(second);
		const { rerender, unmount } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		rerender({ ids: [7, 8], local: [] });
		expect(first.release).toHaveBeenCalledTimes(1);
		await advance(500);
		expect(wooIdsOf(1)).toEqual([7, 8]);
		expect(second.release).not.toHaveBeenCalled();
		unmount();
		expect(second.release).toHaveBeenCalledTimes(1);
		expect(first.release).toHaveBeenCalledTimes(1);
	});

	it('starts a fresh attempted set on a new coverage generation', async () => {
		const { rerender } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		expect(wooIdsOf(0)).toEqual([7]);
		generation = 1;
		rerender({ ids: [7], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(2);
		expect(wooIdsOf(1)).toEqual([7]);
	});
});
