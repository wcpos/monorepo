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

it('the rows a native switch sits in carry no row floor, so stacked switches keep the web pitch', () => {
	// The 44 pt press square overflows the drawn track and its row (Paul: a 44 row read too wide);
	// geometry.test.tsx pins that the square still covers the track.
	expect(source).not.toContain('min-h-row');
	expect(fs.readFileSync(path.join(__dirname, '../form/switch.tsx'), 'utf8')).not.toContain(
		'min-h-row'
	);
});
