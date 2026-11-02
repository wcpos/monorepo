import { createSimulatedDriver } from './simulated-driver';
import { method, row } from '../../screens/main/pos/checkout/payments/device/fixtures.test-utils';

import type { CollectInput } from './types';

const input: CollectInput = {
	dp: 2,
	row,
	method,
	transport: 'bluetooth',
	handoff: {
		client_secret: 'sim_secret',
		payment_intent: 'sim_pi_leg',
		outcome_url: 'https://store.test/simulated/outcome/leg',
	},
	tipEligibleMinor: 1000,
};

async function connectReader(driver: ReturnType<typeof createSimulatedDriver>, id: string) {
	const readers = await driver.discoverReaders!(id === 'sim-tap' ? 'tap_to_pay' : 'bluetooth');
	const connected = driver.connect!(
		readers.find((reader) => reader.id === id)!,
		null
	);
	await jest.advanceTimersByTimeAsync(300);
	await connected;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
	jest.clearAllTimers();
	jest.useRealTimers();
	jest.restoreAllMocks();
});

it('posts approval to the handoff URL using global fetch by default', async () => {
	const fetch = jest
		.spyOn(globalThis, 'fetch')
		.mockResolvedValue(new Response(null, { status: 200 }));
	const driver = createSimulatedDriver();
	const [reader] = await driver.discoverReaders!('bluetooth');
	const connected = driver.connect!(reader, null);
	await jest.advanceTimersByTimeAsync(300);
	await connected;
	const collecting = driver.collect({
		dp: 2,
		row,
		method,
		transport: 'bluetooth',
		handoff: {
			client_secret: 'sim_secret',
			payment_intent: 'sim_pi_leg',
			outcome_url: 'https://store.test/simulated/outcome/leg',
		},
		tipEligibleMinor: null,
	});
	await jest.advanceTimersByTimeAsync(500);
	await expect(collecting).resolves.toMatchObject({ outcome: 'captured' });
	expect(fetch).toHaveBeenCalledWith('https://store.test/simulated/outcome/leg', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ outcome: 'succeeded', amount: null, failure_reason: null }),
	});
});
it.each(['sim-approve', 'sim-decline', 'sim-cancel', 'sim-tip', 'sim-tap'])(
	'collects with %s',
	async (id) => {
		const fetch = jest.fn<
			ReturnType<typeof globalThis.fetch>,
			Parameters<typeof globalThis.fetch>
		>();
		const driver = createSimulatedDriver({ fetch });
		const transport = id === 'sim-tap' ? 'tap_to_pay' : 'bluetooth';
		const readers = await driver.discoverReaders!(transport);
		const connected = driver.connect!(
			readers.find((r) => r.id === id)!,
			null
		);
		expect(driver.status$.get().connection).toBe('connecting');
		await jest.advanceTimersByTimeAsync(300);
		await connected;
		expect(driver.status$.get().connection).toBe('connected');
		const collecting = driver.collect({
			dp: 2,
			row,
			method,
			transport,
			handoff: null,
			tipEligibleMinor: 1000,
		});
		await jest.advanceTimersByTimeAsync(500);
		if (id === 'sim-cancel') await driver.cancel!();
		const result = await collecting;
		expect(result.outcome).toBe(
			id === 'sim-decline' ? 'declined' : id === 'sim-cancel' ? 'cancelled' : 'captured'
		);
		expect(result.amount).toBe(id === 'sim-tip' ? '11.00' : '10.00');
		expect(fetch).not.toHaveBeenCalled();
	}
);

it.each([
	{ id: 'sim-approve', outcome: 'succeeded', amount: null, failure_reason: null },
	{ id: 'sim-decline', outcome: 'failed', amount: null, failure_reason: 'card_declined' },
	{ id: 'sim-cancel', outcome: 'canceled', amount: null, failure_reason: null },
	{ id: 'sim-tip', outcome: 'succeeded', amount: '11.00', failure_reason: null },
	{ id: 'sim-tap', outcome: 'succeeded', amount: null, failure_reason: null },
])('awaits the outcome POST for $id before resolving collect', async ({ id, ...body }) => {
	let respond!: (response: Response) => void;
	const fetch = jest
		.fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>()
		.mockReturnValue(
			new Promise((resolve) => {
				respond = resolve;
			})
		);
	const driver = createSimulatedDriver({ fetch });
	await connectReader(driver, id);
	const completed = jest.fn();
	const collecting = driver
		.collect({ ...input, transport: id === 'sim-tap' ? 'tap_to_pay' : 'bluetooth' })
		.then(completed);
	await jest.advanceTimersByTimeAsync(500);
	if (id === 'sim-cancel') {
		expect(fetch).not.toHaveBeenCalled();
		await driver.cancel!();
	}
	expect(fetch).toHaveBeenCalledTimes(1);
	expect(fetch).toHaveBeenCalledWith(input.handoff!.outcome_url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	expect(completed).not.toHaveBeenCalled();
	respond(new Response(null, { status: 200 }));
	await collecting;
	expect(completed).toHaveBeenCalledTimes(1);
});

it.each(['HTTP 500', 'network unavailable'])('rejects collect on %s', async (failure) => {
	const fetch = jest.fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>();
	if (failure === 'HTTP 500') fetch.mockResolvedValue(new Response(null, { status: 500 }));
	else fetch.mockRejectedValue(new Error(failure));
	const driver = createSimulatedDriver({ fetch });
	await connectReader(driver, 'sim-approve');
	const rejected = expect(driver.collect(input)).rejects.toThrow(failure);
	await jest.advanceTimersByTimeAsync(500);
	await rejected;
});

it('uses configured precision for a whole-number tip amount', async () => {
	const driver = createSimulatedDriver();
	await connectReader(driver, 'sim-tip');
	const collecting = driver.collect({ ...input, row: { ...row, amount: '10' }, handoff: null });
	await jest.advanceTimersByTimeAsync(500);
	await expect(collecting).resolves.toMatchObject({ amount: '11.00' });
});
