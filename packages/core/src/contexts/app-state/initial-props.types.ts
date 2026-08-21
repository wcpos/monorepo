import type { ServerStorePayload } from '../../utils/merge-stores';

/**
 * Boot payload injected by the woocommerce-pos plugin (WordPress embedded web
 * mode) into `globalThis.initialProps` before React loads. Every field is
 * optional at the type level: the payload is server-authored and a poisoned or
 * partial payload must not brick boot (hydration's PROCESS_INITIAL_PROPS step
 * is failSoft) — runtime guards, not types, establish what is present.
 */
export interface InitialProps {
	site?: {
		uuid?: string;
		wcpos_api_url?: string;
		wcpos_version?: string;
		[key: string]: unknown;
	};
	wp_credentials?: {
		access_token?: string;
		[key: string]: unknown;
	};
	stores?: ServerStorePayload[];
	logout_url?: string;
	[key: string]: unknown;
}
