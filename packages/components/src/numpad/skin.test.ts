import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('<Keypad');
	expect(source).toContain('numpad-key-decimal');
	expect(source).toContain('numpad-key-icon-plusMinus');
	expect(source).not.toContain('grid');
	expect(source).not.toContain('222px');
	expect(source).not.toContain('146px');
	expect(source).not.toContain('72px');
	// The prop survives as a deprecated, ignored type member; nothing reads it.
	expect(source).not.toMatch(/columnSize\s*[=,}]/);
});
