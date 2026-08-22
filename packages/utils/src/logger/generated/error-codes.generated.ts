// GENERATED — do not edit by hand; run pnpm generate:error-codes

export type ErrorCode =
	| 'SYNC101'
	| 'SYNC111'
	| 'SYNC121'
	| 'SYNC131'
	| 'SYNC141'
	| 'SYNC201'
	| 'SYNC211'
	| 'SYNC301'
	| 'SYNC311'
	| 'SYNC321'
	| 'SYNC331'
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
	| 'CLIENT999'
	| 'SYNC999'
	| 'AUTH999'
	| 'CHECKOUT999'
	| 'PAYMENT999'
	| 'PRINT999'
	| 'PRODUCT999'
	| 'LICENSE999'
	| 'SYNC401'
	| 'SYNC411'
	| 'SYNC221'
	| 'CHECKOUT401'
	| 'PRODUCT411'
	| 'CLIENT111'
	| 'CLIENT121'
	| 'AUTH111'
	| 'AUTH121'
	| 'AUTH321'
	| 'AUTH411'
	| 'AUTH421'
	| 'AUTH431'
	| 'AUTH441'
	| 'HOST101'
	| 'HOST111'
	| 'HOST121'
	| 'HOST131'
	| 'HOST141'
	| 'HOST151'
	| 'HOST161'
	| 'SYNC151'
	| 'SYNC161'
	| 'SYNC171'
	| 'CHECKOUT111'
	| 'PRODUCT321'
	| 'PRODUCT421'
	| 'PRINT311'
	| 'CLIENT131';
export type ErrorDomain =
	'AUTH' | 'SYNC' | 'CHECKOUT' | 'PAYMENT' | 'PRINT' | 'PRODUCT' | 'LICENSE' | 'CLIENT' | 'HOST';
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
	'no-impact' | 'local-only' | 'order-safe' | 'money-moved' | 'outcome-unknown' | 'data-at-risk';
