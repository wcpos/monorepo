import * as React from 'react';

import { useQueryManager } from '@wcpos/query';

import { type OtherScopesSummary, summarizeOtherScopes } from './database-logic';

/** Structural OPFS types — lib.dom's are incomplete for async iteration. */
type OpfsFileHandle = { kind: 'file'; getFile(): Promise<{ size: number }> };
type OpfsDirectoryHandle = {
	kind: 'directory';
	values(): AsyncIterable<OpfsFileHandle | OpfsDirectoryHandle>;
	entries(): AsyncIterable<[string, OpfsFileHandle | OpfsDirectoryHandle]>;
};

async function measureDirectory(handle: OpfsDirectoryHandle): Promise<number> {
	let bytes = 0;
	for await (const child of handle.values()) {
		if (child.kind === 'file') {
			bytes += (await child.getFile()).size;
		} else {
			bytes += await measureDirectory(child);
		}
	}
	return bytes;
}

/**
 * Footprint of OTHER stores' scope databases on this device, from OPFS
 * directory sizes (web/Electron; native SQLite has no comparable cheap probe —
 * the footnote simply doesn't render there). Null until measured or when the
 * platform can't measure.
 */
export function useOtherScopes(): OtherScopesSummary | null {
	const { engine } = useQueryManager();
	const [summary, setSummary] = React.useState<OtherScopesSummary | null>(null);

	// Effect (last resort per project.mdc): OPFS enumeration is a one-shot
	// async platform probe with no reactive seam.
	React.useEffect(() => {
		const storage = (
			typeof navigator !== 'undefined'
				? (navigator.storage as unknown as { getDirectory?: () => Promise<OpfsDirectoryHandle> })
				: undefined
		)?.getDirectory;
		if (!storage) return;
		let cancelled = false;
		void (async () => {
			let activeDbName: string;
			try {
				const scope = engine.active() ?? (await engine.ready);
				activeDbName = scope.database.name;
			} catch {
				return;
			}
			try {
				const root = await (
					navigator.storage as unknown as { getDirectory(): Promise<OpfsDirectoryHandle> }
				).getDirectory();
				const entries: { name: string; bytes: number }[] = [];
				for await (const [name, handle] of root.entries()) {
					if (!name.startsWith('rxdb-') || handle.kind !== 'directory') continue;
					entries.push({ name, bytes: await measureDirectory(handle) });
				}
				if (!cancelled) setSummary(summarizeOtherScopes(entries, activeDbName));
			} catch {
				// Enumeration unavailable (permissions, platform) — footnote stays off.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [engine]);

	return summary;
}
