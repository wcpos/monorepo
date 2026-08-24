import en from './locales/en/core.json';

/**
 * Plural suffixes in this catalogue are a contract with two consumers, and a
 * wrong one fails quietly in both.
 *
 * i18next resolves `one`/`other` for English, so a base whose plural form is
 * named anything else is unreachable — it renders only if a call site asks for
 * the suffixed key by hand, which is how `attention_many` survived review.
 *
 * Downstream, wcpos/translations writes each locale the CLDR categories it
 * requires and strips the ones it does not, so published plural keys are
 * generated rather than copied. A base with no `_other` is a missing key in all
 * 52 locales at once, and the odd suffix the source used is dropped — so the
 * shipped catalogue stops matching the key the app asks for, and every
 * non-English user falls back to English.
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

	/**
	 * CLDR `one` is a category, not the number 1. In is_IS, lt_LT, mk_MK, ru_RU
	 * and uk it also covers 21, 31, 41…, so an `_one` string that spells the
	 * digit instead of interpolating it reports the wrong number — "1 change
	 * never reached your server" to someone who has 21. English hides this,
	 * because English `one` really is only 1.
	 *
	 * Translations inherit the shape: wcpos/translations checks a locale's
	 * placeholders against the source string, so a source `_one` with no
	 * placeholder forbids translators from putting the count back.
	 */
	it('interpolates the count in _one wherever _other does', () => {
		const placeholders = (value: string) => (value.match(/\{[^}]+\}/g) ?? []).sort();
		const catalogue = en as Record<string, string>;

		const mismatched = keys
			.filter((key) => key.endsWith('_one') && `${key.slice(0, -4)}_other` in catalogue)
			.filter((key) => {
				const other = placeholders(catalogue[`${key.slice(0, -4)}_other`]);
				return other.join() !== placeholders(catalogue[key]).join();
			});

		expect(mismatched).toEqual([]);
	});
});
