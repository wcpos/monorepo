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
	// A receipt fetch that timed out is the receipt server, not the printer: no
	// "the printer did not answer" line for it.
	[/Receipt fetch timed out/i, 'err_generic'],
	[/timed out|timeout|ETIMEDOUT/i, 'err_timeout'],
	[/ECONNREFUSED|refused/i, 'err_refused'],
];

/** The cashier's line for a description's key, as literal translation calls. */
export function printerErrorText(key: string, t: (key: string) => string): string {
	const text: Record<string, string> = {
		'settings.setup_err_bridge': t('settings.setup_err_bridge'),
		'settings.setup_err_windows_usb': t('settings.setup_err_windows_usb'),
		'settings.setup_err_permission': t('settings.setup_err_permission'),
		'settings.setup_err_unsupported': t('settings.setup_err_unsupported'),
		'settings.setup_err_reconnect': t('settings.setup_err_reconnect'),
		'settings.setup_err_paper': t('settings.setup_err_paper'),
		'settings.setup_err_generic': t('settings.setup_err_generic'),
		'settings.setup_err_timeout': t('settings.setup_err_timeout'),
		'settings.setup_err_refused': t('settings.setup_err_refused'),
	};
	return text[key] ?? text['settings.setup_err_generic'];
}

export function describePrinterError(error: unknown): PrinterErrorDescription {
	const message = getErrorMessage(error);
	const matched = RULES.find(([pattern]) => pattern.test(message));
	return { key: `settings.setup_${matched?.[1] ?? 'err_generic'}`, message };
}
