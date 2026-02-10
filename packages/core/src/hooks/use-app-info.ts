/**
 * Unified App Info Hook
 *
 * Provides a single source of truth for all app-related version and license information.
 *
 * ## Usage
 *
 * ### Inside main app (after connect):
 * ```tsx
 * const { appVersion, platform, license, site, compatibility } = useAppInfo();
 * ```
 *
 * ### On auth screen (with site prop):
 * ```tsx
 * const { appVersion, platform, compatibility } = useAppInfo({ site: siteDocument });
 * ```
 *
 * ## Data Availability
 *
 * - **Always available**: appVersion, buildNumber, platform, userAgent
 * - **After connect**: site info, license info, compatibility checks
 */
import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';
import { type Observable, of } from 'rxjs';
// @ts-expect-error: semver lacks type declarations in this project
import semver from 'semver';

import type { SiteDocument } from '@wcpos/database';
import { AppInfo } from '@wcpos/utils/app-info';

import { AppStateContext } from '../contexts/app-state';

/**
 * Static app information (always available)
 */
export interface StaticAppInfo {
	/** Cross-platform JS bundle version from Expo config (e.g., '1.8.1') */
	appVersion: string;
	/** Platform-specific version (Electron app version, iOS build number, etc.) */
	platformVersion: string;
	/** Build number - alias for platformVersion (backwards compatibility) */
	buildNumber: string;
	/** Platform: ios | android | web | electron */
	platform: 'ios' | 'android' | 'web' | 'electron';
	/** User agent string for API requests */
	userAgent: string;
}

/**
 * Site-specific version information (available after connect)
 */
export interface SiteVersionInfo {
	/** WCPOS free plugin version on the connected site */
	wcposVersion: string | undefined;
	/** WCPOS Pro plugin version (if installed) */
	wcposProVersion: string | undefined;
	/** WooCommerce version */
	wcVersion: string | undefined;
	/** WordPress version */
	wpVersion: string | undefined;
}

/**
 * License information (available after connect)
 */
export interface LicenseInfo {
	/** License key (if Pro) */
	licenseKey: string | undefined;
	/** License status */
	licenseStatus: string | undefined;
	/** License instance ID */
	licenseInstance: string | undefined;
	/** License expiration date */
	licenseExpiration: string | undefined;
	/** Whether user has Pro license */
	isPro: boolean;
}

/**
 * Version compatibility checks (available after connect)
 */
export interface VersionCompatibility {
	/** Whether plugin version >= app version (ensures API compatibility) */
	wcposVersionPass: boolean;
}

/**
 * Full app info including site-specific data
 */
export interface AppInfoResult extends StaticAppInfo {
	/** Site-specific version info (undefined before connect) */
	site: SiteVersionInfo | undefined;
	/** License info (undefined before connect) */
	license: LicenseInfo | undefined;
	/** Version compatibility checks (undefined before connect) */
	compatibility: VersionCompatibility | undefined;
}

/**
 * Hook options
 */
interface UseAppInfoOptions {
	/** Optional site document (for use on auth screen before context is available) */
	site?: SiteDocument;
}

/**
 * Internal hook that subscribes to site observables.
 * Always calls hooks in the same order regardless of whether site exists.
 */
const EMPTY_STRING$ = of(undefined as string | undefined);
const EMPTY_LICENSE$ = of(
	undefined as
		| {
				key?: string;
				status?: string;
				instance?: string;
				expiration?: string;
		  }
		| undefined
);

function useSiteObservables(site: SiteDocument | undefined) {
	// These hooks must always be called in the same order
	// Use fallback observables when site is undefined to keep hook order consistent
	const wcposVersion = useObservableEagerState(site?.wcpos_version$ ?? EMPTY_STRING$);
	const wcposProVersion = useObservableEagerState(site?.wcpos_pro_version$ ?? EMPTY_STRING$);
	const wcVersion = useObservableEagerState(site?.wc_version$ ?? EMPTY_STRING$);
	const wpVersion = useObservableEagerState(site?.wp_version$ ?? EMPTY_STRING$);
	const license = useObservableEagerState(site?.license$ ?? EMPTY_LICENSE$);

	if (!site) {
		return null;
	}

	return {
		wcposVersion,
		wcposProVersion,
		wcVersion,
		wpVersion,
		license,
	};
}

/**
 * Unified hook for accessing all app and site version information.
 *
 * @param options - Optional configuration
 * @param options.site - Site document (for use before AppStateContext is available)
 * @returns App info object with static and site-specific data
 *
 * @example
 * // Inside main app (uses context)
 * const { appVersion, license } = useAppInfo();
 * if (license?.isPro) { ... }
 *
 * @example
 * // On auth screen (site from props)
 * const { compatibility } = useAppInfo({ site: siteDoc });
 * if (!compatibility?.wcposVersionPass) { ... }
 */
export function useAppInfo(options?: UseAppInfoOptions): AppInfoResult {
	// Try to get site from context if not provided as prop
	const context = React.useContext(AppStateContext);
	const site = options?.site ?? context?.site;

	// Subscribe to site observables
	const siteData = useSiteObservables(site);

	// Compute version compatibility
	const wcposVersionPass = React.useMemo(() => {
		if (!siteData?.wcposVersion) return false;
		try {
			const coerced = semver.coerce(siteData.wcposVersion || '0');
			return semver.gte(String(coerced), AppInfo.version);
		} catch {
			return false;
		}
	}, [siteData?.wcposVersion]);

	return {
		// Static (always available)
		appVersion: AppInfo.version,
		platformVersion: AppInfo.platformVersion,
		buildNumber: AppInfo.buildNumber, // Alias for backwards compatibility
		platform: AppInfo.platform,
		userAgent: AppInfo.userAgent,

		// Site info (undefined before connect)
		site: siteData
			? {
					wcposVersion: siteData.wcposVersion ?? undefined,
					wcposProVersion: siteData.wcposProVersion ?? undefined,
					wcVersion: siteData.wcVersion ?? undefined,
					wpVersion: siteData.wpVersion ?? undefined,
				}
			: undefined,

		// License info (undefined before connect)
		license: siteData
			? {
					licenseKey: siteData.license?.key,
					licenseStatus: siteData.license?.status,
					licenseInstance: siteData.license?.instance,
					licenseExpiration: siteData.license?.expiration,
					isPro: !!siteData.license?.key,
				}
			: undefined,

		// Compatibility (undefined before connect)
		compatibility: siteData
			? {
					wcposVersionPass,
				}
			: undefined,
	};
}

/**
 * Re-export static AppInfo for non-React code
 * (e.g., Novu subscriber, HTTP clients)
 */
export { default as AppInfo } from '@wcpos/utils/app-info';
