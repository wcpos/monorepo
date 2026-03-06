/**
 * Cross-platform print options
 */
export interface UsePrintExternalURLOptions {
	/** URL to fetch and print. Used when html is not provided. */
	externalURL?: string;
	/** Raw HTML to print directly. Takes priority over externalURL. */
	html?: string;
	onBeforePrint?: () => void | Promise<void>;
	onAfterPrint?: () => void;
	onPrintError?: (errorLocation: string, error: Error) => void;
	/** Web-only: Keep the print iframe after printing */
	preserveAfterPrint?: boolean;
	/** Web-only: Suppress console error messages */
	suppressErrors?: boolean;
}