export type Escalation =
	'none' | 'store-admin' | 'site-admin' | 'support-with-export' | 'payment-provider';

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
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary:
			'This change could not be saved to the local database and remains only on this device.',
		docsBody:
			'Do not clear or reload local data. Export diagnostics and contact support before retrying or repairing anything.',
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
	SYNC141: {
		code: 'SYNC141',
		symbol: 'STORE_RATE_LIMITED',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'retry',
		retryPolicy: 'automatic',
		dataSafety: 'local-only',
		escalation: 'site-admin',
		summary: 'Your store is limiting requests temporarily, so this action will retry later.',
		docsBody:
			"Wait before retrying. If rate limits continue, ask the site administrator or host to review the store's request limits.",
		introducedIn: '1.10.0',
		evidence: 'HTTP 429; monorepo#884',
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
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary: 'Local data is from an incompatible version and cannot open yet.',
		docsBody:
			'Do not reset the affected local collection when this device may hold changes that never reached your store — resetting deletes the only local copy. Export diagnostics to help support investigate, then contact support for recovery guidance.',
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
	SYNC331: {
		code: 'SYNC331',
		symbol: 'LOCAL_RECORD_DIVERGED',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'repair-local',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'This record on the device does not match your store and needs local repair.',
		docsBody:
			"Nothing you entered is waiting to be sent. The device's copy of a record your store owns has drifted from the store's copy; repair it according to the status shown in the log.",
		introducedIn: '1.10.0',
		evidence: 'monorepo: dev-pro session 2026-08-19, 138 products escalated per sweep',
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
	SYNC999: {
		code: 'SYNC999',
		symbol: 'SYNC_UNEXPECTED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'automatic',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'Syncing hit an unexpected problem.',
		docsBody:
			'Your sales are safe on this device. Wait for the automatic retry; if this code keeps appearing, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1): generic fallback = registry debt',
	},
	AUTH999: {
		code: 'AUTH999',
		symbol: 'AUTH_UNEXPECTED',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'Signing in or staying signed in hit an unexpected problem.',
		docsBody:
			'Try the action once more. If it repeats, sign out and back in, then export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	CHECKOUT999: {
		code: 'CHECKOUT999',
		symbol: 'CHECKOUT_UNEXPECTED',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'Checkout hit an unexpected problem.',
		docsBody:
			'Check the order in your store admin before charging the customer again. Export diagnostics and contact support if the problem repeats.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	PAYMENT999: {
		code: 'PAYMENT999',
		symbol: 'PAYMENT_UNEXPECTED',
		domain: 'PAYMENT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'outcome-unknown',
		escalation: 'support-with-export',
		summary: 'Payment handling hit an unexpected problem.',
		docsBody:
			'Confirm whether the payment went through before retrying. Export diagnostics and contact support if it is unclear.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	PRINT999: {
		code: 'PRINT999',
		symbol: 'PRINT_UNEXPECTED',
		domain: 'PRINT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'Printing hit an unexpected problem.',
		docsBody:
			'Try printing again. If it keeps failing, reprint from the order screen and contact support with diagnostics.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	PRODUCT999: {
		code: 'PRODUCT999',
		symbol: 'PRODUCT_UNEXPECTED',
		domain: 'PRODUCT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'Loading or updating products hit an unexpected problem.',
		docsBody:
			'Try again. If product data still looks wrong afterwards, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	LICENSE999: {
		code: 'LICENSE999',
		symbol: 'LICENSE_UNEXPECTED',
		domain: 'LICENSE',
		severity: 'error',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'License checking hit an unexpected problem.',
		docsBody:
			'The POS keeps working. If Pro features stay locked, re-enter your license key, then contact support.',
		introducedIn: '1.10.0',
		evidence: 'coverage net (map #1136, A1.1)',
	},
	SYNC401: {
		code: 'SYNC401',
		symbol: 'SYNC_TASK_CRASHED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'A background sync task stopped unexpectedly before finishing.',
		docsBody:
			'The POS restarts these tasks automatically and no order data is affected. If this code keeps appearing, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: engine.lane.tick, maintenance.lane.error',
	},
	SYNC411: {
		code: 'SYNC411',
		symbol: 'DEMAND_REQUEST_FLOOD',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'This device asked the store for data far more often than normal.',
		docsBody:
			'Nothing was slowed down or blocked, and no order data is affected — this is a detection-only alarm. Sustained request floods usually indicate an app problem (a screen re-requesting the same data in a loop) rather than anything you did. If this code keeps appearing, export diagnostics and contact support so the loop can be found and fixed.',
		introducedIn: '1.10.0',
		evidence:
			'monorepo#1134 item 2 ruling (2026-08-14): demand path stays uncapped, flood detection only; runaway class monorepo#888',
	},
	SYNC221: {
		code: 'SYNC221',
		symbol: 'RECORD_CONFLICT',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'after-change',
		dataSafety: 'order-safe',
		escalation: 'none',
		summary: 'A change on this device clashed with an edit made in your store.',
		docsBody:
			'Open the record and check which version is correct. The POS keeps both sides safe until the clash is settled — nothing is lost.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: push.conflict, queue.write.conflict-transition',
	},
	CHECKOUT401: {
		code: 'CHECKOUT401',
		symbol: 'TOTALS_DIVERGED',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'verify-first',
		retryPolicy: 'manual',
		dataSafety: 'money-moved',
		escalation: 'support-with-export',
		summary: 'Your store calculated different totals for this order than the till showed.',
		docsBody:
			"Check the order in your store admin before taking any further payment — the store's totals are the source of truth. If the difference is unexpected, export diagnostics and contact support.",
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: push.money-divergence; server-calc ruling',
	},
	PRODUCT411: {
		code: 'PRODUCT411',
		symbol: 'BARCODE_CONFIG_UNAVAILABLE',
		domain: 'PRODUCT',
		severity: 'warn',
		safeAction: 'retry',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'Barcode scanning settings could not be loaded, so scans may not match products.',
		docsBody:
			'The POS keeps trying to load these settings in the background. If scanning stays unreliable, reload the app once.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: engine.barcode-selector-hydrate-failed',
	},
	CLIENT111: {
		code: 'CLIENT111',
		symbol: 'APP_START_SLOW',
		domain: 'CLIENT',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'Syncing is taking longer than expected to start.',
		docsBody:
			'This usually resolves by itself within a minute. If the app stays in this state, reload it once before anything else.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: engine.ready-stalled',
	},
	CLIENT121: {
		code: 'CLIENT121',
		symbol: 'MULTI_TAB_LIMITED',
		domain: 'CLIENT',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'never',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'This browser lets only one tab send changes at a time.',
		docsBody:
			'You can keep using every tab — they all share the same local data. One tab quietly handles the syncing for all of them.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1137 inventory: engine.write-leader.degraded',
	},
	AUTH111: {
		code: 'AUTH111',
		symbol: 'CREDENTIALS_REJECTED',
		domain: 'AUTH',
		severity: 'warn',
		safeAction: 'retry-after-edit',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'The store did not accept the sign-in credentials.',
		docsBody:
			'Re-enter the username and password, or reset the password in WordPress if it keeps failing. No order data is affected.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	AUTH121: {
		code: 'AUTH121',
		symbol: 'SIGNED_IN_AS_WRONG_USER',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'The signed-in store account does not match the cashier on this till.',
		docsBody:
			"Each cashier keeps their own till data, so working under another account can misfile orders. Sign out, then sign in with the cashier's own account.",
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	AUTH321: {
		code: 'AUTH321',
		symbol: 'WOOCOMMERCE_MISSING',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'reconfigure',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'WooCommerce is not active on this site, so WCPOS cannot connect.',
		docsBody:
			'WCPOS requires the WooCommerce plugin. Ask the site administrator to install or reactivate WooCommerce, then connect again.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	AUTH411: {
		code: 'AUTH411',
		symbol: 'STORE_URL_INVALID',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'retry-after-edit',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'The store address is missing or not a valid URL.',
		docsBody:
			"Check the address for typos and include the full https:// URL of the store's WordPress site, then try again.",
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	AUTH421: {
		code: 'AUTH421',
		symbol: 'AUTH_TOKEN_BLOCKED_BY_HOST',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: "The store's server is blocking the login token on every channel this app can use.",
		docsBody:
			'The app confirmed the store is reachable, but the server (or a firewall, proxy, or security plugin in front of it) strips the Authorization header and also blocks the token when it is sent as a URL parameter. There is no third way to deliver a login token, so this must be fixed on the server.',
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 1 (research §c1)',
	},
	AUTH431: {
		code: 'AUTH431',
		symbol: 'REST_TRANSPORT_BLOCKED',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: "The store's REST API did not answer on any address form this app can use.",
		docsBody:
			"The app tried the store's REST API at its normal address (/wp-json/...) and at WordPress's built-in fallback address (/?rest_route=...), and neither answered. The store's website itself may be up — this is specifically the REST API being unreachable, usually a security plugin hiding it or a firewall rule blocking it.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 (B5 both-transports verdict, ADR 0031 §3)',
	},
	AUTH441: {
		code: 'AUTH441',
		symbol: 'AUTH_TOKEN_TOO_LARGE',
		domain: 'AUTH',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: 'The login token is larger than this server accepts.',
		docsBody:
			"The server rejected the login token for size: a 400 when it travels in the Authorization header, or a 414 when it travels in the URL. No client-side encoding can shrink it — the server's header/URL size limits must be raised, or the token made smaller.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 7 (research §c7)',
	},
	HOST101: {
		code: 'HOST101',
		symbol: 'CORS_PREFLIGHT_BLOCKED',
		domain: 'HOST',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary:
			"The server is blocking the browser's permission check (CORS preflight), so the web app cannot reach it.",
		docsBody:
			'Browsers send an OPTIONS request before any cross-origin API call that carries custom headers. Something in front of this store — usually a firewall rule — is blocking OPTIONS, so the browser never sends the real request. Native apps are unaffected; the fix is server-side.',
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 2 (research §c2)',
	},
	HOST111: {
		code: 'HOST111',
		symbol: 'CORS_MISCONFIGURED',
		domain: 'HOST',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary:
			"The server's cross-origin (CORS) configuration is broken, so the browser refuses its responses.",
		docsBody:
			'The store answers, but its CORS response headers are wrong — duplicated, set to the wrong origin, or missing on error responses. The browser then hides the real answer from the web app, which also masks every other error behind a generic network failure. The fix is server-side: exactly one Access-Control-Allow-Origin, present on every status code.',
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 rows 3/4 (research §c3/§c4)',
	},
	HOST121: {
		code: 'HOST121',
		symbol: 'BOT_CHALLENGE_BLOCKING_API',
		domain: 'HOST',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: "A bot-protection page is answering instead of the store's API.",
		docsBody:
			"The store's REST API is returning an HTML challenge page (bot protection, CAPTCHA, or DDoS interstitial) where the app expects JSON. A point-of-sale app cannot solve a browser challenge; the store's REST API needs to be allow-listed in the protection service.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 10 (research §c10)',
	},
	HOST131: {
		code: 'HOST131',
		symbol: 'RESPONSE_HEADERS_REJECTED',
		domain: 'HOST',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary:
			"A proxy in front of the store rejects the server's responses for having too many headers.",
		docsBody:
			"A cache or proxy layer (commonly Varnish) enforces a limit on response header count or size. The store's lightweight endpoints fit, but full API responses exceed the limit and come back as 503s from the proxy, not from WordPress. The limit must be raised on that layer.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 13 (research §c13, P26)',
	},
	HOST141: {
		code: 'HOST141',
		symbol: 'SEARCH_BLOCKED_BY_WAF',
		domain: 'HOST',
		severity: 'warn',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: "The host's security filter is blocking product searches.",
		docsBody:
			"A firewall rule on this host rejects REST requests whose query string contains non-ASCII characters or SQL-looking words. Product names with accents, and searches containing words like 'select' or 'union', will fail with a 403 even though they are ordinary catalogue searches. The till works otherwise; searches will be unreliable until the rule is relaxed.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 12 (P15/P16)',
	},
	HOST151: {
		code: 'HOST151',
		symbol: 'CACHE_SHARED_REPLAY',
		domain: 'HOST',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'after-change',
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary: "A cache in front of the store is replaying one person's API responses to everyone.",
		docsBody:
			"A caching layer is serving stored REST API responses without checking who is asking: the app sent two differently-authenticated probes and received the first probe's answer both times. On a live store this means one cashier could see another's data, so connecting is blocked until the cache excludes the store's API. This is a hosting-layer problem — WordPress itself always answers per-user.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 8 (research §c8, P25/P30)',
	},
	HOST161: {
		code: 'HOST161',
		symbol: 'HOST_RATE_LIMITED',
		domain: 'HOST',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'none',
		summary: "The host is rate-limiting this store's tills.",
		docsBody:
			"The server keeps answering 429 (too many requests) even though the app is already backing off and honoring the server's Retry-After delays. Several tills on one internet connection share one address, so per-source rate limits treat them as a single very busy client. Syncing continues automatically but will lag until the limit is raised.",
		introducedIn: '1.10.0',
		evidence: 'wcpos-infra#73 §5 row 11 (research §c11)',
	},
	SYNC151: {
		code: 'SYNC151',
		symbol: 'STORE_RESPONSE_MALFORMED',
		domain: 'SYNC',
		severity: 'warn',
		safeAction: 'continue',
		retryPolicy: 'automatic',
		dataSafety: 'no-impact',
		escalation: 'site-admin',
		summary: 'Your store sent a malformed response that WCPOS had to repair before reading.',
		docsBody:
			"This usually means a plugin or PHP notice is printing extra output into store responses. WCPOS recovered this one, but repairs are not guaranteed — ask the site administrator to check the site's error log.",
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	SYNC161: {
		code: 'SYNC161',
		symbol: 'LOCAL_DB_UNAVAILABLE',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'repair-local',
		retryPolicy: 'manual',
		dataSafety: 'data-at-risk',
		escalation: 'support-with-export',
		summary:
			'The local database on this device stopped responding, so actions that need it are paused.',
		docsBody:
			'Restart WCPOS to reconnect the local database. Unsaved changes on this device may not have been written; check recent orders after restarting. If it keeps happening, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	SYNC171: {
		code: 'SYNC171',
		symbol: 'LOCAL_DB_SETUP_FAILED',
		domain: 'SYNC',
		severity: 'error',
		safeAction: 'repair-local',
		retryPolicy: 'manual',
		dataSafety: 'local-only',
		escalation: 'support-with-export',
		summary: 'A local database on this device could not be created or removed.',
		docsBody:
			'Restart WCPOS and try again. If it keeps failing, the device may be low on storage or the browser profile may be restricting storage; free up space, then contact support if it persists.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	CHECKOUT111: {
		code: 'CHECKOUT111',
		symbol: 'CART_UPDATE_FAILED',
		domain: 'CHECKOUT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'order-safe',
		escalation: 'support-with-export',
		summary: 'This change could not be applied to the cart, which is unchanged.',
		docsBody:
			'The item, fee, shipping line, or coupon was not added and nothing was removed. Try the action again; if it keeps failing, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	PRODUCT321: {
		code: 'PRODUCT321',
		symbol: 'BARCODE_AMBIGUOUS',
		domain: 'PRODUCT',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'store-admin',
		summary: 'More than one product matches this barcode.',
		docsBody:
			'WCPOS cannot pick between them safely, so nothing was added. Search for the product by name, and give each product a unique barcode in the store to fix the clash.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	PRODUCT421: {
		code: 'PRODUCT421',
		symbol: 'VARIABLE_PRICE_META_INVALID',
		domain: 'PRODUCT',
		severity: 'warn',
		safeAction: 'verify-first',
		retryPolicy: 'after-change',
		dataSafety: 'no-impact',
		escalation: 'store-admin',
		summary:
			"This product's variation price data could not be read, so displayed prices may be wrong or missing.",
		docsBody:
			'Re-save the product in WooCommerce to rebuild its price data, or contact support if many products show this.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	PRINT311: {
		code: 'PRINT311',
		symbol: 'RECEIPT_DELIVERY_FAILED',
		domain: 'PRINT',
		severity: 'error',
		safeAction: 'retry',
		retryPolicy: 'manual',
		dataSafety: 'order-safe',
		escalation: 'none',
		summary: 'This receipt could not be emailed or downloaded.',
		docsBody:
			"The sale itself is unaffected. Check the email address and the device's connection, then try again from the order's receipt screen.",
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
	CLIENT131: {
		code: 'CLIENT131',
		symbol: 'REQUEST_QUEUE_OVERFLOW',
		domain: 'CLIENT',
		severity: 'error',
		safeAction: 'contact-support',
		retryPolicy: 'manual',
		dataSafety: 'no-impact',
		escalation: 'support-with-export',
		summary: 'WCPOS queued too many requests at once and dropped some.',
		docsBody:
			'This is usually an app defect rather than a store problem. Restart WCPOS; if the code returns, export diagnostics and contact support.',
		introducedIn: '1.10.0',
		evidence: 'monorepo#1151 legacy-table migration',
	},
};

export const ERROR_CODES = {
	LOCAL_DB_WRITE_FAILED: 'SYNC101',
	LOCAL_DB_CORRUPTED: 'SYNC111',
	SYNC_UNREACHABLE: 'SYNC121',
	STORE_SERVER_ERROR: 'SYNC131',
	STORE_RATE_LIMITED: 'SYNC141',
	RECORD_REJECTED: 'SYNC201',
	RECORD_INVALID_FIELD: 'SYNC211',
	SYNC_BEHIND_HEAD: 'SYNC301',
	SCHEMA_MISMATCH: 'SYNC311',
	SYNC_PARTIAL: 'SYNC321',
	LOCAL_RECORD_DIVERGED: 'SYNC331',
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
	SYNC_UNEXPECTED: 'SYNC999',
	AUTH_UNEXPECTED: 'AUTH999',
	CHECKOUT_UNEXPECTED: 'CHECKOUT999',
	PAYMENT_UNEXPECTED: 'PAYMENT999',
	PRINT_UNEXPECTED: 'PRINT999',
	PRODUCT_UNEXPECTED: 'PRODUCT999',
	LICENSE_UNEXPECTED: 'LICENSE999',
	SYNC_TASK_CRASHED: 'SYNC401',
	DEMAND_REQUEST_FLOOD: 'SYNC411',
	RECORD_CONFLICT: 'SYNC221',
	TOTALS_DIVERGED: 'CHECKOUT401',
	BARCODE_CONFIG_UNAVAILABLE: 'PRODUCT411',
	APP_START_SLOW: 'CLIENT111',
	MULTI_TAB_LIMITED: 'CLIENT121',
	CREDENTIALS_REJECTED: 'AUTH111',
	SIGNED_IN_AS_WRONG_USER: 'AUTH121',
	WOOCOMMERCE_MISSING: 'AUTH321',
	STORE_URL_INVALID: 'AUTH411',
	AUTH_TOKEN_BLOCKED_BY_HOST: 'AUTH421',
	REST_TRANSPORT_BLOCKED: 'AUTH431',
	AUTH_TOKEN_TOO_LARGE: 'AUTH441',
	CORS_PREFLIGHT_BLOCKED: 'HOST101',
	CORS_MISCONFIGURED: 'HOST111',
	BOT_CHALLENGE_BLOCKING_API: 'HOST121',
	RESPONSE_HEADERS_REJECTED: 'HOST131',
	SEARCH_BLOCKED_BY_WAF: 'HOST141',
	CACHE_SHARED_REPLAY: 'HOST151',
	HOST_RATE_LIMITED: 'HOST161',
	STORE_RESPONSE_MALFORMED: 'SYNC151',
	LOCAL_DB_UNAVAILABLE: 'SYNC161',
	LOCAL_DB_SETUP_FAILED: 'SYNC171',
	CART_UPDATE_FAILED: 'CHECKOUT111',
	BARCODE_AMBIGUOUS: 'PRODUCT321',
	VARIABLE_PRICE_META_INVALID: 'PRODUCT421',
	RECEIPT_DELIVERY_FAILED: 'PRINT311',
	REQUEST_QUEUE_OVERFLOW: 'CLIENT131',
} as const satisfies Record<string, ErrorCode>;
