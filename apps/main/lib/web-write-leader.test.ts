import { electWriteLeader } from './web-write-leader';

jest.resetModules();

type LockCallback = () => Promise<void>;

function fakeLocks() {
	const waiting: LockCallback[] = [];
	let held = false;
	const advance = () => {
		if (held) return;
		const callback = waiting.shift();
		if (!callback) return;
		held = true;
		void callback().finally(() => {
			held = false;
			advance();
		});
	};
	return {
		request: jest.fn((_name: string, _options: LockOptions, callback: LockCallback) => {
			return new Promise<void>((resolve, reject) => {
				waiting.push(() => callback().then(resolve, reject));
				advance();
			});
		}),
	};
}

describe('electWriteLeader', () => {
	it('has exactly one leader and transfers ownership after release', async () => {
		const locks = fakeLocks();
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks },
		});
		const first = electWriteLeader('wcpos-write-leader:test');
		const second = electWriteLeader('wcpos-write-leader:test');
		await Promise.resolve();
		expect([first.isLeader(), second.isLeader()]).toEqual([true, false]);

		first.dispose();
		for (let turn = 0; turn < 10 && !second.isLeader(); turn += 1) {
			await Promise.resolve();
		}
		expect([first.isLeader(), second.isLeader()]).toEqual([false, true]);

		second.dispose();
		await Promise.resolve();
		await Promise.resolve();
	});

	it('degrades to single-writer when Web Locks are absent (never a stuck follower)', () => {
		Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
		const onUnavailable = jest.fn();
		const leader = electWriteLeader('wcpos-write-leader:test', { onUnavailable });
		// A tab that cannot elect must still own its write plane, or it would
		// enqueue sales it never drains.
		expect(leader.isLeader()).toBe(true);
		expect(onUnavailable).toHaveBeenCalledTimes(1);
		leader.dispose();
	});

	it('degrades to single-writer when the lock request REJECTS (restricted context)', async () => {
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { locks: { request: jest.fn(() => Promise.reject(new Error('SecurityError'))) } },
		});
		const onUnavailable = jest.fn();
		const leader = electWriteLeader('wcpos-write-leader:test', { onUnavailable });
		// The rejection resolves on a microtask; this is the silent-no-sync bug the
		// adversarial pass found — the tab must NOT stay a permanent follower.
		for (let turn = 0; turn < 10 && !leader.isLeader(); turn += 1) {
			await Promise.resolve();
		}
		expect(leader.isLeader()).toBe(true);
		expect(onUnavailable).toHaveBeenCalledTimes(1);
		leader.dispose();
	});
});
