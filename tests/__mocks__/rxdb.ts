export class MockRxDocument {
	constructor(public data: any) {}

	save() {
		return Promise.resolve(this.data);
	}

	remove() {
		return Promise.resolve(true);
	}
}

export class MockRxCollection {
	private documents = new Map();

	constructor(config) {}

	insert(docData: any) {
		const doc = new MockRxDocument(docData);
		this.documents.set(docData.id, doc);
		return Promise.resolve(doc);
	}

	find() {
		// Return a mock query interface
	}

	findOne(id: string) {
		return Promise.resolve(this.documents.get(id));
	}
}

export class MockRxDatabase {
	collections = {};

	addCollections(collectionsConfig: { [key: string]: any }) {
		Object.keys(collectionsConfig).forEach((collectionName) => {
			this.collections[collectionName] = new MockRxCollection(collectionsConfig[collectionName]);
		});
		console.log(this.collections);

		// add getter for collection key
		Object.keys(collectionsConfig).forEach((collectionName) => {
			Object.defineProperty(this, collectionName, {
				get: () => this.collections[collectionName],
			});
		});
	}
}
