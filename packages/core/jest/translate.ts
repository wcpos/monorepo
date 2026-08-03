import en from '../src/contexts/translations/locales/en/core.json';

const catalog = en as Record<string, string>;

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
		const template = catalog[key] ?? key;
		if (!values) {
			return template;
		}
		return template.replace(/\{(\w+)\}/g, (match, name: string) =>
			values[name] === undefined ? match : String(values[name])
		);
	};
}
