import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('pressed: true');
	expect(source).toContain('hovered: true');
	expect(source).toContain('opacity-45');
	expect(source).toContain('numberOfLines={1}');
	expect(source).not.toContain('group-');
	expect(source).not.toContain('truncate');
	expect(source).not.toContain('focus-visible');
	expect(source).not.toContain('whitespace-nowrap');
});
