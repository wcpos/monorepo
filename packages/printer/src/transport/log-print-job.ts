import { printerLogger } from '../logger';

/**
 * The dispatch/finish/fail trio every print lane owes a merchant's copied report: what was sent,
 * where, how long it took and how it ended. `context` must name the target (host/port, URL or
 * device key) and the size of the job — never the receipt itself. A numeric result from `send`
 * is taken to be the HTTP status the printer answered with, and logged as `httpStatus`.
 */
export async function logPrintJob<T extends number | void>(
	lane: 'Native' | 'ePOS' | 'WebPRNT',
	context: Record<string, unknown>,
	send: () => Promise<T>
): Promise<T> {
	const startedAt = Date.now();
	printerLogger.debug(`${lane} print dispatched`, { context });
	try {
		const result = await send();
		printerLogger.info(`${lane} print finished`, {
			context: {
				...context,
				...(typeof result === 'number' ? { httpStatus: result } : {}),
				elapsedMs: Date.now() - startedAt,
			},
		});
		return result;
	} catch (error) {
		printerLogger.warn(`${lane} print failed`, {
			context: {
				...context,
				elapsedMs: Date.now() - startedAt,
				cause: error instanceof Error ? error.message : String(error),
			},
		});
		throw error;
	}
}
