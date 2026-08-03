import en from '../src/contexts/translations/locales/en/core.json';

const catalog = en as Record<string, string>;

const plurals = new Intl.PluralRules('en');

/**
 * Resolve the catalog entry i18next would pick for `key`.
 *
 * With a numeric `count`, i18next appends the CLDR plural category for the
 * language (`_one` / `_other` in English, plus an exact `_zero` when the
 * catalog defines one) before falling back to the bare key. Doing the same here
 * keeps pluralised test output in step with what renders.
 */
function resolve(key: string, count: unknown): string {
	if (typeof count !== 'number' || !Number.isFinite(count)) {
		return catalog[key] ?? key;
	}
	const suffixed = [
		...(count === 0 ? [`${key}_zero`] : []),
		`${key}_${plurals.select(count)}`,
	].find((candidate) => catalog[candidate] !== undefined);
	return suffixed !== undefined ? catalog[suffixed] : (catalog[key] ?? key);
}

/**
 * A `t()` stand-in for tests that assert on rendered English.
 *
 * It resolves from `locales/en/core.json` — the exact catalog the app registers
 * as the `en` resource — so a test proving user-facing copy proves the copy that
 * actually ships. Interpolation matches the i18next instance's `{var}` config.
 *
 * Unknown keys fall through to the key itself, mirroring i18next's behaviour
 * when nothing resolves.
 */
export function createTestT() {
	return (key: string, values?: Record<string, unknown>): string => {
		const template = resolve(key, values?.count);
		if (!values) {
			return template;
		}
		return template.replace(/\{(\w+)\}/g, (match, name: string) =>
			values[name] === undefined ? match : String(values[name])
		);
	};
}
