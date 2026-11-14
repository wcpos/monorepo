/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { demandRecordsByWooId } from '@wcpos/query/record-readers';

import { useQueryHandleFields } from '../../../../query';
import { useReportsData } from '../context';
import {
	MAX_REPORT_PRODUCT_DEMAND,
	REPORT_PRODUCT_DEMAND_CHUNK,
	useReportLinesLoaded,
	useReportProductDemand,
} from './use-report-product-demand';

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
jest.mock('../context', () => ({
	useReportsHandles: () => ({ handle: 'sales', refundsHandle: 'refunds' }),
	useReportsData: jest.fn(),
}));
jest.mock('../../../../query', () => ({ useQueryHandleFields: jest.fn() }));

const demand = demandRecordsByWooId as jest.Mock;
type Outcome = 'settled' | 'released';
type Props = {
	ids: readonly number[];
	local: readonly LocalProduct[] | undefined;
	loaded?: boolean;
};

/** A demand whose outcome the test decides; `settle` resolves it, `fail` rejects it. */
function deferred() {
	let settle!: (outcome: Outcome) => void;
	let fail!: (error: Error) => void;
	const ready = new Promise<Outcome>((resolve, reject) => {
		settle = resolve;
		fail = reject;
	});
	return { ready, release: jest.fn(), settle, fail };
}
const settled = () => ({ ready: Promise.resolve<Outcome>('settled'), release: jest.fn() });
function renderDemand(initialProps: Props) {
	return renderHook(
		({ ids, local, loaded = true }: Props) => useReportProductDemand(ids, local, loaded),
		{ initialProps }
	);
}
async function advance(ms: number) {
	act(() => {
		jest.advanceTimersByTime(ms);
	});
	await act(async () => {});
}
const wooIdsOf = (call: number): number[] => demand.mock.calls[call][1].wooIds;
const demanded = () => demand.mock.calls.flatMap((call) => call[1].wooIds as number[]);
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

