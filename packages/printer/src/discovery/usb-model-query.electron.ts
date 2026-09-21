import { getIpcRenderer } from './bluetooth-scan-session';
import { printerLogger } from '../logger';

/**
 * Ask a USB printer for its model name (GS I 67) through the Electron main process, so the
 * model table can set the width instead of the 58/80 question (Spec K3). Null means the
 * printer did not answer; clones often do not.
 */
export async function queryUsbPrinterModel(deviceKey: string): Promise<string | null> {
	const ipc = getIpcRenderer();
	if (!ipc) return null;
	try {
		const model = await ipc.invoke('usb-query-model', { device: deviceKey });
		printerLogger.debug('USB model query', { context: { device: deviceKey, model } });
		return model;
	} catch (error) {
		printerLogger.debug('USB model query failed', {
			context: { device: deviceKey, cause: error instanceof Error ? error.message : String(error) },
		});
		return null;
	}
}
