import { search, create, insert, update, remove, Orama, insertMultiple, count } from '@orama/orama';
// import { restore, persist } from '@orama/plugin-data-persistence';
import defaults from 'lodash/defaults';
import mapValues from 'lodash/mapValues';
import pick from 'lodash/pick';
import { RxCollection, RxPlugin } from 'rxdb';
import { BehaviorSubject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import type { Results } from '@orama/orama';

interface SearchableCollection extends RxCollection {
	searchFields: string[];
	searchDB: Orama;
	search: (input: string, opts?: any) => Results;
	createLunrIndex: () => void;
}

/**
 * This plugin adds a `reset` method to collections.
 *
 * This is similar to the `remove` method, but it also re-adds the collection so
 * it can be used in place.
 *
 * I'm using this to add a 'clear and sync' option so users can blast their local
 * storage in case something goes wrong.
 */
export const searchPlugin: RxPlugin = {
	name: 'search',
	rxdb: true,

	prototypes: {
		RxCollection: (proto: SearchableCollection) => {
			proto.createSearchDB = async function () {
				const collection = this;
				const primaryPath = collection.schema.primaryPath;
				const searchFields = collection.options.searchFields;
				const jsonSchema = pick(collection.schema.jsonSchema.properties, searchFields);
				const schema = mapValues(jsonSchema, (value) => value.type); // orama doesn't support json schema yet
				const searchFieldPlusPrimaryPath = [primaryPath, ...searchFields];

				/**
				 * TODO: it should be possible to use rxdb as the document store:
				 * https://docs.oramasearch.com/internals/components#documentsstore
				 */
				collection.searchDB = await create({
					id: collection.name,
					schema,
					sortBy: {
						enabled: false,
					},
					components: {
						tokenizer: { language: 'english', stemming: false, stopWords: false },
						getDocumentIndexId(doc) {
							return doc[primaryPath];
						},
						afterInsert(args) {
							collection.searchTrigger.next(args);
						},
						afterRemove(args) {
							collection.searchTrigger.next(args);
						},
						afterUpdate(args) {
							collection.searchTrigger.next(args);
						},
						afterMultipleInsert(args) {
							collection.searchTrigger.next(args);
						},
						afterMultipleRemove(args) {
							collection.searchTrigger.next(args);
						},
						afterMultipleUpdate(args) {
							collection.searchTrigger.next(args);
						},
					},
				});

				// get all docs and insert into search db
				const docs = await collection.find().exec();
				await insertMultiple(
					collection.searchDB,
					docs.map((doc) => pick(doc.toJSON(), searchFieldPlusPrimaryPath))
				);
			};

			/**
			 *
			 */
			proto.search = async function (term: string, opts: object) {
				const collection = this;
				const limit = await count(collection.searchDB);
				const config = defaults(
					{
						properties: '*', // Search all fields by default
						limit, // Orama defaults to 10
						threshold: 0,
					},
					opts
				);
				return search(collection.searchDB, { term, ...config });
			};

			/**
			 *
			 */
			proto.search$ = function (term: string, opts: object) {
				const collection = this;
				return collection.searchTrigger$.pipe(
					switchMap(() => collection.search(term, opts))
					// distinctUntilChanged((prev, next) => {
					// 	// only emit when the uuids change
					// 	return isEqual(
					// 		prev.hits.map((obj) => obj.id),
					// 		next.hits.map((obj) => obj.id)
					// 	);
					// })
				);
			};
		},
	},

	hooks: {
		createRxCollection: {
			after({ collection }) {
				if (!Array.isArray(collection.options.searchFields)) {
					return;
				}

				const primaryPath = collection.schema.primaryPath;
				const searchFields = collection.options.searchFields;
				const searchFieldPlusPrimaryPath = [primaryPath, ...searchFields];

				// create search trigger
				collection.searchTrigger = new BehaviorSubject(null);
				collection.searchTrigger$ = collection.searchTrigger.asObservable();

				// Create Lunr index
				collection.createSearchDB();

				/**
				 *
				 */
				collection.postRemove(async (data) => {
					await remove(collection.searchDB, data[primaryPath]);
				}, false);

				/**
				 *
				 */
				collection.postSave(async (data) => {
					const prunedData = pick(data, searchFieldPlusPrimaryPath);
					await update(collection.searchDB, data.uuid, prunedData);
				}, false);

				/**
				 *
				 */
				collection.postInsert(async (data) => {
					const prunedData = pick(data, searchFieldPlusPrimaryPath);
					await insert(collection.searchDB, prunedData);
				}, false);
			},
		},
	},
};
