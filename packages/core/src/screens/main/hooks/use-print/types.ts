/**
 * Cross-platform print options
 */
export interface UsePrintExternalURLOptions {
	externalURL?: string;
	/** Inline HTML to print instead of fetching from externalURL */
	html?: string;
	onBeforePrint?: () => void | Promise<void>;
	onAfterPrint?: () => void;
	onPrintError?: (errorLocation: string, error: Error) => void;
	/** Web-only: Keep the print iframe after printing */
	preserveAfterPrint?: boolean;
	/** Web-only: Suppress console error messages */
	suppressErrors?: boolean;
}
