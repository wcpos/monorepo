export function withStoreParam(search: string, storeServerID: number): string {
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	params.set('store', String(storeServerID));
	return `?${params.toString()}`;
}
