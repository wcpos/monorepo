interface StoreLike {
	timezone?: unknown;
}

interface SiteLike {
	timezone_string?: unknown;
	gmt_offset?: unknown;
}

function offsetToTimezone(offset: number): string {
	if (!Number.isFinite(offset) || offset === 0) {
		return 'UTC';
	}

	const rounded = Math.trunc(offset);
	if (rounded !== offset) {
		const totalMinutes = Math.round(Math.abs(offset) * 60);
		const hours = Math.floor(totalMinutes / 60);
		const minutes = totalMinutes % 60;
		const sign = offset > 0 ? '+' : '-';
		return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
		const offset = Number(site.gmt_offset);
		return offsetToTimezone(offset);
	}

	return 'UTC';
}
