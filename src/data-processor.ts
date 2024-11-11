import type { Logger } from './logger';

/**
 * Handles data insertion, updates, and deletions in the local collection.
 */
export class DataProcessor {
	private collection: any;
	private logger: Logger;

	constructor(collection: any, logger: Logger) {
		this.collection = collection;
		this.logger = logger;
	}

	async insertNewDocuments(documents: any[]) {
		const result = await this.collection.bulkInsert(documents);
		if (result.success.length > 0) {
			await this.logger.logAddedDocuments(
				result.success.map((doc: any) => doc.id),
				this.collection.name
			);
		}
		return result;
	}

	async updateExistingDocuments(documents: any[], localDocs: Map<string, any>) {
		const updatedDocs = documents.filter((doc) => {
			const localDoc = localDocs.get(doc.uuid);
			return localDoc && localDoc.date_modified_gmt < doc.date_modified_gmt;
		});

		if (updatedDocs.length > 0) {
			const result = await this.collection.bulkUpsert(updatedDocs);
			if (result.success.length > 0) {
				await this.logger.logUpdatedDocuments(
					result.success.map((doc: any) => doc.id),
					this.collection.name
				);
			}
			return result;
		}
	}

	async removeDocumentsByIds(ids: number[]) {
		await this.collection
			.find({
				selector: { id: { $in: ids } },
			})
			.remove();
		await this.logger.logRemovedDocuments(ids, this.collection.name);
	}
}
