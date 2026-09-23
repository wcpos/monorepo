import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'common.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('gap-1.5');
	expect(source).toContain("'p-0'");
	expect(source).toContain('FadeOut.duration(CROSSFADE)');
});
