/**
 * Initial Props for Web
 *
 * On web, the app can run in two modes:
 * 1. WordPress embedded mode: initialProps are injected by the woocommerce-pos plugin
 *    into globalThis.initialProps before React loads. Contains site, wp_credentials, stores.
 * 2. Standalone mode: No initialProps, user connects to a site manually via the auth flow.
 *
 * We export null when there are no valid initialProps to ensure truthy checks work correctly.
 */
interface InitialProps {
	site: Record<string, unknown>;
	wp_credentials: Record<string, unknown>;
	stores: Array<Record<string, unknown>>;
	logout_url?: string;
	[key: string]: unknown;
}

function getInitialProps(): InitialProps | null {
	const props = (globalThis as any).initialProps;

	// Check if we have valid WordPress initialProps
	// Must have at least site and wp_credentials to be considered valid
	if (props && typeof props === 'object' && props.site && props.wp_credentials) {
		return Object.freeze(props) as InitialProps;
	}

	return null;
}

const initialProps = getInitialProps();

export { initialProps };
export type { InitialProps };
