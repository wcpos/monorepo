import en from './locales/en/core.json';

/**
 * Plural suffixes in this catalogue are a contract with two consumers, and a
 * wrong one fails quietly in both.
 *
 * i18next resolves `one`/`other` for English, so a base whose plural form is
 * named anything else is unreachable — it renders only if a call site asks for
 * the suffixed key by hand, which is how `attention_many` survived review.
 *
 * Downstream, wcpos/translations expands each base into the CLDR categories its
 * locale requires. A base with no `_other` is missing a required key in all 52
 * locales at once, and the release pipeline then rewrites the odd suffix to
 * `_other` in the published artifact — so the shipped catalogue stops matching
 * the key the app asks for, and every non-English user falls back to English.
 */
const CLDR_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const SUFFIX_RE = new RegExp(`^(.+)_(${CLDR_SUFFIXES.join('|')})$`);

describe('en core catalogue plural forms', () => {
	const keys = Object.keys(en as Record<string, string>);

	it('gives every plural base an _other form', () => {
		const bases = new Set(
			keys.map((key) => SUFFIX_RE.exec(key)?.[1]).filter((base): base is string => !!base)
		);
		const withoutOther = [...bases].filter((base) => !keys.includes(`${base}_other`));

		expect(withoutOther).toEqual([]);
	});

	it('uses no plural category English does not have', () => {
		// `en` is one/other. Anything else cannot be selected by i18next here and
		// belongs to a translated locale, never to the source catalogue.
		const foreign = keys.filter((key) => /_(zero|two|few|many)$/.test(key));

		expect(foreign).toEqual([]);
	});
});
