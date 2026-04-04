import type { Page } from '@playwright/test';

/**
 * Snapshot of all OPFS files for the current origin.
 *
 * Maps each file's path (relative to OPFS root, using "/" as separator)
 * to its contents as a base64-encoded string.
 *
 * Example:
 *   {
 *     "rxdb-wcposusers_v3-sites-0/documents.json": "<base64>",
 *     "rxdb-wcposusers_v3-sites-0/changes.json": "<base64>",
 *     ...
 *   }
 */
export type OPFSSnapshot = Record<string, string>;

/**
 * Export all OPFS files for the current origin.
 *
 * Must be called when no OPFS worker is running (i.e. with JS blocked,
 * or after the page that started the worker has been closed/navigated away).
 * The abstract-filesystem OPFS storage uses createSyncAccessHandle() which
 * grants exclusive access; reading files while the handle is held will fail.
 */
export async function exportOPFS(page: Page): Promise<OPFSSnapshot> {
	return page.evaluate(async () => {
		const snapshot: Record<string, string> = {};

		async function traverseDir(
			dirHandle: FileSystemDirectoryHandle,
			prefix: string
		): Promise<void> {
			// @ts-ignore — AsyncIterable entries() is available in Chromium
			for await (const [name, handle] of dirHandle.entries()) {
				const path = prefix ? `${prefix}/${name}` : name;
				if (handle.kind === 'directory') {
					await traverseDir(handle as FileSystemDirectoryHandle, path);
				} else if (handle.kind === 'file') {
					const file = await (handle as FileSystemFileHandle).getFile();
					if (file.size === 0) {
						// Preserve empty files so restore can recreate the exact tree.
						snapshot[path] = '';
						continue;
					}
					const buffer = await file.arrayBuffer();
					const bytes = new Uint8Array(buffer);
					// Convert to base64
					let binary = '';
					const chunkSize = 8192;
					for (let i = 0; i < bytes.length; i += chunkSize) {
						binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
					}
					snapshot[path] = btoa(binary);
				}
			}
		}

		const root = await navigator.storage.getDirectory();
		await traverseDir(root, '');
		return snapshot;
	});
}

/**
 * Restore an OPFS snapshot into the current origin.
 *
 * Clears all existing OPFS content for the origin, then recreates
 * the directory tree and writes each file from base64.
 *
 * Must be called when no OPFS worker is running (same restriction as exportOPFS).
 */
export async function restoreOPFS(page: Page, snapshot: OPFSSnapshot): Promise<void> {
	await page.evaluate(async (data: OPFSSnapshot) => {
		const root = await navigator.storage.getDirectory();

		// Clear existing OPFS content
		// @ts-ignore
		for await (const [name] of root.entries()) {
			try {
				await root.removeEntry(name, { recursive: true });
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to remove OPFS entry "${name}" during restore: ${message}`);
			}
		}

		// Write all files from snapshot
		for (const [filePath, base64] of Object.entries(data)) {
			const parts = filePath.split('/');
			const fileName = parts.pop()!;

			// Create parent directories
			let currentDir: FileSystemDirectoryHandle = root;
			for (const part of parts) {
				currentDir = await currentDir.getDirectoryHandle(part, { create: true });
			}

			// Decode base64 and write file
			const binaryString = atob(base64);
			const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}

			const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
			const writable = await fileHandle.createWritable();
			await writable.write(bytes.buffer);
			await writable.close();
		}
	}, snapshot);
}
