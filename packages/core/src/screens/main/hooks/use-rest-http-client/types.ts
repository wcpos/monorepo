export interface TokenRefreshResponse {
	access_token: string;
	refresh_token?: string;
	expires_in?: number;
}

export interface LoginResponse {
	type: 'success' | 'error' | 'cancel';
	params?: {
		access_token: string;
		refresh_token: string;
		expires_in: number;
	};
	error?: string;
}

export interface WPCredentials {
	id?: number;
	refresh_token?: string;
	expires_in?: number;
	incrementalPatch: (data: { access_token: string; expires_at: number }) => Promise<any>;
}

// Duck type for the SiteDocument fields this module reads. Every field is
// optional because the RxDB schema makes them optional — callers pass the real
// document and the handlers guard at runtime.
export interface Site {
	name?: string;
	wcpos_api_url?: string;
	wcpos_login_url?: string;
	wp_api_url?: string;
	use_jwt_as_param?: boolean;
	use_rest_route_param?: boolean;
	incrementalPatch: (data: any) => void;
}
