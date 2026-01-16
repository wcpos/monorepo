import AppInfo from '@wcpos/utils/app-info';

import type { SiteDocument, StoreDocument, WPCredentialsDocument } from '@wcpos/database';

/**
 * Subscriber metadata sent to Novu for targeting and analytics
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
 * Format: {site.domain}:{store.id}:{wpCredentials.uuid}
 *
 * This uniquely identifies a user session at a specific store on a specific WooCommerce site.
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
	const storeId = store.id || store.localID;
	const userUuid = wpCredentials.uuid;

	return `${domain}:${storeId}:${userUuid}`;
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
		storeId: store.id || store.localID,
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
