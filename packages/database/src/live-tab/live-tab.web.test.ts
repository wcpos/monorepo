import {
	createLiveTab,
	holdLiveTab,
	TAKEOVER_ANSWER_TIMEOUT_MS,
	TAKEOVER_DEFER_CEILING_MS,
} from './live-tab.web';

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};
function harness() {
	const events: string[] = [];
	let occupied = false;
	const queue: (() => void)[] = [];
	const locks = {
		request: jest.fn(
			(_name, options, callback) =>
				new Promise<void>((resolve) => {
					if (options.ifAvailable && options.signal)
						throw new Error('signal and ifAvailable cannot be combined');
					const grant = () => {
						occupied = true;
						Promise.resolve(callback({ name: _name })).then(() => {
							events.push('release');
							occupied = false;
							resolve();
							queue.shift()?.();
						});
					};
					if (occupied && options.ifAvailable) {
						callback(null);
						resolve();
					} else if (occupied) queue.push(grant);
					else grant();
				})
		),
	};
	const channels = new Set<{
		onmessage: ((event: { data: unknown }) => void) | null;
		postMessage: (data: unknown) => void;
		close: jest.Mock;
	}>();
	const channel = () => {
		const endpoint = {
			onmessage: null as ((event: { data: unknown }) => void) | null,
			postMessage(data: unknown) {
				events.push((data as { type: string }).type);
				for (const peer of channels) if (peer !== endpoint) peer.onmessage?.({ data });
			},
			close: jest.fn(() => {
				channels.delete(endpoint);
			}),
		};
		channels.add(endpoint);
		return endpoint;
	};
	const tabs: ReturnType<typeof createLiveTab>[] = [];
	const tab = (
		onHandover = jest.fn(async () => {
			events.push('teardown');
		})
	) => {
		const instance = createLiveTab({
			locks,
			channel,
			onHandover,
			onUnavailable: jest.fn(),
			onError: jest.fn(),
		});
		tabs.push(instance);
		return instance;
	};
	return { events, locks, channel, channels, tab, dispose: () => tabs.forEach((t) => t.dispose()) };
}
let h: ReturnType<typeof harness>;
beforeEach(() => {
	jest.useFakeTimers();
	h = harness();
});
afterEach(async () => {
	h.dispose();
	await flush();
	jest.useRealTimers();
});

test('the first tab is live and the second parks', async () => {
	const a = h.tab();
	const b = h.tab();
	await flush();
	expect(a.getState()).toEqual({ kind: 'live' });
	expect(b.getState()).toEqual({ kind: 'parked', reason: 'another-tab-live' });
});
test('takeover: the holder acks, tears down, releases; the requester becomes live and the holder parks', async () => {
	const a = h.tab();
	const b = h.tab();
	await flush();
	b.state$.subscribe((state) => {
		if (state.kind === 'live') h.events.push('requester-live');
	});
	b.takeOver();
	await flush();
	expect(h.events.filter((e) => e !== 'takeover-released')).toEqual([
		'takeover-request',
		'takeover-ack',
		'teardown',
		'release',
		'requester-live',
	]);
	expect(h.events).toContain('takeover-released');
	expect(a.getState()).toEqual({ kind: 'parked', reason: 'another-tab-live' });
	expect(b.getState()).toEqual({ kind: 'live' });
});
test('takeover defers while a payment is held and the requester sees the reason', async () => {
	h.tab();
	const b = h.tab();
	await flush();
	const release = holdLiveTab('payment');
	b.takeOver();
	await flush();
	expect(b.getState()).toEqual({ kind: 'taking-over', deferral: 'payment' });
	release();
	await flush();
	expect(b.getState()).toEqual({ kind: 'live' });
});
test('takeover proceeds at the ceiling with the hold still active', async () => {
	h.tab();
	const b = h.tab();
	await flush();
	const release = holdLiveTab('write');
	b.takeOver();
	await flush();
	jest.advanceTimersByTime(TAKEOVER_DEFER_CEILING_MS);
	await flush();
	expect(b.getState()).toEqual({ kind: 'live' });
	release();
	release();
});
test('no answer within the timeout tells the requester to close the other tab, and a later release still hands over', async () => {
	let release!: () => void;
	void h.locks.request(
		'wcpos-live-tab',
		{},
		() =>
			new Promise<void>((r) => {
				release = r;
			})
	);
	const b = h.tab();
	await flush();
	b.takeOver();
	jest.advanceTimersByTime(TAKEOVER_ANSWER_TIMEOUT_MS);
	await flush();
	expect(b.getState()).toEqual({ kind: 'taking-over', deferral: 'no-answer' });
	release();
	await flush();
	expect(b.getState()).toEqual({ kind: 'live' });
});
test('the lock is never stolen', async () => {
	h.tab();
	const b = h.tab();
	await flush();
	b.takeOver();
	await flush();
	for (const [, options] of h.locks.request.mock.calls) expect(options).not.toHaveProperty('steal');
});
test('worker loss parks the holder and frees the lock for the next tab', async () => {
	const a = h.tab();
	const b = h.tab();
	await flush();
	const release = holdLiveTab('write');
	b.takeOver();
	a.park('worker-lost');
	await flush();
	release();
	expect(a.getState()).toEqual({ kind: 'parked', reason: 'worker-lost' });
	expect(b.getState()).toEqual({ kind: 'live' });
	a.takeOver();
	await flush();
	expect(a.getState()).toEqual({ kind: 'parked', reason: 'worker-lost' });
});
test('without Web Locks the tab is live', () => {
	const onUnavailable = jest.fn();
	const tab = createLiveTab({
		channel: h.channel,
		onHandover: async () => {},
		onUnavailable,
		onError: jest.fn(),
	});
	expect(tab.getState()).toEqual({ kind: 'live' });
	expect(onUnavailable).toHaveBeenCalledTimes(1);
	tab.dispose();
});
test('dispose releases the lock and closes the channel', async () => {
	const a = h.tab();
	const b = h.tab();
	await flush();
	const endpoints = [...h.channels];
	b.takeOver();
	a.dispose();
	await flush();
	expect(endpoints[0].close).toHaveBeenCalledTimes(1);
	expect(b.getState()).toEqual({ kind: 'live' });
});
test('a second takeover request during a handover gets its own ack and the same handover', async () => {
	const teardown = jest.fn(async () => {});
	h.tab(teardown);
	const b = h.tab();
	const c = h.tab();
	await flush();
	const release = holdLiveTab('payment');
	b.takeOver();
	c.takeOver();
	await flush();
	expect(h.events.filter((e) => e === 'takeover-ack')).toHaveLength(2);
	release();
	await flush();
	expect(teardown).toHaveBeenCalledTimes(1);
	expect(b.getState()).toEqual({ kind: 'live' });
	expect(c.getState().kind).toBe('taking-over');
});
