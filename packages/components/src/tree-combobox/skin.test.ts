import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'tree-combobox.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('opacity-45');
});
