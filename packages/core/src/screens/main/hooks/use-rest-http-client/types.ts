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
	access_token$: any;
	id?: number;
	refresh_token?: string;
	expires_in?: number;
	incrementalPatch: (data: { access_token: string; expires_at: number }) => Promise<any>;
}

export interface Site {
	name: string;
	wcpos_api_url: string;
	wcpos_login_url: string;
	wp_api_url: string;
	use_jwt_as_param?: boolean;
	incrementalPatch: (data: any) => void;
}
