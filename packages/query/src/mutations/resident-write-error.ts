export class ResidentWriteError extends Error {
	constructor(
		public readonly cause: unknown,
		public readonly collectionName: string | undefined,
		public readonly documentId: string | null
	) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.name = 'ResidentWriteError';
	}
}
