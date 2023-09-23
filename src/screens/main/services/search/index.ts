import { create, insertMultiple, count, search, remove, insert, update } from '@orama/orama/dist';
import defaults from 'lodash/defaults';
import isEmpty from 'lodash/isEmpty';
import trim from 'lodash/trim';
import { RxCollection } from 'rxdb';
import { Subscription, Subject, Observable, of } from 'rxjs';

import log from '@wcpos/utils/src/logger';

import { buildSchema, pluckProperties } from './schema.helpers';

import type { Orama } from '@orama/orama';

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

/**
 * Orama Search Service for WooCommerce POS
 *
 * This provides tokenised search functionality for the POS.
 * - Searching via local storage is limited, ie: no fuzzy search, no tokenisation
 * - We need the locale to provide a better search experience
 * - This could be a rxdb plugin, but bringing it into the app give us more control
 */
export class SearchService {
	public readonly subs: Subscription[] = [];
	private searchDB: Orama<any>;
	private primaryPath: string;
	private searchFields: string[];
	private searchTerm: string = '';

	/**
	 * A new search subject is created each time search$ is called
	 * - we need this to push new results if the searchDB changes
	 */
	private currentSearchSubject: Subject<string[]> | null = null;

	constructor(
		public collection: RxCollection<any, object, object>,
		public locale: string
	) {
		this.primaryPath = collection.schema.primaryPath;
		this.searchFields = collection.options.searchFields || [];

		// if this.searchFields is empty, there is no point in continuing
		if (this.searchFields.length === 0) {
			return;
		}

		// init search db
		this.init();
	}

	private async init() {
		await this.createSearchDB();

		// get all local docs and add to search db
		try {
			const docs = await this.collection.find().exec();
			await insertMultiple(
				this.searchDB,
				docs.map((doc) => pluckProperties(doc.toJSON(), [this.primaryPath, ...this.searchFields]))
			);
		} catch (err) {
			log.error(err);
		}

		// watch for changes and update search db
		this.subs.push(
			this.collection.$.subscribe(async (changeEvent) => {
				if (changeEvent.isLocal) {
					return;
				}

				/**
				 * @TODO - I'm not sure why this happens, collection has an INSERT event but
				 * the document is already in the search db
				 */
				if (
					changeEvent.operation === 'INSERT' &&
					this.searchDB.internalDocumentIDStore.idToInternalId.has(changeEvent.documentId)
				) {
					return;
				}

				switch (changeEvent.operation) {
					case 'INSERT':
						await insert(
							this.searchDB,
							pluckProperties(changeEvent.documentData, [this.primaryPath, ...this.searchFields])
						);
						this.search();
						break;
					case 'UPDATE':
						await update(
							this.searchDB,
							changeEvent.documentId,
							pluckProperties(changeEvent.documentData, [this.primaryPath, ...this.searchFields])
						);
						this.search();
						break;
					case 'DELETE':
						await remove(this.searchDB, changeEvent.documentId);
						this.search();
						break;
					default:
				}
			})
		);
	}

	async createSearchDB() {
		try {
			// Base options
			const options = {
				id: this.collection.name,
				language: this.getLanguage(),
				schema: this.getSearchSchema(),
				sort: {
					enabled: false,
				},
				components: {
					getDocumentIndexId: (doc) => {
						const indexID = doc[this.primaryPath];
						if (!indexID) {
							throw new Error(`Missing primary path ${this.primaryPath}`);
						}
						return indexID;
					},
				},
			};

			// Check if a custom tokenizer exists for the locale
			const customTokenizer = this.getTokenizer();

			if (customTokenizer) {
				options.language = undefined; // Set language to undefined if custom tokenizer exists
				options.components.tokenizer = customTokenizer;
			}

			this.searchDB = await create(options);
		} catch (err) {
			log.error(err);
		}
	}

	/**
	 * @TODO - changing language in settings is not updating the Query instance
	 */
	getLanguage() {
		const langCode = this.locale.split('_')[0];
		const lang = localeToLangMap[langCode] || 'english';
		return lang;
	}

	getTokenizer() {
		const langCode = this.locale.split('_')[0];
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

	getSearchSchema() {
		const schema = buildSchema(this.collection.schema.jsonSchema.properties, this.searchFields); // orama doesn't support json schema yet
		return schema;
	}

	async search(options: object = {}): Promise<string[] | null> {
		if (!this.searchDB || isEmpty(this.searchTerm)) {
			if (this.currentSearchSubject) {
				this.currentSearchSubject.next(null);
			}
			return Promise.resolve(null);
		}

		try {
			const limit = await count(this.searchDB);
			const config = defaults(
				{
					properties: '*', // Search all fields by default
					limit, // Orama defaults to 10
					threshold: 0,
				},
				options
			);
			const { hits } = await search(this.searchDB, { term: this.searchTerm, ...config });
			const uuids = hits.map((hit: { id: string }) => hit.id);
			this.currentSearchSubject.next(uuids);
			return uuids;
		} catch (err) {
			log.error(err);
		}
	}

	search$(term: string): Observable<string[]> {
		if (this.currentSearchSubject) {
			// cancel previous search results
			this.currentSearchSubject.complete();
		}

		// if term is empty, return null immediately
		if (isEmpty(term)) {
			return of(null);
		}

		// create new search subject
		this.currentSearchSubject = new Subject<string[] | null>();

		this.searchTerm = term;
		this.search();

		return this.currentSearchSubject.asObservable();
	}

	cancel() {
		this.subs.forEach((sub) => sub.unsubscribe());

		if (this.currentSearchSubject) {
			this.currentSearchSubject.complete();
		}
	}
}
