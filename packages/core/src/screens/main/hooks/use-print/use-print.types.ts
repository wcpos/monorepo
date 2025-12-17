import type * as React from 'react';

/**
 * Cross-platform print options for usePrint hook.
 *
 * - Web: Uses `contentRef` with react-to-print
 * - Native: Uses `html` with expo-print
 */
export interface UsePrintOptions {
	/**
	 * Web only: Reference to the component to print.
	 * Used by react-to-print on web.
	 */
	contentRef?: React.RefObject<Element | null>;

	/**
	 * Native only: HTML string to print.
	 * Used by expo-print on iOS/Android.
	 */
	html?: string;

	/**
	 * Callback fired before printing starts.
	 * Can return a Promise to delay printing.
	 */
	onBeforePrint?: () => void | Promise<void>;

	/**
	 * Callback fired after printing completes.
	 */
	onAfterPrint?: () => void;

	/**
	 * Callback fired when a print error occurs.
	 */
	onPrintError?: (errorLocation: string, error: Error) => void;

	/**
	 * Web only: Custom page styles for printing.
	 */
	pageStyle?: string;
}
