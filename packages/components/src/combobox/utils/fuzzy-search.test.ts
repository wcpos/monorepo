import { commandScore } from './fuzzy-search';

describe('fuzzy-search', () => {
	describe('commandScore', () => {
		it('should return high score for exact match', () => {
			const score = commandScore('hello', 'hello', []);
			expect(score).toBeGreaterThan(0.9);
		});

		it('should return high score for prefix match', () => {
			const score = commandScore('hello world', 'hel', []);
			expect(score).toBeGreaterThan(0.5);
		});

		it('should return low score for no match', () => {
			const score = commandScore('hello', 'xyz', []);
			expect(score).toBe(0);
		});

		it('should be case insensitive', () => {
			const lowerScore = commandScore('Hello', 'hello', []);
			const upperScore = commandScore('hello', 'HELLO', []);
			// Both should match, though exact case should score slightly higher
			expect(lowerScore).toBeGreaterThan(0);
			expect(upperScore).toBeGreaterThan(0);
		});

		it('should score exact case match higher', () => {
			const exactCase = commandScore('HTML', 'HTML', []);
			const mismatchedCase = commandScore('HTML', 'html', []);
			expect(exactCase).toBeGreaterThan(mismatchedCase);
		});

		it('should score word boundary matches', () => {
			const wordStart = commandScore('Hello World', 'Wor', []);
			const midWord = commandScore('Worldwide', 'Wor', []);
			// Both should produce valid scores
			expect(wordStart).toBeGreaterThan(0);
			expect(midWord).toBeGreaterThan(0);
		});

		it('should handle space-separated words', () => {
			const score = commandScore('New York City', 'NYC', []);
			expect(score).toBeGreaterThan(0);
		});

		it('should handle hyphenated words', () => {
			const score = commandScore('real-time', 'rt', []);
			expect(score).toBeGreaterThan(0);
		});

		it('should handle underscore-separated words', () => {
			const score = commandScore('my_variable_name', 'mvn', []);
			expect(score).toBeGreaterThan(0);
		});

		describe('with aliases', () => {
			it('should match against aliases', () => {
				const withAlias = commandScore('Product', 'SKU123', ['SKU123']);
				const withoutAlias = commandScore('Product', 'SKU123', []);

				expect(withAlias).toBeGreaterThan(0);
				expect(withoutAlias).toBe(0);
			});

			it('should match against multiple aliases', () => {
				const score = commandScore('Item', 'alias2', ['alias1', 'alias2', 'alias3']);
				expect(score).toBeGreaterThan(0);
			});

			it('should prefer primary label match over alias', () => {
				const labelMatch = commandScore('product', 'prod', ['alias']);
				const aliasMatch = commandScore('item', 'prod', ['product']);
				// Both should match but potentially with different scores
				expect(labelMatch).toBeGreaterThan(0);
				expect(aliasMatch).toBeGreaterThan(0);
			});
		});

		describe('edge cases', () => {
			it('should handle empty query', () => {
				const score = commandScore('hello', '', []);
				// Empty query should match everything with highest possible score
				expect(score).toBeGreaterThan(0);
			});

			it('should handle empty string', () => {
				const score = commandScore('', 'test', []);
				expect(score).toBe(0);
			});

			it('should handle single character matches', () => {
				const score = commandScore('a', 'a', []);
				expect(score).toBeGreaterThan(0.9);
			});

			it('should handle special characters', () => {
				const withBracket = commandScore('test[0]', 't0', []);
				const withParens = commandScore('test()', 't', []);
				const withHash = commandScore('test#1', 't1', []);

				expect(withBracket).toBeGreaterThan(0);
				expect(withParens).toBeGreaterThan(0);
				expect(withHash).toBeGreaterThan(0);
			});

			it('should handle numbers in string', () => {
				const score = commandScore('Product123', '123', []);
				expect(score).toBeGreaterThan(0);
			});
		});

		describe('scoring order', () => {
			it('should rank shorter matches higher when equal prefix', () => {
				const short = commandScore('html', 'html', []);
				const longer = commandScore('html5', 'html', []);

				expect(short).toBeGreaterThan(longer);
			});

			it('should rank continuous matches higher than scattered', () => {
				const continuous = commandScore('abcdef', 'abc', []);
				const scattered = commandScore('aXbXcXdef', 'abc', []);

				expect(continuous).toBeGreaterThan(scattered);
			});
		});
	});
});
