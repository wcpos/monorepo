import type { SiteDocument, StoreDocument, WPCredentialsDocument } from '@wcpos/database';
import { http } from '@wcpos/hooks/use-http-client';
import { getLogger } from '@wcpos/utils/logger';

import { getNovuEnvironment } from './client';

// Import static AppInfo for non-React code
// For React components, use the useAppInfo() hook instead
import { AppInfo } from '../../hooks/use-app-info';

const novuLogger = getLogger(['wcpos', 'notifications', 'novu']);

/**
 * Subscriber metadata sent to Novu for targeting and analytics.
 *
 * This combines:
 * - Static app info (appVersion, platform) from AppInfo
 * - Site-specific info (wcposVersion, license) from RxDB documents
 *
 * @see useAppInfo hook for React components needing this data
 */
export interface NovuSubscriberMetadata {
	domain: string;
	storeId: string | number;
	licenseKey?: string;
	licenseStatus?: string;
	appVersion: string;
	platform: string;
	wcposVersion?: string;
	wcposProVersion?: string;
	locale?: string;
}

/**
 * Generates a unique subscriber ID for Novu notifications.
 *
 * Format: {site.domain}:{store.id}:{wpCredentials.uuid}:{platform}
 *
 * This uniquely identifies a user session at a specific store on a specific WooCommerce site
 * AND platform. The platform is included because a user may be logged in from multiple
 * platforms simultaneously (e.g., web and iOS), and each should have its own subscriber
 * to avoid metadata conflicts.
 *
 * @param site - The WordPress site document
 * @param store - The store document
 * @param wpCredentials - The WordPress credentials document
 * @returns The subscriber ID string
 */
export function generateSubscriberId(
	site: SiteDocument,
	store: StoreDocument,
	wpCredentials: WPCredentialsDocument
): string {
	// Extract domain from site URL (remove protocol)
	const domain = extractDomain(site.url || '');
	// Use nullish coalescing to preserve legitimate 0 values
	const storeId = store.id ?? store.localID;
	const userUuid = wpCredentials.uuid;
	const platform = AppInfo.platform;

	return `${domain}:${storeId}:${userUuid}:${platform}`;
}

/**
 * Generates subscriber metadata for Novu.
 *
 * This metadata is used for:
 * - Targeting specific users (e.g., by license status, platform, version)
 * - Analytics and segmentation
 * - Debugging and support
 *
 * @param site - The WordPress site document
 * @param store - The store document
 * @returns Metadata object for Novu subscriber
 */
export function generateSubscriberMetadata(
	site: SiteDocument,
	store: StoreDocument
): NovuSubscriberMetadata {
	return {
		domain: extractDomain(site.url || ''),
		// Use nullish coalescing to preserve legitimate 0 values
		storeId: store.id ?? store.localID,
		licenseKey: site.license?.key,
		licenseStatus: site.license?.status,
		appVersion: AppInfo.version,
		platform: AppInfo.platform,
		wcposVersion: site.wcpos_version,
		wcposProVersion: site.wcpos_pro_version,
		locale: store.locale,
	};
}

/**
 * Extracts the domain from a URL, removing protocol and trailing slashes.
 *
 * @param url - The full URL
 * @returns The domain only (e.g., "example.com")
 */
function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname;
	} catch {
		// Fallback: remove protocol manually
		return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
	}
}

/**
 * Sync subscriber metadata to the server.
 *
 * This calls the updates-server endpoint which then uses the Novu API
 * to update the subscriber profile. This is done server-side to keep
 * the NOVU_SECRET_KEY secure.
 *
 * Uses the platform-specific HTTP client:
 * - Web/Native: Direct axios
 * - Electron: IPC bridge to main process (avoids CORS/sandbox issues)
 *
 * The environment (development/production) is automatically determined
 * based on the NOVU_APPLICATION_ID in use.
 *
 * @param subscriberId - The unique subscriber ID
 * @param metadata - The subscriber metadata
 * @returns Promise that resolves when sync is complete
 */
export async function syncSubscriberToServer(
	subscriberId: string,
	metadata: NovuSubscriberMetadata
): Promise<{ success: boolean; error?: string }> {
	const UPDATES_SERVER_URL =
		process.env.EXPO_PUBLIC_UPDATES_SERVER_URL ||
		process.env.UPDATES_SERVER_URL ||
		'https://updates.wcpos.com';

	// Get the environment from the client configuration
	const environment = getNovuEnvironment();

	try {
		const response = await http.request({
			method: 'POST',
			url: `${UPDATES_SERVER_URL}/v1/subscriber/sync`,
			headers: {
				'Content-Type': 'application/json',
			},
			data: {
				subscriberId,
				// Locale is a first-class Novu subscriber field, so send it at top level
				locale: metadata.locale,
				data: metadata,
				// Tell the server which Novu environment to sync to
				environment,
			},
		});

		novuLogger.debug('Novu: Subscriber sync successful', {
			context: { subscriberId, environment, status: response.status },
		});

		return { success: true };
	} catch (error: any) {
		const errorMessage = error?.response?.data?.message || error?.message || 'Network error';

		novuLogger.warn('Novu: Subscriber sync failed', {
			context: {
				subscriberId,
				environment,
				error: errorMessage,
				status: error?.response?.status,
			},
		});

		return {
			success: false,
			error: errorMessage,
		};
	}
}
