/**
 * This is a bit of a hack, we need to create a searchDB with the locale,
 * but the locale can be changed after the storeDB is created in the app.
 *
 * After creation the searchDBs are registered in searchDBs so they can be shared.
 *
 * @TODO - it might be better to init the storeDB with a given locale
 * This could allow tighter integration of Orama and RxDB (eg: persistance)
 * There might be other use cases for having locale available during storeDB
 * creation?
 */
import { create, insertMultiple, remove, insert, update } from '@orama/orama';
import trim from 'lodash/trim';
import { BehaviorSubject } from 'rxjs';

import { buildSchema, pluckProperties } from './utils';

const localeToLangMap: { [key: string]: string } = {
	nl: 'dutch',
	fr: 'french',
	it: 'italian',
	no: 'norwegian',
	pt: 'portuguese',
	ru: 'russian',
	es: 'spanish',
	sv: 'swedish',
	de: 'german',
	fi: 'finnish',
	da: 'danish',
	hu: 'hungarian',
	ro: 'romanian',
	sr: 'serbian',
	tr: 'turkish',
	lt: 'lithuanian',
	ar: 'arabic',
	ne: 'nepali',
	ga: 'irish',
	hi: 'indian', // Hindi is used as a representative for Indian
	hy: 'armenian',
	el: 'greek',
	id: 'indonesian',
	uk: 'ukrainian',
	sl: 'slovenian',
	bg: 'bulgarian',
	ta: 'tamil',

	// custom tokenizers
	ja: 'japanese',
	ko: 'korean',
	th: 'thai',
	vi: 'vietnamese',
	zh: 'chinese',
	// Default to English for any other locale
};

const SPLITTERS: Record<string, RegExp> = {
	japanese: /[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/gim,
	korean: /[^a-zA-Z0-9\u3131-\u3163\uAC00-\uD7A3]+/gim,
	thai: /[^a-zA-Z0-9ก-๙]+/gim,
	vietnamese: /[^a-zA-Z0-9àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềễểệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]+/gim,
	chinese: /[^a-zA-Z0-9\u4e00-\u9fff]+/gim,
};

function getTokenizer(locale) {
	const langCode = locale.split('_')[0];
	const lang = localeToLangMap[langCode] || 'english';
	const splitRule = SPLITTERS[lang];

	if (splitRule) {
		return {
			language: lang,
			normalizationCache: new Map(),
			tokenize(input: string) {
				if (typeof input !== 'string') {
					return [input];
				}
				const tokens = input
					.toLowerCase()
					.split(splitRule)
					.map(trim)
					// .map(this.normalizeToken.bind(this, prop ?? ''))
					.filter(Boolean);

				return tokens;
			},
		};
	}

	return null;
}

/**
 * Each collection-locale should only have one searchDB
 */
const searchDBs: Map<string, any> = new Map();

/**
 *
 */
export async function maybeCreateSearchDB(collection, locale) {
	const langCode = locale.split('_')[0];
	const language = localeToLangMap[langCode] || 'english';
	const key = collection.name + '-' + language;

	// return cached searchDB if it exists
	if (searchDBs.has(key)) {
		return searchDBs.get(key);
	}

	const primaryPath = collection.schema.primaryPath;
	const searchFields = collection.options.searchFields || [];
	const schema = buildSchema(collection.schema.jsonSchema.properties, searchFields); // orama doesn't support json schema yet

	// Base options
	const options = {
		id: key,
		language,
		schema,
		sort: {
			enabled: false,
		},
		components: {
			getDocumentIndexId: (doc) => {
				const indexID = doc[primaryPath];
				if (!indexID) {
					throw new Error(`Missing primary path ${primaryPath}`);
				}
				return indexID;
			},
		},
	};

	// Check if a custom tokenizer exists for the locale
	const customTokenizer = getTokenizer(locale);

	if (customTokenizer) {
		options.language = undefined; // Set language to undefined if custom tokenizer exists
		options.components.tokenizer = customTokenizer;
	}

	const searchDB = await create(options);
	const changed = new BehaviorSubject(null);
	searchDB.changed$ = changed.asObservable();
	searchDBs.set(key, searchDB);

	/**
	 * Populate the searchDB with the stored records
	 */
	const docs = await collection.find().exec();
	await insertMultiple(
		searchDB,
		docs.map((doc) => pluckProperties(doc.toJSON(), [primaryPath, ...searchFields]))
	);

	/**
	 * Attach a trigger to the searchDB to alert the search state that the searchDB has changed
	 */

	/**
	 * Now we need to subscribe to collection changes to keep the searchDB up-to-date
	 */
	const subscription = collection.$.subscribe(async (changeEvent) => {
		if (changeEvent.isLocal) {
			return;
		}

		/**
		 * @TODO - I'm not sure why this happens, collection has an INSERT event but
		 * the document is already in the search db
		 */
		if (
			changeEvent.operation === 'INSERT' &&
			searchDB.internalDocumentIDStore.idToInternalId.has(changeEvent.documentId)
		) {
			return;
		}

		switch (changeEvent.operation) {
			case 'INSERT':
				await insert(
					searchDB,
					pluckProperties(changeEvent.documentData, [primaryPath, ...searchFields])
				);
				changed.next(null);
				break;
			case 'UPDATE':
				await update(
					searchDB,
					changeEvent.documentId,
					pluckProperties(changeEvent.documentData, [primaryPath, ...searchFields])
				);
				changed.next(null);
				break;
			case 'DELETE':
				await remove(searchDB, changeEvent.documentId);
				changed.next(null);
				break;
			default:
		}
	});

	/**
	 * Remove the searchDB from the cache when the collection is destroyed
	 * eg: when the collection is cleared & resynced
	 */
	collection.onDestroy.push(() => {
		searchDBs.delete(key);
		subscription.unsubscribe();
	});

	return searchDB;
}
