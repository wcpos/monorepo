import { of } from 'rxjs';

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
	private mockLocalData = {};
	public name: string;

	constructor(config) {
		this.name = config.name;
	}

	insert(docData: any) {
		const doc = new MockRxDocument(docData);
		this.documents.set(docData.id, doc);
		return Promise.resolve(doc);
	}

	find() {
		return {
			$: of(Array.from(this.documents.values())),
		};
	}

	findOne(id: string) {
		return Promise.resolve(this.documents.get(id));
	}

	getLocal$(id: string) {
		return of(this.mockLocalData[id]);
	}

	setMockLocalData(id: string, data: any) {
		this.mockLocalData[id] = data;
	}
}

export class MockRxDatabase {
	collections = {};

	addCollections(collectionsConfig: { [key: string]: any }) {
		Object.keys(collectionsConfig).forEach((collectionName) => {
			this.collections[collectionName] = new MockRxCollection({
				name: collectionName,
				...collectionsConfig[collectionName],
			});
		});

		// add getter for collection key
		Object.keys(collectionsConfig).forEach((collectionName) => {
			Object.defineProperty(this, collectionName, {
				get: () => this.collections[collectionName],
			});
		});
	}
}
