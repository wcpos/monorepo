import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'index.tsx'), 'utf8');

it('closes with the borderless, muted 44 pt icon button, overriding ModalClose’s outline', () => {
	expect(source).toContain('<IconButton name="xmark" variant="default" />');
});

it('counts the status bar once for a full-size modal: the host pads it, the panel adds 8', () => {
	expect(source).toContain('paddingTop: fill ? 0 : insets.top');
	expect(source).toContain('border-0 py-2 shadow-none');
});
