interface ReconnectablePrinter {
	addEventListener(
		type: 'connected' | 'disconnected' | 'error',
		cb: (event?: unknown) => void
	): void;
	reconnect(device: unknown): void | Promise<void>;
}

export const WEB_RECONNECT_TIMEOUT_MS = 10_000;

function asError(value: unknown, fallback: string): Error {
	if (value instanceof Error) return value;
	if (value === undefined) return new Error(fallback);
	return new Error(String(value));
}

export function waitForWebPrinterReconnect(
	printer: ReconnectablePrinter,
	device: unknown,
	printerLabel: string,
	timeoutMs = WEB_RECONNECT_TIMEOUT_MS
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			settle(() => reject(new Error(`Timed out reconnecting ${printerLabel} printer`)));
		}, timeoutMs);

		function settle(fn: () => void): void {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			fn();
		}

		const onConnected = () => settle(resolve);
		const onDisconnected = () =>
			settle(() => reject(new Error(`${printerLabel} printer disconnected while reconnecting`)));
		const onError = (err?: unknown) =>
			settle(() => reject(asError(err, `Failed to reconnect ${printerLabel} printer`)));

		printer.addEventListener('connected', onConnected);
		printer.addEventListener('disconnected', onDisconnected);
		printer.addEventListener('error', onError);

		try {
			void Promise.resolve(printer.reconnect(device)).catch(onError);
		} catch (err) {
			onError(err);
		}
	});
}
