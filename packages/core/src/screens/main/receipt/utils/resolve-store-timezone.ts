interface StoreLike {
	timezone?: unknown;
}

interface SiteLike {
	timezone_string?: unknown;
	gmt_offset?: unknown;
}

function offsetToEtcGmt(offset: number): string {
	if (!Number.isFinite(offset) || offset === 0) {
		return 'UTC';
	}

	const rounded = Math.trunc(offset);
	if (rounded !== offset) {
		return 'UTC';
	}

	// POSIX Etc/GMT signs are inverted: UTC-5 is Etc/GMT+5.
	return `Etc/GMT${rounded > 0 ? '-' : '+'}${Math.abs(rounded)}`;
}

export function resolveStoreTimezone(store?: StoreLike | null, site?: SiteLike | null): string {
	if (typeof store?.timezone === 'string' && store.timezone.trim() !== '') {
		return store.timezone.trim();
	}

	if (typeof site?.timezone_string === 'string' && site.timezone_string.trim() !== '') {
		return site.timezone_string.trim();
	}

	if (site?.gmt_offset != null) {
		const offset =
			typeof site.gmt_offset === 'string' ? Number(site.gmt_offset) : Number(site.gmt_offset);
		return offsetToEtcGmt(offset);
	}

	return 'UTC';
}
