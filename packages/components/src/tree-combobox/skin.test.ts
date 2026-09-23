import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'tree-combobox.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('opacity-45');
	// The closed face is one value box, and it lights its own border while open.
	expect(source).toContain('function TreeComboboxValue');
	expect(source.match(/open && 'border-ring'/g)).toHaveLength(2);
});
