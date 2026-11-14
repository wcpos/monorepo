import * as fs from 'fs';
import * as path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'common.tsx'), 'utf8');

it('uses the controls-tier skin', () => {
	expect(source).toContain('gap-1.5');
	expect(source).toContain("'py-1'");
	expect(source).toContain('FadeOut.duration(CROSSFADE)');
});

it.each(['switch.tsx', 'checkbox.tsx'])(
	"a form switch's and checkbox's left edge is its column's: its item carries no side padding (%s)",
	(file) => {
		const control = fs.readFileSync(path.join(__dirname, file), 'utf8');
		expect(control).toContain('<FormItem nativeID={itemNativeID}>');
		expect(control).not.toMatch(/\bpx-1\b/);
	}
);
