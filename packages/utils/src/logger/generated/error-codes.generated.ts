// GENERATED — do not edit by hand; run pnpm generate:error-codes

export type ErrorCode =
	| 'SYNC101'
	| 'SYNC111'
	| 'SYNC121'
	| 'SYNC131'
	| 'SYNC201'
	| 'SYNC211'
	| 'SYNC301'
	| 'SYNC311'
	| 'SYNC321'
	| 'AUTH101'
	| 'AUTH201'
	| 'AUTH301'
	| 'AUTH311'
	| 'AUTH401'
	| 'CHECKOUT101'
	| 'CHECKOUT201'
	| 'CHECKOUT211'
	| 'CHECKOUT301'
	| 'PAYMENT101'
	| 'PAYMENT201'
	| 'PAYMENT301'
	| 'PAYMENT401'
	| 'PRINT101'
	| 'PRINT201'
	| 'PRINT301'
	| 'PRODUCT101'
	| 'PRODUCT111'
	| 'PRODUCT201'
	| 'PRODUCT301'
	| 'PRODUCT401'
	| 'LICENSE101'
	| 'LICENSE201'
	| 'LICENSE301'
	| 'CLIENT101'
	| 'CLIENT201'
	| 'CLIENT211'
	| 'CLIENT999';
export type ErrorDomain =
	| 'AUTH'
	| 'SYNC'
	| 'CHECKOUT'
	| 'PAYMENT'
	| 'PRINT'
	| 'PRODUCT'
	| 'LICENSE'
	| 'CLIENT';
export type ErrorSeverity = 'info' | 'warn' | 'error';
export type SafeAction =
	| 'retry'
	| 'retry-after-edit'
	| 'verify-first'
	| 'continue'
	| 'repair-local'
	| 'reconfigure'
	| 'contact-support';
export type RetryPolicy = 'automatic' | 'manual' | 'after-change' | 'never';
export type DataSafety =
	| 'no-impact'
	| 'local-only'
	| 'order-safe'
	| 'money-moved'
	| 'outcome-unknown'
	| 'data-at-risk';
export type Escalation =
	| 'none'
	| 'store-admin'
	| 'site-admin'
	| 'support-with-export'
	| 'payment-provider';

export interface CatalogueEntry {
	code: ErrorCode;
	symbol: string;
	domain: ErrorDomain;
	severity: ErrorSeverity;
	safeAction: SafeAction;
	retryPolicy: RetryPolicy;
	dataSafety: DataSafety;
	escalation: Escalation;
	summary: string;
	docsBody: string;
	introducedIn: string;
	evidence: string;
}

