/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';

import { useExclusive } from './use-exclusive';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

describe('useExclusive', () => {
	it('refuses a second call in the same tick, before any render', async () => {
		const { result } = renderHook(() => useExclusive());
		const gate = deferred();
		const task = jest.fn(() => gate.promise);
		let first!: Promise<void>;
		let second!: Promise<void>;
		let heldBeforeRender = false;
		await act(async () => {
			// One closure, no render in between: only the ref can refuse the second call.
			first = result.current.exclusive('a', task);
			heldBeforeRender = result.current.held();
			second = result.current.exclusive('a', task);
		});
		expect(heldBeforeRender).toBe(true);
		expect(task).toHaveBeenCalledTimes(1);
		await act(async () => {
			gate.resolve();
			await Promise.all([first, second]);
		});
		expect(result.current.held()).toBe(false);
	});

	it('names the running task, and a refused call does not overwrite it', async () => {
		const { result } = renderHook(() => useExclusive<'a' | 'b'>());
		const gate = deferred();
		const other = jest.fn(async () => {});
		let first!: Promise<void>;
		act(() => {
			first = result.current.exclusive('a', () => gate.promise);
		});
		expect(result.current.running).toBe('a');
		expect(result.current.busy).toBe(true);
		await act(async () => {
			await result.current.exclusive('b', other);
		});
		expect(other).not.toHaveBeenCalled();
		expect(result.current.running).toBe('a');
		await act(async () => {
			gate.resolve();
			await first;
		});
		expect(result.current.running).toBeNull();
		expect(result.current.busy).toBe(false);
	});

	it('frees the gate when the task throws, and rejects with its error', async () => {
		const { result } = renderHook(() => useExclusive());
		const boom = new Error('boom');
		await act(async () => {
			await expect(result.current.exclusive('a', () => Promise.reject(boom))).rejects.toBe(boom);
		});
		expect(result.current.running).toBeNull();
		expect(result.current.held()).toBe(false);
		const next = jest.fn(async () => {});
		await act(async () => {
			await result.current.exclusive('a', next);
		});
		expect(next).toHaveBeenCalledTimes(1);
	});

	it('frees the gate when the task returns early on a declined confirm', async () => {
		const { result } = renderHook(() => useExclusive());
		const confirm = jest.fn(async () => false);
		const send = jest.fn();
		await act(async () => {
			await result.current.exclusive('a', async () => {
				if (!(await confirm())) return;
				send();
			});
		});
		expect(confirm).toHaveBeenCalledTimes(1);
		expect(send).not.toHaveBeenCalled();
		expect(result.current.running).toBeNull();
		const next = jest.fn(async () => {});
		await act(async () => {
			await result.current.exclusive('a', next);
		});
		expect(next).toHaveBeenCalledTimes(1);
	});

	it('keeps exclusive and held stable across renders', async () => {
		const { result, rerender } = renderHook(() => useExclusive());
		const { exclusive, held } = result.current;
		await act(async () => {
			await result.current.exclusive('a', async () => {});
		});
		rerender();
		expect(result.current.exclusive).toBe(exclusive);
		expect(result.current.held).toBe(held);
	});
});
