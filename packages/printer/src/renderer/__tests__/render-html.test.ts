import { describe, expect, it } from 'vitest';

import { parseXml } from '../parse-xml';
import { renderHtml } from '../render-html';

describe('renderHtml', () => {
	it('container has monospace font and correct 48ch width', () => {
		const ast = parseXml('<receipt></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain("font-family: 'Courier New', Courier, monospace");
		expect(html).toContain('width: 48ch');
	});

	it('container uses 32ch width for 58mm paper', () => {
		const ast = parseXml('<receipt paper-width="32"></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('width: 32ch');
	});

	it('<text> renders as <div>', () => {
		const ast = parseXml('<receipt><text>hello</text></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('<div>hello</div>');
	});

	it('<bold> renders as <strong>', () => {
		const ast = parseXml('<receipt><bold>important</bold></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('<strong>important</strong>');
	});

	it('<underline> includes text-decoration: underline', () => {
		const ast = parseXml('<receipt><underline>underlined</underline></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('text-decoration: underline');
		expect(html).toContain('underlined');
	});

	it('<invert> includes background: #000 and color: #fff', () => {
		const ast = parseXml('<receipt><invert>inverted</invert></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('background: #000');
		expect(html).toContain('color: #fff');
		expect(html).toContain('inverted');
	});

	it('<align mode="center"> includes text-align: center', () => {
		const ast = parseXml('<receipt><align mode="center">centered</align></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('text-align: center');
		expect(html).toContain('centered');
	});

	it('<size width="2"> includes font-size: 2em', () => {
		const ast = parseXml('<receipt><size width="2">big</size></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('font-size: 2em');
		expect(html).toContain('big');
	});

	it('<row> + <col> produce flex layout with ch widths and text-align', () => {
		const ast = parseXml(
			'<receipt><row><col width="24" align="left">Item</col><col width="24" align="right">$10</col></row></receipt>'
		);
		const html = renderHtml(ast);
		expect(html).toContain('display: flex');
		expect(html).toContain('flex: 0 0 24ch');
		expect(html).toContain('text-align: left');
		expect(html).toContain('text-align: right');
		expect(html).toContain('Item');
		expect(html).toContain('$10');
	});

	it('<line /> produces dashed hr', () => {
		const ast = parseXml('<receipt><line/></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('border-top: 1px dashed #000');
	});

	it('<line style="double" /> produces double border', () => {
		const ast = parseXml('<receipt><line style="double"/></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('border-top: 3px double #000');
	});

	it('<cut /> produces cut visual with scissors character', () => {
		const ast = parseXml('<receipt><cut/></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('&#9986;');
	});

	it('<feed lines="3" /> produces vertical space', () => {
		const ast = parseXml('<receipt><feed lines="3"/></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain(`height: ${3 * 1.4}em`);
	});

	it('<drawer /> produces empty string', () => {
		const ast = parseXml('<receipt><drawer/></receipt>');
		const html = renderHtml(ast);
		// The outer container div wraps empty content
		const inner = html.replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
		expect(inner).toBe('');
	});

	it('nested formatting renders correctly', () => {
		const ast = parseXml('<receipt><bold><underline>both</underline></bold></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('<strong><span style="text-decoration: underline">both</span></strong>');
	});

	it('escapes HTML entities in text', () => {
		const ast = parseXml('<receipt><text>1 &lt; 2 &amp; 3 &gt; 0</text></receipt>');
		const html = renderHtml(ast);
		expect(html).toContain('1 &lt; 2 &amp; 3 &gt; 0');
	});

	it('<col width="*"> renders as flex: 1', () => {
		const ast = parseXml(
			'<receipt><row><col width="*">Name</col><col width="10" align="right">Price</col></row></receipt>'
		);
		const html = renderHtml(ast);
		expect(html).toContain('flex: 1');
		expect(html).toContain('flex: 0 0 10ch');
		expect(html).toContain('Name');
		expect(html).toContain('Price');
	});

	it('multiple star columns each get flex: 1', () => {
		const ast = parseXml(
			'<receipt><row><col width="*">A</col><col width="8">B</col><col width="*">C</col></row></receipt>'
		);
		const html = renderHtml(ast);
		const flexOneCount = (html.match(/flex: 1/g) || []).length;
		expect(flexOneCount).toBe(2);
	});
});