describe('useReportProductDemand', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		generation = 0;
		status = 'online-website-available';
		mockDebug.mockReset();
		demand.mockReset();
		demand.mockImplementation(settled);
	});
	afterEach(() => {
		jest.useRealTimers();
	});

	it("demands nothing until the period's orders and refunds have loaded", async () => {
		const { rerender } = renderDemand({ ids: [3, 1, 2], local: [], loaded: false });
		await advance(1000);
		expect(demand).not.toHaveBeenCalled();
		rerender({ ids: [3, 1, 2], local: [], loaded: true });
		await advance(1000);
		expect(demand).toHaveBeenCalledTimes(1);
		expect(wooIdsOf(0)).toEqual([1, 2, 3]);
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

	it('demands the missing ids most-named first, in chunks of 50, one at a time', async () => {
		const chunks = [deferred(), deferred(), deferred()];
		chunks.forEach((chunk) => demand.mockReturnValueOnce(chunk));
		// 120 named ids, 0 on this device; 120 is named three times, 119 twice.
		const ids = [0, ...range(1, 120), 120, 120, 119];
		renderDemand({ ids, local: [{ id: 0 }] });
		await advance(499);
		expect(demand).not.toHaveBeenCalled();
		await advance(1);
		expect(demand).toHaveBeenCalledTimes(1);
		expect(demand.mock.calls[0][0]).toBe(engine);
		expect(demand.mock.calls[0][1]).toEqual({
			id: `reports:products-not-on-device:${[120, 119, ...range(1, 48)].join(',')}`,
			collection: 'products',
			wooIds: [120, 119, ...range(1, 48)],
		});
		await advance(1000);
		expect(demand).toHaveBeenCalledTimes(1);
		await act(async () => chunks[0].settle('settled'));
		expect(demand).toHaveBeenCalledTimes(2);
		expect(wooIdsOf(1)).toEqual(range(49, REPORT_PRODUCT_DEMAND_CHUNK));
		await advance(1000);
		expect(demand).toHaveBeenCalledTimes(2);
		await act(async () => chunks[1].settle('settled'));
		expect(demand).toHaveBeenCalledTimes(3);
		expect(wooIdsOf(2)).toEqual(range(99, 20));
		await act(async () => chunks[2].settle('settled'));
		expect(demand).toHaveBeenCalledTimes(3);
	});

	it('caps one report open at MAX_REPORT_PRODUCT_DEMAND ids across period changes', async () => {
		const { rerender, unmount } = renderDemand({ ids: range(1, 600), local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(MAX_REPORT_PRODUCT_DEMAND / REPORT_PRODUCT_DEMAND_CHUNK);
		expect(demanded()).toEqual(range(1, MAX_REPORT_PRODUCT_DEMAND));
		rerender({ ids: range(1, 700), local: [] });
		await advance(1000);
		expect(demanded()).toHaveLength(MAX_REPORT_PRODUCT_DEMAND);
		unmount();
		demand.mockClear();
		renderDemand({ ids: range(1, 700), local: [] });
		await advance(500);
		expect(demanded()).toEqual(range(1, MAX_REPORT_PRODUCT_DEMAND));
	});

	it('does not demand an id the server did not return when local products arrive', async () => {
		const chunk = deferred();
		demand.mockReturnValueOnce(chunk);
		const ids = [9, 9, 1, 2, 3];
		const { rerender } = renderDemand({ ids, local: [] });
		await advance(500);
		expect(wooIdsOf(0)).toEqual([9, 1, 2, 3]);
		// Fetched products land while the chunk is in flight, and after it settles: id 9 never does.
		rerender({ ids, local: [{ id: 1 }, { id: 2 }] });
		await advance(1000);
		await act(async () => chunk.settle('settled'));
		rerender({ ids, local: [{ id: 1 }, { id: 2 }, { id: 3 }] });
		await advance(1000);
		expect(demand).toHaveBeenCalledTimes(1);
		expect(chunk.release).not.toHaveBeenCalled();
	});

	it('stops issuing chunks and releases the in-flight demand when the report closes', async () => {
		const first = deferred();
		demand.mockReturnValueOnce(first);
		const { unmount } = renderDemand({ ids: range(1, 120), local: [] });
		await advance(500);
		unmount();
		expect(first.release).toHaveBeenCalledTimes(1);
		// Even a chunk that settles after the close issues no next chunk.
		await act(async () => first.settle('settled'));
		await advance(1000);
		expect(demand).toHaveBeenCalledTimes(1);

		// A period change mid-run: the old run stops, the new one asks only for unattempted ids.
		demand.mockClear();
		const second = deferred();
		demand.mockReturnValueOnce(settled()).mockReturnValueOnce(second);
		const { rerender } = renderDemand({ ids: range(1, 120), local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(2);
		rerender({ ids: range(1, 121), local: [] });
		expect(second.release).toHaveBeenCalledTimes(1);
		await act(async () => second.settle('released'));
		await advance(500);
		expect(wooIdsOf(2)).toEqual(range(51, 50));
		expect(wooIdsOf(3)).toEqual(range(101, 21));
		expect(demand).toHaveBeenCalledTimes(4);
	});

	it('demands a released or failed chunk again on the next run, and logs a failure at debug', async () => {
		demand.mockImplementationOnce(() => ({
			ready: Promise.resolve<Outcome>('released'),
			release: jest.fn(),
		}));
		const { rerender } = renderDemand({ ids: [7], local: [] });
		await advance(500);
		expect(mockDebug).not.toHaveBeenCalled();
		const failing = deferred();
		demand.mockReturnValueOnce(failing);
		rerender({ ids: [7, 8], local: [] });
		await advance(500);
		expect(wooIdsOf(1)).toEqual([7, 8]);
		await act(async () => failing.fail(new Error('offline')));
		expect(mockDebug).toHaveBeenCalledTimes(1);
		expect(mockDebug).toHaveBeenCalledWith('Report product demand failed');
		rerender({ ids: [7, 8, 9], local: [] });
		await advance(500);
		expect(demand).toHaveBeenCalledTimes(3);
		expect(wooIdsOf(2)).toEqual([7, 8, 9]);
	});

	it('starts a fresh attempted set on a new coverage generation, within the same budget', async () => {
		const { rerender } = renderDemand({ ids: range(1, 450), local: [] });
		await advance(500);
		expect(demanded()).toEqual(range(1, 450));
		demand.mockClear();
		generation = 1;
		rerender({ ids: range(1, 450), local: [] });
		await advance(500);
		expect(demanded()).toEqual(range(1, MAX_REPORT_PRODUCT_DEMAND - 450));
	});
});

describe('useReportLinesLoaded', () => {
	const fields = useQueryHandleFields as jest.Mock;
	const data = useReportsData as jest.Mock;
	const progress = { downloaded: 1, total: 2 };
	it.each([
		[true, { ready: true }, { ready: true }, []],
		[false, { ready: false }, { ready: true }, []],
		[false, { ready: true, laneProgress: progress }, { ready: true }, []],
		[false, { ready: true }, { ready: false }, []],
		[false, { ready: true }, { ready: true, laneProgress: progress }, []],
		[false, { ready: true }, { ready: true }, undefined],
	])('answers %s for sales %j, refunds %j, period refunds %j', (expected, sales, refunds, rows) => {
		fields.mockImplementation((handle: string) => (handle === 'sales' ? sales : refunds));
		data.mockReturnValue({ periodRefunds: rows });
		expect(renderHook(() => useReportLinesLoaded()).result.current).toBe(expected);
	});
});
