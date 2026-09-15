/**
 * The logger's write-time fold and the encoder's query-time fold must be the
 * SAME function, or the Logs screen's scan (a substring match in fold space)
 * silently misses rows. utils cannot import sync-core, so the logger carries a
 * mirror; this test is what keeps the mirror honest.
 */
import { buildScanSearchSelector, foldSearchText } from '@wcpos/sync-core';
import { foldLogSearchText } from '@wcpos/utils/logger';

const SAMPLES = [
	'Conexión rechazada',
	'Conexión perdida', // NFD
	'İstanbul', // U+0130 lowercases to two code points
	'Kelvin', // Kelvin sign
	'Ωmega', // Ohm sign
	'STRAẞE', // capital sharp s
	'Σύνδεση απέτυχε',
	'Ошибка сети йод',
	'한글 로그',
	'한글 로그'.normalize('NFD'),
	'क़रीब', // U+0958, composition-excluded
	'𐐀𐐀𐐀', // Deseret, supplementary plane
	'"products/992915" can\'t download — pull escalation',
];

describe('search fold parity', () => {
	it.each(SAMPLES)('folds %s identically on both sides', (sample) => {
		expect(foldLogSearchText(sample)).toBe(foldSearchText(sample));
	});

	it.each([
		['Conexión rechazada', 'conexion'],
		['Conexión rechazada', 'Conexión'],
		['Conexión perdida', 'Conexión'],
		['İstanbul', 'istanbul'],
		['Kelvin', 'kelvin'],
		['Ωmega', 'ωmega'],
		['STRAẞE', 'straße'],
		['Σύνδεση απέτυχε', 'συνδεση'],
		['Ошибка сети йод', 'иод'],
		['한글 로그', '한글'],
		['한글 로그'.normalize('NFD'), '한글'],
		['क़रीब', 'क़रीब'],
		['𐐀𐐀𐐀', '𐐨𐐨𐐨'],
	])('a row storing the fold of %s is found by the term %s', (stored, term) => {
		const selector = buildScanSearchSelector({ foldedField: 'fold', rawFields: [], search: term });
		if (!selector) throw new Error('term produced no selector');
		const fold = foldLogSearchText(stored);
		for (const clause of selector.$and) {
			const arm = clause.$or[0].fold;
			expect(new RegExp(arm.$regex, arm.$options)).toBeDefined();
			expect(new RegExp(arm.$regex, arm.$options).test(fold)).toBe(true);
		}
	});
});
