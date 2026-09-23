import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'combobox.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('rounded-lg border px-3');
	expect(source).toContain('opacity-45');
	expect(source).toContain("'text-base'");
	expect(source).not.toContain('ring-offset');
});
