/**
 * Annotate a fetch() init for Chromium's Local Network Access (LNA).
 *
 * From Chrome/Edge 142, secure (HTTPS) pages may fetch plain-HTTP local
 * network endpoints — exempt from mixed-content blocking — behind a user
 * permission prompt, as long as the request is identifiable as local before
 * connecting. Annotating with `targetAddressSpace: 'local'` guarantees that
 * for any hostname, not just private IP literals and `.local` domains.
 * Browsers without LNA ignore the extra option.
 *
 * Loopback hosts are skipped: loopback HTTP is already a trustworthy origin,
 * and a `'local'` annotation that mismatches the actual address space causes
 * the request to fail.
 *
 * https://developer.chrome.com/blog/local-network-access
 */
type TargetAddressSpace = 'local' | 'loopback';

interface RequestInitWithTargetAddressSpace extends RequestInit {
	targetAddressSpace?: TargetAddressSpace;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '[::1]', '::1']);

function isLoopback(hostname: string): boolean {
	return LOOPBACK_HOSTNAMES.has(hostname) || hostname.startsWith('127.');
}

export function withTargetAddressSpace(url: string, init: RequestInit): RequestInit {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return init;
	}
	if (parsed.protocol !== 'http:' || isLoopback(parsed.hostname)) {
		return init;
	}
	const annotated: RequestInitWithTargetAddressSpace = { ...init, targetAddressSpace: 'local' };
	return annotated;
}