export const ERROR_CATALOGUE: Record<ErrorCode, CatalogueEntry> = {
	SYNC101: {
		code: 'SYNC101',
		symbol: 'LOCAL_DB_WRITE_FAILED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary:
			'This change could not be saved to the local database and remains only on this device.',
		docsBody:
			'Do not clear local data. Reload once, then export diagnostics and contact support if the change still cannot be saved.',
		introducedIn: '1.10.0',
		evidence: 'Sentry 18V/11C; monorepo#163',
	},
	SYNC111: {
		code: 'SYNC111',
		symbol: 'LOCAL_DB_CORRUPTED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'repair-local',
		retryPolicy: 'after-change',
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary: 'Local store data is damaged and needs repair before syncing can continue.',
		docsBody:
			'Run the targeted repair for the affected data, and reset that local data only if the problem returns.',
		introducedIn: '1.10.0',
		evidence: 'Sentry 1RT/2GB',
	},
	SYNC121: {
		code: 'SYNC121',
		symbol: 'SYNC_UNREACHABLE',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'local-only',
		escalation: 'none',
		summary: 'Your store cannot be reached right now, so changes will stay on this device.',
		docsBody:
			'Check the connection and keep working offline; syncing will retry automatically when the store is reachable.',
		introducedIn: '1.10.0',
		evidence: 'Sentry QQ',
	},
	SYNC131: {
		code: 'SYNC131',
		symbol: 'STORE_SERVER_ERROR',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'Your store returned an error, so this action did not complete.',
		docsBody:
			"The store was reached but its server failed to handle the request. This is a problem on the website rather than the POS, so retrying alone may not help: check the site's error log or ask the host to, then retry. Nothing was lost on this device.",
		introducedIn: '1.10.0',
		evidence:
			'private mining SY02002+500; woocommerce-pos#572 (critical error on this website); woocommerce-pos#571 (PHP fatal, disk full)',
	},
	SYNC201: {
		code: 'SYNC201',
		symbol: 'RECORD_REJECTED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'retry-after-edit',
		retryPolicy: 'after-change',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'This record was rejected by your store and is saved only on this device.',
		docsBody:
			'Correct the reason shown for the named record, then retry it. Export diagnostics if it remains rejected.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#832',
	},
	SYNC211: {
		code: 'SYNC211',
		symbol: 'RECORD_INVALID_FIELD',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'retry-after-edit',
		retryPolicy: 'after-change',
		dataSafety: 'local-only',
		escalation: 'none',
		summary: 'This record has a field your store will not accept.',
		docsBody:
			'Fix the named field and retry the record; the local copy remains available until it syncs.',
		introducedIn: '1.10.0',
		evidence: 'pos_data 400 push rejections (B14)',
	},
	SYNC301: {
		code: 'SYNC301',
		symbol: 'SYNC_BEHIND_HEAD',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'repair-local',
		retryPolicy: 'manual',
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary: 'Some older store changes were skipped and must be downloaded again.',
		docsBody:
			'Run a targeted download for the affected data and export diagnostics if the gap remains.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#804',
	},
	SYNC311: {
		code: 'SYNC311',
		symbol: 'SCHEMA_MISMATCH',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'repair-local',
		retryPolicy: 'after-change',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'Local data is from an incompatible version and cannot open yet.',
		docsBody:
			'Reset only the affected local collection, then let it download again from the store.',
		introducedIn: '1.10.0',
		evidence: 'plugin#413',
	},
	SYNC321: {
		code: 'SYNC321',
		symbol: 'SYNC_PARTIAL',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'Some records synced, but one or more records did not.',
		docsBody:
			'Review the named records and their reasons before retrying only the records that did not sync.',
		introducedIn: '1.10.0',
		evidence: 'spec validation set: 89 of 99',
	},
	AUTH101: {
		code: 'AUTH101',
		symbol: 'SESSION_EXPIRED',
		domain: 'AUTH',
		severity: 'warn',
		safeAction: 'retry',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'Your session ended and you need to sign in again.',
		docsBody: 'Sign in again and repeat the request; no local data was lost.',
		introducedIn: '1.10.0',
		evidence: 'Sentry Y5/XR/18R',
	},
	AUTH201: {
		code: 'AUTH201',
		symbol: 'INSUFFICIENT_ROLE',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'store-admin',
		summary: 'Your account does not have permission to perform this action.',
		docsBody: 'Ask a store administrator to grant the required POS capability, then try again.',
		introducedIn: '1.10.0',
		evidence: 'woocommerce_pos_rest_forbidden; plugin#396',
	},
	AUTH301: {
		code: 'AUTH301',
		symbol: 'AUTH_PLUGIN_CONFLICT',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'Another authentication plugin is preventing WCPOS from connecting.',
		docsBody:
			'Ask the site administrator to resolve the named plugin conflict before signing in again.',
		introducedIn: '1.10.0',
		evidence: 'plugin#743',
	},
	AUTH311: {
		code: 'AUTH311',
		symbol: 'REST_ROUTE_MISSING',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'The WCPOS store route is unavailable.',
		docsBody:
			'Ask the site administrator to check whether a security or proxy plugin is stripping WCPOS request headers.',
		introducedIn: '1.10.0',
		evidence: 'plugin#1075',
	},
	AUTH401: {
		code: 'AUTH401',
		symbol: 'TLS_UNTRUSTED',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'A secure connection to this store could not be trusted.',
		docsBody:
			'Use the correct store address and ask the site administrator to repair the certificate before reconnecting.',
		introducedIn: '1.10.0',
		evidence: 'plugin#371',
	},
	CHECKOUT101: {
		code: 'CHECKOUT101',
		symbol: 'CHECKOUT_FAILED_CART_SAFE',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'order-safe',
		escalation: 'none',
		summary: 'Checkout did not finish, and the cart is still safe to retry.',
		docsBody: 'Review the cart and retry checkout; the current cart contents have been preserved.',
		introducedIn: '1.10.0',
		evidence: 'plugin#572',
	},
	CHECKOUT201: {
		code: 'CHECKOUT201',
		symbol: 'CHECKOUT_OUTCOME_UNKNOWN',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'never',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'WCPOS could not confirm whether checkout completed.',
		docsBody:
			'Do not retry blindly. Check the store for the order first, then export diagnostics if its outcome is still unclear.',
		introducedIn: '1.10.0',
		evidence: 'email 26/103; Discord corpus',
	},
	CHECKOUT211: {
		code: 'CHECKOUT211',
		symbol: 'CHECKOUT_EMPTY_RESPONSE',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'never',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'The store returned no checkout result, so the order status is unknown.',
		docsBody: 'Check whether the order was created before trying checkout again.',
		introducedIn: '1.10.0',
		evidence: 'Discord: Empty response from server x15',
	},
	CHECKOUT301: {
		code: 'CHECKOUT301',
		symbol: 'SKU_DUPLICATE',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'retry-after-edit',
		retryPolicy: 'after-change',
		dataSafety: 'order-safe',
		escalation: 'none',
		summary: 'Checkout cannot continue because a product SKU is duplicated or invalid.',
		docsBody: 'Change or remove the named SKU, then retry with the preserved cart.',
		introducedIn: '1.10.0',
		evidence: 'plugin#572',
	},
	PAYMENT101: {
		code: 'PAYMENT101',
		symbol: 'PAYMENT_OK_STATUS_CHECK_FAILED',
		domain: 'PAYMENT',
		severity: 'info',
		safeAction: 'continue',
		retryPolicy: 'never',
		dataSafety: 'money-moved',
		escalation: 'none',
		summary: 'Payment succeeded, but WCPOS could not refresh its status afterward.',
		docsBody:
			'The payment completed and should not be charged again; no action is required unless the displayed status stays stale.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#509',
	},
	PAYMENT201: {
		code: 'PAYMENT201',
		symbol: 'PAYMENT_OUTCOME_UNKNOWN',
		domain: 'PAYMENT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'never',
		dataSafety: 'outcome-unknown',
		escalation: 'payment-provider',
		summary: 'WCPOS could not confirm whether the terminal charged the payment.',
		docsBody:
			'Check the payment terminal before attempting another charge, and contact the payment provider if the result remains unclear.',
		introducedIn: '1.10.0',
		evidence: 'email: terminal charged but POS stuck',
	},
	PAYMENT301: {
		code: 'PAYMENT301',
		symbol: 'GATEWAY_UNAVAILABLE',
		domain: 'PAYMENT',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'The selected payment gateway is unavailable for this store.',
		docsBody:
			'Ask the site administrator to verify that the gateway is supported, enabled, and correctly configured.',
		introducedIn: '1.10.0',
		evidence: 'plugin#367',
	},
	PAYMENT401: {
		code: 'PAYMENT401',
		symbol: 'TERMINAL_PAIRING_INCOMPLETE',
		domain: 'PAYMENT',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'payment-provider',
		summary: 'The payment terminal did not finish pairing with WCPOS.',
		docsBody:
			'Retry pairing after checking the terminal settings, and include the trace ID when contacting the payment provider.',
		introducedIn: '1.10.0',
		evidence: 'plugin#535',
	},
	PRINT101: {
		code: 'PRINT101',
		symbol: 'AUTOPRINT_DID_NOT_START',
		domain: 'PRINT',
		severity: 'warn',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'Automatic printing did not start for this receipt.',
		docsBody:
			'Check the selected printer, template, and connection, then use Print now to print the receipt manually.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#121',
	},
	PRINT201: {
		code: 'PRINT201',
		symbol: 'PRINT_JOB_FAILED',
		domain: 'PRINT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'WCPOS could not confirm that the print job completed.',
		docsBody: 'Check the printer before retrying so the receipt is not printed twice.',
		introducedIn: '1.10.0',
		evidence: 'plugin#1362',
	},
	PRINT301: {
		code: 'PRINT301',
		symbol: 'PRINTER_UNREACHABLE',
		domain: 'PRINT',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'The selected printer cannot be reached.',
		docsBody: 'Check that the printer is powered on and connected, then try printing again.',
		introducedIn: '1.10.0',
		evidence: 'email: Waiting for printer',
	},
	PRODUCT101: {
		code: 'PRODUCT101',
		symbol: 'PRODUCT_SAVE_FAILED',
		domain: 'PRODUCT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'This product could not be saved to your store.',
		docsBody:
			'Review the reported cause before retrying: reconnect for a network error, fix invalid fields, or refresh a conflicting product.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#489',
	},
	PRODUCT111: {
		code: 'PRODUCT111',
		symbol: 'VARIATION_ADD_FAILED',
		domain: 'PRODUCT',
		severity: 'error',
		safeAction: 'retry-after-edit',
		retryPolicy: 'after-change',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'This variation could not be added to the product.',
		docsBody:
			'Review and correct the variation fields, then retry; export diagnostics if it is still rejected.',
		introducedIn: '1.10.0',
		evidence: 'plugin#361',
	},
	PRODUCT201: {
		code: 'PRODUCT201',
		symbol: 'PRODUCT_IMAGE_UNAVAILABLE',
		domain: 'PRODUCT',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'This product image is unavailable, but the product can still be sold.',
		docsBody: 'Continue the sale without the image; WCPOS will try to load it again later.',
		introducedIn: '1.10.0',
		evidence: 'Sentry 1QX/1PX',
	},
	PRODUCT301: {
		code: 'PRODUCT301',
		symbol: 'SEARCH_NO_RESULTS_REASON',
		domain: 'PRODUCT',
		severity: 'info',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'No products matched the current search and filters.',
		docsBody:
			'Review spaces, category filters, and whether the local product index has finished syncing before searching again.',
		introducedIn: '1.10.0',
		evidence: 'plugin#1114; monorepo#750',
	},
	PRODUCT401: {
		code: 'PRODUCT401',
		symbol: 'STOCK_STALE',
		domain: 'PRODUCT',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'data-at-risk',
		escalation: 'site-admin',
		summary: 'The displayed stock may be older than the store stock.',
		docsBody:
			'Verify current stock in the store before completing a sale that could oversell the item.',
		introducedIn: '1.10.0',
		evidence: 'plugin#227; plugin#389',
	},
	LICENSE101: {
		code: 'LICENSE101',
		symbol: 'LICENSE_NOT_ACTIVE_HERE',
		domain: 'LICENSE',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'Your WCPOS Pro license is not active for this store or device.',
		docsBody:
			'Check the local, licensing-server, and updater status, then activate the license for the named store.',
		introducedIn: '1.10.0',
		evidence: 'email: active here, inactive there',
	},
	LICENSE201: {
		code: 'LICENSE201',
		symbol: 'VERSION_SKEW_PRO_DISABLED',
		domain: 'LICENSE',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'WCPOS Pro is disabled because its version does not match WCPOS.',
		docsBody: 'Update the named WCPOS or WCPOS Pro component so both versions are compatible.',
		introducedIn: '1.10.0',
		evidence: 'email: Pro/free version skew',
	},
	LICENSE301: {
		code: 'LICENSE301',
		symbol: 'UPDATER_NOT_AUTHORIZED',
		domain: 'LICENSE',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'The updater is not authorized to download WCPOS Pro updates.',
		docsBody: 'Re-authorize the updater for this store, then check for updates again.',
		introducedIn: '1.10.0',
		evidence: 'email: updater failures',
	},
	CLIENT101: {
		code: 'CLIENT101',
		symbol: 'APP_START_FAILED',
		domain: 'CLIENT',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'WCPOS could not finish starting.',
		docsBody:
			'Restart once, then export diagnostics with the app version and device engine if startup still fails.',
		introducedIn: '1.10.0',
		evidence: 'Sentry 195; plugin#362',
	},
	CLIENT201: {
		code: 'CLIENT201',
		symbol: 'OUT_OF_MEMORY',
		domain: 'CLIENT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'WCPOS ran out of memory and could not finish the operation.',
		docsBody:
			'Restart WCPOS and retry once; export diagnostics if the device runs out of memory again.',
		introducedIn: '1.10.0',
		evidence: 'Sentry W8',
	},
	CLIENT211: {
		code: 'CLIENT211',
		symbol: 'NATIVE_CRASH',
		domain: 'CLIENT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'WCPOS stopped because of a device-level crash.',
		docsBody: 'Restart WCPOS and export diagnostics if the crash repeats.',
		introducedIn: '1.10.0',
		evidence: 'Sentry 16K/1F8/2GF',
	},
	CLIENT999: {
		code: 'CLIENT999',
		symbol: 'UNEXPECTED_ERROR',
		domain: 'CLIENT',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'manual',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'WCPOS encountered an unexpected error.',
		docsBody:
			'Try the action once more, then export diagnostics and contact support if it fails again.',
		introducedIn: '1.10.0',
		evidence: 'spec §3 catch-all; Sentry audit',
	},
};

