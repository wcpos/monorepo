/**
 * Returns a remote proxy for the RxStorage adapter.
 * This proxy intercepts method calls and pipes them over IPC using
 * window.ipcRenderer.invoke with the channel 'rxStorage'.
 *
 * The proxy accumulates property accesses into a method path. When a method is finally called,
 * the full path is used to forward the call.
 *
 * This function should be called only in the renderer process.
 *
 * @param {string} [prefix=''] - The accumulated method path.
 * @returns {any} - A proxy representing the remote storage adapter.
 */
export function createRemoteStorageProxy(prefix = ''): any {
	if (typeof window === 'undefined' || !(window as any).ipcRenderer) {
		throw new Error(
			'Remote storage proxy can only be created in the renderer with ipcRenderer exposed'
		);
	}
	return new Proxy(() => {}, {
		get(target, prop) {
			const newPrefix = prefix ? `${prefix}.${String(prop)}` : String(prop);
			return createRemoteStorageProxy(newPrefix);
		},
		async apply(target, thisArg, args) {
			return await (window as any).ipcRenderer.invoke('rxStorage', {
				methodPath: prefix,
				args,
			});
		},
	});
}
