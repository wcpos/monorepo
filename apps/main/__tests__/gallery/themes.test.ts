import { THEMES } from '@wcpos/components/lib/themes';

import { COLOUR_THEMES, FULL_THEMES } from '../../gallery/themes';

// The shoot lists are a copy of the theme rules that Playwright cannot import; this pins the copy.
it('the gallery shoots every theme the components package defines, each once', () => {
	const shot = [...FULL_THEMES, ...COLOUR_THEMES];
	expect([...shot].sort()).toEqual([...THEMES].sort());
	expect(new Set(shot).size).toBe(shot.length);
});
