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
});
