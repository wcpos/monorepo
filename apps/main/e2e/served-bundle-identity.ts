import * as fs from 'fs';
import * as path from 'path';

/**
 * Proof that the URL under test is serving THIS worktree's build.
 *
 * The trap (2026-08-19, cost a full false diagnosis): `npx serve -s web-build
 * -l <port>` fails silently when another worktree already holds the port —
 * `serve` keeps running, and a `curl` health check still returns 200 because
 * the OTHER worktree answers it. Six soaks were then attributed to the lane
 * under test while actually exercising a months-old bundle from an unrelated
 * branch, which produced a perfectly consistent, perfectly wrong "this lane
 * never fires" result.
 *
 * Identity, not liveness: Expo emits a content-hashed `entry-<hash>.js`, so the
 * served index must reference the SAME entry file as the local build directory.
 */

const ENTRY_PATTERN = /\/_expo\/static\/js\/web\/entry-[a-f0-9]+\.js/;

export function entryFromHtml(html: string): string | null {
	return ENTRY_PATTERN.exec(html)?.[0] ?? null;
}

export function localEntry(webBuildDir: string): string | null {
	const indexPath = path.join(webBuildDir, 'index.html');
	if (!fs.existsSync(indexPath)) return null;
	return entryFromHtml(fs.readFileSync(indexPath, 'utf8'));
}

export type BundleIdentityVerdict =
	{ ok: true; entry: string } | { ok: false; reason: string } | { ok: 'unchecked'; reason: string };

export function compareBundleIdentity(
	local: string | null,
	served: string | null,
	baseUrl: string
): BundleIdentityVerdict {
	if (local === null) {
		// Pointed at a deployed client rather than a local build — nothing to
		// compare against, and that is a legitimate way to run this soak.
		return { ok: 'unchecked', reason: 'no local web-build/index.html to compare against' };
	}
	if (served === null) {
		return {
			ok: false,
			reason: `${baseUrl} served no Expo entry bundle — is anything serving it?`,
		};
	}
	if (served !== local) {
		return {
			ok: false,
			reason:
				`${baseUrl} is serving ${served} but this worktree built ${local}. ` +
				`Another process almost certainly holds that port (\`lsof -nP -iTCP:<port> -sTCP:LISTEN\`, ` +
				`then check its cwd) — \`serve\` fails to bind silently and the health check still returns 200. ` +
				`Pick a free port instead of trusting the 200.`,
		};
	}
	return { ok: true, entry: served };
}
