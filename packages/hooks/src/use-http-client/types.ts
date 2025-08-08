import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

export type RequestConfig = AxiosRequestConfig;

export interface HttpErrorHandlerContext {
	/** The original error that occurred */
	error: AxiosError;
	/** The original request configuration */
	originalConfig: AxiosRequestConfig;
	/** Function to retry the request with updated config */
	retryRequest: (config?: AxiosRequestConfig) => Promise<AxiosResponse>;
	/** Number of retry attempts made so far */
	retryCount: number;
}

export interface HttpErrorHandler {
	/** Unique identifier for this handler */
	name: string;
	/** Check if this handler can process the given error */
	canHandle: (error: AxiosError) => boolean;
	/** Handle the error - return response to stop chain, throw to continue */
	handle: (context: HttpErrorHandlerContext) => Promise<AxiosResponse | void>;
	/** Whether this handler intercepts errors (stops the chain if successful) */
	intercepts?: boolean;
	/** Priority for handler ordering (higher = runs first) */
	priority?: number;
}

export interface HttpErrorHandlerResult {
	/** Whether the error was handled successfully */
	handled: boolean;
	/** Response if the error was resolved */
	response?: AxiosResponse;
	/** Modified error if handling failed */
	error?: AxiosError;
}
