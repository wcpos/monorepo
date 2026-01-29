/**
 * Configuration for the WCPOS auth hook
 */
export interface WcposAuthConfig {
	/** The site to authenticate against */
	site: {
		wcpos_login_url: string;
		name: string;
	} | null;
	/** Extra parameters to pass to the auth URL */
	extraParams?: Record<string, string>;
}

/**
 * Auth response params matching WordPress JWT response
 */
export interface WcposAuthParams {
	access_token: string;
	refresh_token: string;
	uuid: string;
	id: string;
	display_name: string;
	expires_at: number;
	token_type?: string;
}

/**
 * Result from the auth flow
 */
export interface WcposAuthResult {
	type: 'success' | 'error' | 'dismiss' | 'cancel' | 'locked';
	params?: WcposAuthParams;
	error?: string;
	errorCode?: string;
}

/**
 * Return type for useWcposAuth hook
 */
export interface UseWcposAuthReturn {
	/** Whether the auth request is ready to be triggered */
	isReady: boolean;
	/** The auth response (null until auth completes) */
	response: WcposAuthResult | null;
	/** Trigger the auth flow */
	promptAsync: () => Promise<WcposAuthResult | void>;
}
