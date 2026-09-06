import { snapshotRecorder } from '@wcpos/utils/logger';
import type { PrinterIdentity } from '@wcpos/printer';

import type { TestPrintFailure } from './dialog/use-printer-dialog-form';

/** The last lines support needs; the recorder itself keeps 100 events across every category. */
export const SETUP_REPORT_LOG_LINES = 50;
const PRINTER_CATEGORY_PREFIX = 'wcpos.printer';

export interface SetupReportPrinter {
	name?: string;
	vendor?: string;
	model?: string;
	connectionType?: string;
	address?: string;
	port?: number;
	columns?: number;
	language?: string;
	source?: string;
}
export interface SetupReportInput {
	app: { appVersion: string; platformVersion: string; platform: string };
	printer: SetupReportPrinter;
	identity?: PrinterIdentity | null;
	setup?: { phase?: string; testPages?: number; failure?: TestPrintFailure | null };
}
export interface SetupReport {
	generatedAt: string;
	app: SetupReportInput['app'];
	printer: SetupReportPrinter;
	identity: Pick<
		PrinterIdentity,
		'vendor' | 'model' | 'securePrinting' | 'notReceiptPrinter' | 'lane' | 'ports'
	> | null;
	setup: { phase?: string; testPages?: number; failure?: TestPrintFailure | null } | null;
	logs: { t: string; message: string; context: Record<string, unknown> }[];
}

/**
 * Everything support needs from one merchant in one blob (roadmap#161 P0): what the app
 * knows about the printer, what it probed, where the setup stopped, and the printer log
 * lines that led there. The merchant copies it; nothing leaves the device by itself.
 */
export function buildPrinterSetupReport(input: SetupReportInput): SetupReport {
	const identity = input.identity ?? null;
	const logs = snapshotRecorder()
		.filter((event) => String(event.context?.category ?? '').startsWith(PRINTER_CATEGORY_PREFIX))
		.slice(-SETUP_REPORT_LOG_LINES)
		.map((event) => ({
			t: new Date(event.timestamp).toISOString(),
			message: event.message,
			context: event.context,
		}));
	return {
		generatedAt: new Date().toISOString(),
		app: input.app,
		printer: input.printer,
		identity: identity
			? {
					vendor: identity.vendor,
					model: identity.model,
					securePrinting: identity.securePrinting,
					notReceiptPrinter: identity.notReceiptPrinter,
					lane: identity.lane,
					ports: identity.ports,
				}
			: null,
		setup: input.setup ?? null,
		logs,
	};
}

export function formatPrinterSetupReport(report: SetupReport): string {
	return JSON.stringify(report, null, 2);
}
