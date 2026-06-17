interface NavigatorLike {
	userAgent?: string;
	platform?: string;
	userAgentData?: { platform?: string };
}

/**
 * Windows detection for the Electron renderer (process.platform is not exposed across
 * the context bridge). Prefers structured userAgentData, falls back to the legacy
 * platform ('Win32') and userAgent ('Windows NT ...') fields.
 */
export function isWindowsPlatform(
	nav: NavigatorLike | undefined = typeof navigator !== 'undefined'
		? (navigator as NavigatorLike)
		: undefined
): boolean {
	if (!nav) return false;
	if (nav.userAgentData?.platform) return nav.userAgentData.platform === 'Windows';
	return (nav.platform ?? nav.userAgent ?? '').includes('Win');
}
