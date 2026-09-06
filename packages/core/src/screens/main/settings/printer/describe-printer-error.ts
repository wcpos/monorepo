import { getErrorMessage } from '@wcpos/utils/logger';

/** The copy key the app shows, plus the raw message the support report still carries. */
export interface PrinterErrorDescription {
	key: string;
	message: string;
}

/**
 * Every raw string a print path can throw, mapped to one line the cashier can act on
 * (roadmap#161 P1). Order matters: the first match wins, so the specific transport
 * failures sit above the generic permission/timeout catches.
 */
const RULES: readonly (readonly [RegExp, string])[] = [
	[/Error invoking remote method/i, 'err_bridge'],
	[/not supported on Windows/i, 'err_windows_usb'],
	[/LIBUSB_ERROR_ACCESS|EACCES|permission/i, 'err_permission'],
	[/Unsupported native printer vendor/i, 'err_unsupported'],
	[/missing its device key|is not connected/i, 'err_reconnect'],
	[/CoverOpen|PaperEnd|paper/i, 'err_paper'],
	[/timed out|timeout|ETIMEDOUT/i, 'err_timeout'],
	[/ECONNREFUSED|refused/i, 'err_refused'],
];

export function describePrinterError(error: unknown): PrinterErrorDescription {
	const message = getErrorMessage(error);
	const matched = RULES.find(([pattern]) => pattern.test(message));
	return { key: `settings.setup_${matched?.[1] ?? 'err_generic'}`, message };
}
