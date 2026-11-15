import { clearAllDB } from './clear-all-db.electron';
import { TILL_ANCHOR_KEY } from './till-anchor.web';

/**
 * On Electron the main process owns the Yes/No dialog and the wipe. The renderer
 * must wait for the answer before it drops the till anchor, and a shell without
 * the `clearData:request` channel must keep the old fire-and-forget behaviour.
 */
function installWindow(ipcRenderer: Record<string, unknown>) {
	const removeItem = jest.fn();
	(globalThis as { window?: unknown }).window = {
		ipcRenderer,
		localStorage: { removeItem },
	};
	return { removeItem };
}

describe('clearAllDB (electron)', () => {
	afterEach(() => {
		delete (globalThis as { window?: unknown }).window;
	});

	it('waits for the dialog: nothing happens while clearData:request is unanswered', async () => {
		const invoke = jest.fn(() => new Promise<never>(() => {}));
		const send = jest.fn();
		const { removeItem } = installWindow({ invoke, send });

		let settled = false;
		void clearAllDB().then(
			() => {
				settled = true;
			},
			() => {
				settled = true;
			}
		);
		await new Promise((resolve) => setImmediate(resolve));
		await new Promise((resolve) => setImmediate(resolve));

		expect(settled).toBe(false);
		expect(removeItem).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
		expect(invoke).toHaveBeenCalledWith('clearData:request');
	});

	it('Yes: drops the till anchor and reports relaunching, without the old send', async () => {
		const invoke = jest.fn().mockResolvedValue('relaunching');
		const send = jest.fn();
		const { removeItem } = installWindow({ invoke, send });

		const result = await clearAllDB();

		expect(result).toEqual(expect.objectContaining({ success: true, relaunching: true }));
		expect(removeItem).toHaveBeenCalledWith(TILL_ANCHOR_KEY);
		expect(send).not.toHaveBeenCalled();
	});

	it('No: keeps the till anchor and reports declined, without the old send', async () => {
		const invoke = jest.fn().mockResolvedValue('declined');
		const send = jest.fn();
		const { removeItem } = installWindow({ invoke, send });

		const result = await clearAllDB();

		expect(result).toEqual(expect.objectContaining({ success: false, declined: true }));
		expect(removeItem).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it("an older main process (invoke rejects) falls back to today's send('clearData')", async () => {
		const invoke = jest
			.fn()
			.mockRejectedValue(
				new Error("Error invoking remote method 'clearData:request': No handler registered")
			);
		const send = jest.fn();
		const { removeItem } = installWindow({ invoke, send });

		await expect(clearAllDB()).resolves.toBeUndefined();

		expect(removeItem).toHaveBeenCalledWith(TILL_ANCHOR_KEY);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith('clearData');
		expect(removeItem.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
	});

	it("an older preload without invoke falls back to today's send('clearData')", async () => {
		const send = jest.fn();
		const { removeItem } = installWindow({ send });

		await expect(clearAllDB()).resolves.toBeUndefined();

		expect(removeItem).toHaveBeenCalledWith(TILL_ANCHOR_KEY);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith('clearData');
		expect(removeItem.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
	});

	it('an unexpected answer throws and touches nothing', async () => {
		const invoke = jest.fn().mockResolvedValue('maybe');
		const send = jest.fn();
		const { removeItem } = installWindow({ invoke, send });

		await expect(clearAllDB()).rejects.toThrow(/maybe/);

		expect(removeItem).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});
});
