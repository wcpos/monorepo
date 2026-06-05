type PullDocument<TCollection> = (id: number, collection: TCollection) => Promise<unknown>;

export async function pullDocumentSafely<TCollection>(
	pullDocument: PullDocument<TCollection>,
	id: number,
	collection: TCollection
): Promise<void> {
	try {
		await pullDocument(id, collection);
	} catch {
		// usePullDocument already logs pull failures; these callers are fire-and-forget.
	}
}