export const ERROR_CODES = {
	LOCAL_DB_WRITE_FAILED: 'SYNC101',
	LOCAL_DB_CORRUPTED: 'SYNC111',
	SYNC_UNREACHABLE: 'SYNC121',
	STORE_SERVER_ERROR: 'SYNC131',
	RECORD_REJECTED: 'SYNC201',
	RECORD_INVALID_FIELD: 'SYNC211',
	SYNC_BEHIND_HEAD: 'SYNC301',
	SCHEMA_MISMATCH: 'SYNC311',
	SYNC_PARTIAL: 'SYNC321',
	SESSION_EXPIRED: 'AUTH101',
	INSUFFICIENT_ROLE: 'AUTH201',
	AUTH_PLUGIN_CONFLICT: 'AUTH301',
	REST_ROUTE_MISSING: 'AUTH311',
	TLS_UNTRUSTED: 'AUTH401',
	CHECKOUT_FAILED_CART_SAFE: 'CHECKOUT101',
	CHECKOUT_OUTCOME_UNKNOWN: 'CHECKOUT201',
	CHECKOUT_EMPTY_RESPONSE: 'CHECKOUT211',
	SKU_DUPLICATE: 'CHECKOUT301',
	PAYMENT_OK_STATUS_CHECK_FAILED: 'PAYMENT101',
	PAYMENT_OUTCOME_UNKNOWN: 'PAYMENT201',
	GATEWAY_UNAVAILABLE: 'PAYMENT301',
	TERMINAL_PAIRING_INCOMPLETE: 'PAYMENT401',
	AUTOPRINT_DID_NOT_START: 'PRINT101',
	PRINT_JOB_FAILED: 'PRINT201',
	PRINTER_UNREACHABLE: 'PRINT301',
	PRODUCT_SAVE_FAILED: 'PRODUCT101',
	VARIATION_ADD_FAILED: 'PRODUCT111',
	PRODUCT_IMAGE_UNAVAILABLE: 'PRODUCT201',
	SEARCH_NO_RESULTS_REASON: 'PRODUCT301',
	STOCK_STALE: 'PRODUCT401',
	LICENSE_NOT_ACTIVE_HERE: 'LICENSE101',
	VERSION_SKEW_PRO_DISABLED: 'LICENSE201',
	UPDATER_NOT_AUTHORIZED: 'LICENSE301',
	APP_START_FAILED: 'CLIENT101',
	OUT_OF_MEMORY: 'CLIENT201',
	NATIVE_CRASH: 'CLIENT211',
	UNEXPECTED_ERROR: 'CLIENT999',
} as const satisfies Record<string, ErrorCode>;
