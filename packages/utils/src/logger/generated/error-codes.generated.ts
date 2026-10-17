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
	| 'SYNC341'
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
	| 'AUTH331'
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
	| 'SYNC181'
	| 'CHECKOUT111'
	| 'PRODUCT321'
	| 'PRODUCT421'
	| 'PRINT311'
	| 'CLIENT131'
	| 'CLIENT141'
	| 'CLIENT142'
	| 'CLIENT143'
	| 'CLIENT144'
	| 'CHECKOUT411'
	| 'CHECKOUT421'
	| 'CLIENT151'
	| 'AUTH131';
export type ErrorDomain =
	'AUTH' | 'SYNC' | 'CHECKOUT' | 'PAYMENT' | 'PRINT' | 'PRODUCT' | 'LICENSE' | 'CLIENT' | 'HOST';
export type ErrorSeverity = 'info' | 'warn' | 'error';
export type DataSafety =
	'no-impact' | 'local-only' | 'order-safe' | 'money-moved' | 'outcome-unknown' | 'data-at-risk';

export interface CatalogueEntry {
	code: ErrorCode;
	symbol: string;
	domain: ErrorDomain;
	severity: ErrorSeverity;
	actionHint: string;
	dataSafety: DataSafety;
	summary: string;
}

export const ERROR_CATALOGUE: Record<ErrorCode, CatalogueEntry> = {
	SYNC101: {
		code: 'SYNC101',
		symbol: 'LOCAL_DB_WRITE_FAILED',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"Free up device storage, then check the change shows up. If it's missing, enter it again. Contact support if it repeats.",
		dataSafety: 'data-at-risk',
		summary: "WCPOS couldn't write a change to this device's storage.",
	},
	SYNC111: {
		code: 'SYNC111',
		symbol: 'LOCAL_DB_CORRUPTED',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"Tap Copy debug info at the top of Logs and send it to WCPOS support. Don't reinstall.",
		dataSafety: 'data-at-risk',
		summary: "Some data stored on this device is damaged, so it can't sync.",
	},
	SYNC121: {
		code: 'SYNC121',
		symbol: 'SYNC_UNREACHABLE',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			'Nothing to do — keep selling. Changes send automatically when the connection returns.',
		dataSafety: 'no-impact',
		summary: "Your store can't be reached right now.",
	},
	SYNC131: {
		code: 'SYNC131',
		symbol: 'STORE_SERVER_ERROR',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			'Try the action again. If it keeps happening, ask your site admin to check WooCommerce → Status → Logs.',
		dataSafety: 'local-only',
		summary: "Your store had an error and didn't finish this request.",
	},
	SYNC141: {
		code: 'SYNC141',
		symbol: 'STORE_RATE_LIMITED',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			"Nothing to do — WCPOS retries automatically. If this appears every day, ask your site admin about the store's rate limit.",
		dataSafety: 'no-impact',
		summary: 'Your store asked WCPOS to slow down for a moment.',
	},
	SYNC201: {
		code: 'SYNC201',
		symbol: 'RECORD_REJECTED',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"Read the store's reason. If Store health → Database lists the change, fix the record and tap Send again, or Discard it. If not, the store's version was restored — make the change again if it's still needed.",
		dataSafety: 'local-only',
		summary: "Your store refused this change, so it hasn't reached the store.",
	},
	SYNC211: {
		code: 'SYNC211',
		symbol: 'RECORD_INVALID_FIELD',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"The store's reason names the value. Correct it where you entered it, then save again.",
		dataSafety: 'local-only',
		summary: 'Your store refused a value it was sent.',
	},
	SYNC301: {
		code: 'SYNC301',
		symbol: 'SYNC_BEHIND_HEAD',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			'Nothing to do. If prices or stock still look out of date, tap Check everything now in Store health → Database.',
		dataSafety: 'no-impact',
		summary:
			"Your store's list of changes moved unexpectedly, so WCPOS is re-checking it by itself. Nothing is lost.",
	},
	SYNC311: {
		code: 'SYNC311',
		symbol: 'SCHEMA_MISMATCH',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"Update WCPOS to the latest version and reopen. If it still won't open, tap Copy debug info and contact support.",
		dataSafety: 'data-at-risk',
		summary: "Data on this device was saved by a different WCPOS version and can't be opened yet.",
	},
	SYNC321: {
		code: 'SYNC321',
		symbol: 'SYNC_PARTIAL',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			'Nothing to do if the next sync clears it. If Store health → Database lists changes that need attention, settle them there.',
		dataSafety: 'local-only',
		summary: "Some data didn't sync this time.",
	},
	SYNC331: {
		code: 'SYNC331',
		symbol: 'LOCAL_RECORD_DIVERGED',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			"In Store health → Database, use Clear & re-download on that list to replace this device's copy with the store's.",
		dataSafety: 'no-impact',
		summary:
			"This device's copy of a record doesn't match your store's. Nothing you entered is affected.",
	},
	SYNC341: {
		code: 'SYNC341',
		symbol: 'APP_UPDATE_REQUIRED',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			'Update WCPOS (on the web, reload the page), then reopen. Unsent sales stay on this device and send after the update.',
		dataSafety: 'no-impact',
		summary: 'This store now requires a newer version of the POS app.',
	},
	AUTH101: {
		code: 'AUTH101',
		symbol: 'SESSION_EXPIRED',
		domain: 'AUTH',
		severity: 'warn',
		actionHint: "Sign in again. Nothing is lost — unsent changes send once you're signed in.",
		dataSafety: 'no-impact',
		summary: 'Your session ended and you need to sign in again.',
	},
	AUTH201: {
		code: 'AUTH201',
		symbol: 'INSUFFICIENT_ROLE',
		domain: 'AUTH',
		severity: 'error',
		actionHint:
			'Nothing was lost. Ask your store admin to give your user role permission for this action.',
		dataSafety: 'no-impact',
		summary: 'Your account does not have permission to perform this action.',
	},
	AUTH301: {
		code: 'AUTH301',
		symbol: 'AUTH_PLUGIN_CONFLICT',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Ask the site admin to exempt WCPOS in the conflicting auth plugin.',
		dataSafety: 'no-impact',
		summary: 'Another authentication plugin is preventing WCPOS from connecting.',
	},
	AUTH311: {
		code: 'AUTH311',
		symbol: 'REST_ROUTE_MISSING',
		domain: 'AUTH',
		severity: 'error',
		actionHint:
			'Ask your site admin to check the WCPOS plugin is active (WP Admin → Plugins) and that no security plugin blocks the REST API.',
		dataSafety: 'no-impact',
		summary: "Your store isn't answering WCPOS's requests.",
	},
	AUTH401: {
		code: 'AUTH401',
		symbol: 'TLS_UNTRUSTED',
		domain: 'AUTH',
		severity: 'error',
		actionHint: "Check the store address; ask the admin to fix the site's certificate.",
		dataSafety: 'no-impact',
		summary: 'A secure connection to this store could not be trusted.',
	},
	CHECKOUT101: {
		code: 'CHECKOUT101',
		symbol: 'CHECKOUT_FAILED_CART_SAFE',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint: 'Review the cart and try checkout again.',
		dataSafety: 'order-safe',
		summary: 'Checkout did not finish, and the cart is still safe to retry.',
	},
	CHECKOUT201: {
		code: 'CHECKOUT201',
		symbol: 'CHECKOUT_OUTCOME_UNKNOWN',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint:
			"Open the order and check its status before retrying. If it's paid or completed, don't charge again.",
		dataSafety: 'outcome-unknown',
		summary: 'WCPOS could not confirm whether checkout completed.',
	},
	CHECKOUT211: {
		code: 'CHECKOUT211',
		symbol: 'CHECKOUT_EMPTY_RESPONSE',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint:
			"Open the order and check its status before retrying. If it's paid or completed, don't charge again.",
		dataSafety: 'outcome-unknown',
		summary: 'The store returned no checkout result, so the order status is unknown.',
	},
	CHECKOUT301: {
		code: 'CHECKOUT301',
		symbol: 'SKU_DUPLICATE',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint: 'Remove the item to finish the sale; ask the admin to fix its SKU.',
		dataSafety: 'order-safe',
		summary: 'Checkout cannot continue because a product SKU is duplicated or invalid.',
	},
	PAYMENT101: {
		code: 'PAYMENT101',
		symbol: 'PAYMENT_OK_STATUS_CHECK_FAILED',
		domain: 'PAYMENT',
		severity: 'warn',
		actionHint: 'Reopen the order to update its status.',
		dataSafety: 'money-moved',
		summary: 'Payment succeeded, but WCPOS could not refresh its status afterward.',
	},
	PAYMENT201: {
		code: 'PAYMENT201',
		symbol: 'PAYMENT_OUTCOME_UNKNOWN',
		domain: 'PAYMENT',
		severity: 'error',
		actionHint: 'Check the terminal and provider dashboard before re-charging.',
		dataSafety: 'outcome-unknown',
		summary: 'WCPOS could not confirm whether the terminal charged the payment.',
	},
	PAYMENT301: {
		code: 'PAYMENT301',
		symbol: 'GATEWAY_UNAVAILABLE',
		domain: 'PAYMENT',
		severity: 'error',
		actionHint: 'Take another payment method; ask the admin to check the gateway.',
		dataSafety: 'no-impact',
		summary: 'The selected payment gateway is unavailable for this store.',
	},
	PAYMENT401: {
		code: 'PAYMENT401',
		symbol: 'TERMINAL_PAIRING_INCOMPLETE',
		domain: 'PAYMENT',
		severity: 'error',
		actionHint: 'Wake the terminal, check its connection, and re-pair.',
		dataSafety: 'no-impact',
		summary: 'The payment terminal did not finish pairing with WCPOS.',
	},
	PRINT101: {
		code: 'PRINT101',
		symbol: 'AUTOPRINT_DID_NOT_START',
		domain: 'PRINT',
		severity: 'warn',
		actionHint: "The sale is saved. Open the order's receipt and tap Print Receipt.",
		dataSafety: 'no-impact',
		summary: 'Automatic printing did not start for this receipt.',
	},
	PRINT201: {
		code: 'PRINT201',
		symbol: 'PRINT_JOB_FAILED',
		domain: 'PRINT',
		severity: 'error',
		actionHint: 'Check the printer before reprinting.',
		dataSafety: 'outcome-unknown',
		summary: 'WCPOS could not confirm that the print job completed.',
	},
	PRINT301: {
		code: 'PRINT301',
		symbol: 'PRINTER_UNREACHABLE',
		domain: 'PRINT',
		severity: 'error',
		actionHint: "Check the printer's power, cable, and network.",
		dataSafety: 'no-impact',
		summary: 'The selected printer cannot be reached.',
	},
	PRODUCT101: {
		code: 'PRODUCT101',
		symbol: 'PRODUCT_SAVE_FAILED',
		domain: 'PRODUCT',
		severity: 'error',
		actionHint:
			'Read the reason shown, fix what it names or check your connection, then save the product again.',
		dataSafety: 'local-only',
		summary: "This product change hasn't reached your store yet.",
	},
	PRODUCT111: {
		code: 'PRODUCT111',
		symbol: 'VARIATION_ADD_FAILED',
		domain: 'PRODUCT',
		severity: 'error',
		actionHint:
			"Nothing else changed. Open the product and check whether the variation is there; if it isn't, make sure it uses attributes set on the parent product, then add it again.",
		dataSafety: 'local-only',
		summary: 'This variation could not be added to the product.',
	},
	PRODUCT201: {
		code: 'PRODUCT201',
		symbol: 'PRODUCT_IMAGE_UNAVAILABLE',
		domain: 'PRODUCT',
		severity: 'warn',
		actionHint: 'Keep selling — the image retries in the background.',
		dataSafety: 'no-impact',
		summary: 'This product image is unavailable, but the product can still be sold.',
	},
	PRODUCT301: {
		code: 'PRODUCT301',
		symbol: 'SEARCH_NO_RESULTS_REASON',
		domain: 'PRODUCT',
		severity: 'info',
		actionHint: 'Clear the filters, or search by name.',
		dataSafety: 'no-impact',
		summary: 'No products matched the current search and filters.',
	},
	PRODUCT401: {
		code: 'PRODUCT401',
		symbol: 'STOCK_STALE',
		domain: 'PRODUCT',
		severity: 'warn',
		actionHint: 'Confirm real stock before selling low-stock items.',
		dataSafety: 'no-impact',
		summary: 'The displayed stock may be older than the store stock.',
	},
	LICENSE101: {
		code: 'LICENSE101',
		symbol: 'LICENSE_NOT_ACTIVE_HERE',
		domain: 'LICENSE',
		severity: 'error',
		actionHint: 'Re-activate the license for this store in WP Admin.',
		dataSafety: 'no-impact',
		summary: 'Your WCPOS Pro license is not active for this store or device.',
	},
	LICENSE201: {
		code: 'LICENSE201',
		symbol: 'VERSION_SKEW_PRO_DISABLED',
		domain: 'LICENSE',
		severity: 'error',
		actionHint: 'Update the WCPOS and Pro plugins to matching versions.',
		dataSafety: 'no-impact',
		summary: 'WCPOS Pro is disabled because its version does not match WCPOS.',
	},
	LICENSE301: {
		code: 'LICENSE301',
		symbol: 'UPDATER_NOT_AUTHORIZED',
		domain: 'LICENSE',
		severity: 'error',
		actionHint: 'Re-authorize the license so updates can download.',
		dataSafety: 'no-impact',
		summary: 'The updater is not authorized to download WCPOS Pro updates.',
	},
	CLIENT101: {
		code: 'CLIENT101',
		symbol: 'APP_START_FAILED',
		domain: 'CLIENT',
		severity: 'error',
		actionHint:
			"Restart WCPOS (on the web, reload the tab). If it still won't start, contact support before clearing anything.",
		dataSafety: 'local-only',
		summary: 'WCPOS could not finish starting.',
	},
	CLIENT201: {
		code: 'CLIENT201',
		symbol: 'OUT_OF_MEMORY',
		domain: 'CLIENT',
		severity: 'error',
		actionHint:
			'Close other apps or tabs, restart WCPOS, then check your last sale or change saved.',
		dataSafety: 'outcome-unknown',
		summary: 'This device ran out of memory, and the last action may not have finished.',
	},
	CLIENT211: {
		code: 'CLIENT211',
		symbol: 'NATIVE_CRASH',
		domain: 'CLIENT',
		severity: 'error',
		actionHint:
			'Restart WCPOS and check your last sale or change saved. Install any app or system updates.',
		dataSafety: 'outcome-unknown',
		summary: 'WCPOS stopped because of a device-level crash.',
	},
	CLIENT999: {
		code: 'CLIENT999',
		symbol: 'UNEXPECTED_ERROR',
		domain: 'CLIENT',
		severity: 'error',
		actionHint:
			'Check whether your last action went through before trying again — for a sale, open the order and check its status. If it repeats, tap Copy debug info and send it to WCPOS support.',
		dataSafety: 'outcome-unknown',
		summary: 'WCPOS encountered an unexpected error.',
	},
	SYNC999: {
		code: 'SYNC999',
		symbol: 'SYNC_UNEXPECTED',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			"Check the action named in this entry finished; if it didn't, repeat it. If this repeats, tap Copy debug info and send it to support.",
		dataSafety: 'local-only',
		summary: 'Syncing hit an unexpected problem.',
	},
	AUTH999: {
		code: 'AUTH999',
		symbol: 'AUTH_UNEXPECTED',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Try again; if it repeats, contact support with the log details.',
		dataSafety: 'no-impact',
		summary: 'Signing in or staying signed in hit an unexpected problem.',
	},
	CHECKOUT999: {
		code: 'CHECKOUT999',
		symbol: 'CHECKOUT_UNEXPECTED',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint: 'Check WooCommerce → Orders before retrying. Do not re-charge.',
		dataSafety: 'outcome-unknown',
		summary: 'Checkout hit an unexpected problem.',
	},
	PAYMENT999: {
		code: 'PAYMENT999',
		symbol: 'PAYMENT_UNEXPECTED',
		domain: 'PAYMENT',
		severity: 'error',
		actionHint: 'Confirm whether the payment went through before retrying.',
		dataSafety: 'outcome-unknown',
		summary: 'Payment handling hit an unexpected problem.',
	},
	PRINT999: {
		code: 'PRINT999',
		symbol: 'PRINT_UNEXPECTED',
		domain: 'PRINT',
		severity: 'error',
		actionHint:
			'Repeat the print or receipt action named in this entry. Contact support if it repeats.',
		dataSafety: 'no-impact',
		summary: 'Printing hit an unexpected problem. No sale is affected.',
	},
	PRODUCT999: {
		code: 'PRODUCT999',
		symbol: 'PRODUCT_UNEXPECTED',
		domain: 'PRODUCT',
		severity: 'error',
		actionHint:
			'Repeat what you were doing and check it saved. If products still look wrong, tap Copy debug info and send it to support.',
		dataSafety: 'no-impact',
		summary: 'Loading or updating products hit an unexpected problem.',
	},
	LICENSE999: {
		code: 'LICENSE999',
		symbol: 'LICENSE_UNEXPECTED',
		domain: 'LICENSE',
		severity: 'error',
		actionHint: 'Keep working; re-enter the key or contact support if it persists.',
		dataSafety: 'no-impact',
		summary: 'License checking hit an unexpected problem.',
	},
	SYNC401: {
		code: 'SYNC401',
		symbol: 'SYNC_TASK_CRASHED',
		domain: 'SYNC',
		severity: 'warn',
		actionHint: 'Nothing to do — the task restarts automatically, and nothing is lost.',
		dataSafety: 'no-impact',
		summary: 'A background sync task stopped unexpectedly before finishing.',
	},
	SYNC411: {
		code: 'SYNC411',
		symbol: 'DEMAND_REQUEST_FLOOD',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			'Nothing to do — nothing was lost. If it keeps appearing, tap Copy debug info and send it to WCPOS support.',
		dataSafety: 'no-impact',
		summary: 'This device asked the store for data far more often than normal.',
	},
	SYNC221: {
		code: 'SYNC221',
		symbol: 'RECORD_CONFLICT',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			"If Store health → Database lists a held change for it, tap Send again to keep this device's version, or Use server version to keep the store's. Otherwise, nothing to do.",
		dataSafety: 'order-safe',
		summary: 'A change on this device met a newer edit in your store. Nothing is lost.',
	},
	CHECKOUT401: {
		code: 'CHECKOUT401',
		symbol: 'TOTALS_DIVERGED',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint:
			'Open the order and compare totals before the customer leaves. If money was already taken, charge or refund the difference.',
		dataSafety: 'order-safe',
		summary:
			"Your store's total for this order differs from what the till showed. The order is saved with the store's total.",
	},
	PRODUCT411: {
		code: 'PRODUCT411',
		symbol: 'BARCODE_CONFIG_UNAVAILABLE',
		domain: 'PRODUCT',
		severity: 'warn',
		actionHint: 'Keep working; reload once if scans keep missing.',
		dataSafety: 'no-impact',
		summary: 'Barcode scanning settings could not be loaded, so scans may not match products.',
	},
	CLIENT111: {
		code: 'CLIENT111',
		symbol: 'APP_START_SLOW',
		domain: 'CLIENT',
		severity: 'warn',
		actionHint: 'Wait a moment; reload once if it persists.',
		dataSafety: 'no-impact',
		summary: 'Syncing is taking longer than expected to start.',
	},
	CLIENT121: {
		code: 'CLIENT121',
		symbol: 'MULTI_TAB_LIMITED',
		domain: 'CLIENT',
		severity: 'warn',
		actionHint: 'Nothing to do — one tab syncs for all.',
		dataSafety: 'no-impact',
		summary: 'This browser lets only one tab send changes at a time.',
	},
	AUTH111: {
		code: 'AUTH111',
		symbol: 'CREDENTIALS_REJECTED',
		domain: 'AUTH',
		severity: 'warn',
		actionHint: 'Re-enter the username and password.',
		dataSafety: 'no-impact',
		summary: 'The store did not accept the sign-in credentials.',
	},
	AUTH121: {
		code: 'AUTH121',
		symbol: 'SIGNED_IN_AS_WRONG_USER',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Sign in with your own account.',
		dataSafety: 'no-impact',
		summary: 'The signed-in store account does not match the cashier on this till.',
	},
	AUTH321: {
		code: 'AUTH321',
		symbol: 'WOOCOMMERCE_MISSING',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Ask the site admin to reactivate WooCommerce, then reconnect.',
		dataSafety: 'no-impact',
		summary: 'WooCommerce is not active on this site, so WCPOS cannot connect.',
	},
	AUTH331: {
		code: 'AUTH331',
		symbol: 'WCPOS_PLUGIN_OUTDATED',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Ask the site admin to update the WCPOS plugin on the store.',
		dataSafety: 'no-impact',
		summary: "This store's WCPOS plugin is too old for this version of the app.",
	},
	AUTH411: {
		code: 'AUTH411',
		symbol: 'STORE_URL_INVALID',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Check the store address for typos.',
		dataSafety: 'no-impact',
		summary: 'The store address is missing or not a valid URL.',
	},
	AUTH421: {
		code: 'AUTH421',
		symbol: 'AUTH_TOKEN_BLOCKED_BY_HOST',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Ask your host to let the Authorization header reach WordPress.',
		dataSafety: 'no-impact',
		summary: "The store's server is blocking the login token on every channel this app can use.",
	},
	AUTH431: {
		code: 'AUTH431',
		symbol: 'REST_TRANSPORT_BLOCKED',
		domain: 'AUTH',
		severity: 'error',
		actionHint: "Ask your host to allow the store's REST API through.",
		dataSafety: 'no-impact',
		summary: "The store's REST API did not answer on any address form this app can use.",
	},
	AUTH441: {
		code: 'AUTH441',
		symbol: 'AUTH_TOKEN_TOO_LARGE',
		domain: 'AUTH',
		severity: 'error',
		actionHint: 'Ask your host to raise the header and URL size limit.',
		dataSafety: 'no-impact',
		summary: 'The login token is larger than this server accepts.',
	},
	HOST101: {
		code: 'HOST101',
		symbol: 'CORS_PREFLIGHT_BLOCKED',
		domain: 'HOST',
		severity: 'error',
		actionHint: "Ask your host to allow the API's OPTIONS preflight.",
		dataSafety: 'no-impact',
		summary:
			"The server is blocking the browser's permission check (CORS preflight), so the web app cannot reach it.",
	},
	HOST111: {
		code: 'HOST111',
		symbol: 'CORS_MISCONFIGURED',
		domain: 'HOST',
		severity: 'error',
		actionHint: "Ask your host to fix the store's CORS headers.",
		dataSafety: 'no-impact',
		summary:
			"The server's cross-origin (CORS) configuration is broken, so the browser refuses its responses.",
	},
	HOST121: {
		code: 'HOST121',
		symbol: 'BOT_CHALLENGE_BLOCKING_API',
		domain: 'HOST',
		severity: 'error',
		actionHint: "Ask your host to allow-list the store's API paths.",
		dataSafety: 'no-impact',
		summary: "A bot-protection page is answering instead of the store's API.",
	},
	HOST131: {
		code: 'HOST131',
		symbol: 'RESPONSE_HEADERS_REJECTED',
		domain: 'HOST',
		severity: 'error',
		actionHint: "Ask your host to raise the proxy's header limit.",
		dataSafety: 'no-impact',
		summary:
			"A proxy in front of the store rejects the server's responses for having too many headers.",
	},
	HOST141: {
		code: 'HOST141',
		symbol: 'SEARCH_BLOCKED_BY_WAF',
		domain: 'HOST',
		severity: 'warn',
		actionHint: 'Ask your host to allow product-search requests.',
		dataSafety: 'no-impact',
		summary: "The host's security filter is blocking product searches.",
	},
	HOST151: {
		code: 'HOST151',
		symbol: 'CACHE_SHARED_REPLAY',
		domain: 'HOST',
		severity: 'error',
		actionHint:
			"Nothing on this device is lost. Ask your host to stop caching the store's API (both /wp-json/ and ?rest_route= addresses). If WCPOS didn't connect, reconnect afterwards.",
		dataSafety: 'no-impact',
		summary: "Your host's cache can replay one person's store data to another.",
	},
	HOST161: {
		code: 'HOST161',
		symbol: 'HOST_RATE_LIMITED',
		domain: 'HOST',
		severity: 'warn',
		actionHint: 'Ask your host to raise or exempt the API rate limit.',
		dataSafety: 'no-impact',
		summary: "The host is rate-limiting this store's tills.",
	},
	SYNC151: {
		code: 'SYNC151',
		symbol: 'STORE_RESPONSE_MALFORMED',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			"Check the action you were doing finished. If this appears often, ask your site admin to check the site's PHP error log for warnings.",
		dataSafety: 'no-impact',
		summary: "Your store's reply had stray text in it, which WCPOS tried to clean up.",
	},
	SYNC161: {
		code: 'SYNC161',
		symbol: 'LOCAL_DB_UNAVAILABLE',
		domain: 'SYNC',
		severity: 'error',
		actionHint:
			'Restart WCPOS (on the web, reload the tab), then check your last sale or change saved.',
		dataSafety: 'data-at-risk',
		summary: "This device's storage stopped responding, so saving is paused.",
	},
	SYNC171: {
		code: 'SYNC171',
		symbol: 'LOCAL_DB_SETUP_FAILED',
		domain: 'SYNC',
		severity: 'error',
		actionHint: 'Free up device storage, then restart WCPOS. Contact support if it keeps failing.',
		dataSafety: 'no-impact',
		summary: "WCPOS couldn't set up or remove storage on this device.",
	},
	SYNC181: {
		code: 'SYNC181',
		symbol: 'LOCAL_DB_STALLED',
		domain: 'SYNC',
		severity: 'warn',
		actionHint:
			'Nothing to do if WCPOS is working. If a screen stays stuck, reload WCPOS, then check your last change saved.',
		dataSafety: 'outcome-unknown',
		summary: 'Saving or loading on this device is very slow, and its outcome is not yet known.',
	},
	CHECKOUT111: {
		code: 'CHECKOUT111',
		symbol: 'CART_UPDATE_FAILED',
		domain: 'CHECKOUT',
		severity: 'error',
		actionHint: 'Try adding it again; try a different item if it keeps failing.',
		dataSafety: 'order-safe',
		summary: 'This change could not be applied to the cart, which is unchanged.',
	},
	PRODUCT321: {
		code: 'PRODUCT321',
		symbol: 'BARCODE_AMBIGUOUS',
		domain: 'PRODUCT',
		severity: 'warn',
		actionHint: 'Search by name; ask the admin to make the barcodes unique.',
		dataSafety: 'no-impact',
		summary: 'More than one product matches this barcode.',
	},
	PRODUCT421: {
		code: 'PRODUCT421',
		symbol: 'VARIABLE_PRICE_META_INVALID',
		domain: 'PRODUCT',
		severity: 'warn',
		actionHint: "Ask the admin to re-save the product's prices.",
		dataSafety: 'no-impact',
		summary:
			"This product's variation price data could not be read, so displayed prices may be wrong or missing.",
	},
	PRINT311: {
		code: 'PRINT311',
		symbol: 'RECEIPT_DELIVERY_FAILED',
		domain: 'PRINT',
		severity: 'error',
		actionHint:
			"The sale is saved. Check the email address, or the device's storage for a PDF, then try again from the receipt. If every email fails, ask your site admin to check email sending.",
		dataSafety: 'order-safe',
		summary: 'This receipt could not be emailed or downloaded.',
	},
	CLIENT131: {
		code: 'CLIENT131',
		symbol: 'REQUEST_QUEUE_OVERFLOW',
		domain: 'CLIENT',
		severity: 'error',
		actionHint: 'Pause a moment, confirm your last action went through, then retry.',
		dataSafety: 'no-impact',
		summary: 'WCPOS queued too many requests at once and dropped some.',
	},
	CLIENT141: {
		code: 'CLIENT141',
		symbol: 'SEARCH_INDEX_DIVERGENCE',
		domain: 'CLIENT',
		severity: 'error',
		actionHint: 'Nothing to do unless search still looks wrong — then reload WCPOS.',
		dataSafety: 'no-impact',
		summary: "Search showed some results that don't match your products, so WCPOS hid them.",
	},
	CLIENT142: {
		code: 'CLIENT142',
		symbol: 'SEARCH_INDEX_STALLED',
		domain: 'CLIENT',
		severity: 'warn',
		actionHint: 'No action needed. Search keeps working from a direct catalogue scan.',
		dataSafety: 'no-impact',
		summary:
			'The search index did not answer in time, so WCPOS searched the catalogue directly instead.',
	},
	CLIENT143: {
		code: 'CLIENT143',
		symbol: 'SEARCH_INDEX_FALSE_MISS',
		domain: 'CLIENT',
		severity: 'error',
		actionHint:
			"Nothing to do unless a product you can see still won't come up in search — then reload WCPOS.",
		dataSafety: 'no-impact',
		summary: 'Search was missing a product it should have found.',
	},
	CLIENT144: {
		code: 'CLIENT144',
		symbol: 'SEARCH_INDEX_REBUILD_FAILED',
		domain: 'CLIENT',
		severity: 'warn',
		actionHint: 'Try another search; reload if results still look wrong.',
		dataSafety: 'no-impact',
		summary:
			'A search index rebuild failed, so results may be incomplete while the app retries initialization.',
	},
	CHECKOUT411: {
		code: 'CHECKOUT411',
		symbol: 'CART_LINE_PRICE_BASIS_UNREADABLE',
		domain: 'CHECKOUT',
		severity: 'warn',
		actionHint: 'Remove that line and add it again, then check the total.',
		dataSafety: 'order-safe',
		summary:
			'A line on this order has price details the POS could not read, so its amount was taken from the stored totals instead.',
	},
	CHECKOUT421: {
		code: 'CHECKOUT421',
		symbol: 'ORDER_TAX_RATE_UNKNOWN',
		domain: 'CHECKOUT',
		severity: 'warn',
		actionHint: 'Check the tax on this order; ask the admin whether a tax rate was deleted.',
		dataSafety: 'order-safe',
		summary: 'This order refers to a tax rate your store no longer has, so its tax may be wrong.',
	},
	CLIENT151: {
		code: 'CLIENT151',
		symbol: 'SCREEN_RENDER_FAILED',
		domain: 'CLIENT',
		severity: 'error',
		actionHint: 'Close the error message to retry; if it comes back, reload the app.',
		dataSafety: 'no-impact',
		summary: 'Part of the screen failed to load and was replaced by an error message.',
	},
	AUTH131: {
		code: 'AUTH131',
		symbol: 'STORE_SESSION_INCOMPLETE',
		domain: 'AUTH',
		severity: 'error',
		actionHint:
			'Choose the store again to sign back in. If the site had to be added again, contact support before clearing local data.',
		dataSafety: 'local-only',
		summary: 'The saved store session was incomplete, so WCPOS returned to the store list.',
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
	APP_UPDATE_REQUIRED: 'SYNC341',
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
	WCPOS_PLUGIN_OUTDATED: 'AUTH331',
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
	LOCAL_DB_STALLED: 'SYNC181',
	CART_UPDATE_FAILED: 'CHECKOUT111',
	BARCODE_AMBIGUOUS: 'PRODUCT321',
	VARIABLE_PRICE_META_INVALID: 'PRODUCT421',
	RECEIPT_DELIVERY_FAILED: 'PRINT311',
	REQUEST_QUEUE_OVERFLOW: 'CLIENT131',
	SEARCH_INDEX_DIVERGENCE: 'CLIENT141',
	SEARCH_INDEX_STALLED: 'CLIENT142',
	SEARCH_INDEX_FALSE_MISS: 'CLIENT143',
	SEARCH_INDEX_REBUILD_FAILED: 'CLIENT144',
	CART_LINE_PRICE_BASIS_UNREADABLE: 'CHECKOUT411',
	ORDER_TAX_RATE_UNKNOWN: 'CHECKOUT421',
	SCREEN_RENDER_FAILED: 'CLIENT151',
	STORE_SESSION_INCOMPLETE: 'AUTH131',
} as const satisfies Record<string, ErrorCode>;
