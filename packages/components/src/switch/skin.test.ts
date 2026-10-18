import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('h-5 w-8.5');
	expect(source).toContain('size-4');
	expect(source).toContain('bg-card');
	expect(source).toContain('bg-border');
	expect(source).toContain('CROSSFADE');
	expect(source).not.toContain('focus-visible');
	expect(source).not.toContain('getTranslateX');
	expect(source).not.toContain('px-px');
});

it('keeps the row a native switch sits in at least a row tall', () => {
	// The 44 pt press square overflows the drawn track; a row of 44 keeps it inside its own row.
	expect(source).toContain('native:min-h-row');
	expect(fs.readFileSync(path.join(__dirname, '../form/switch.tsx'), 'utf8')).toContain(
		'native:min-h-row'
	);
});
