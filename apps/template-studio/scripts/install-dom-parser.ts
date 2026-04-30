import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
if (!globalThis.DOMParser) {
	globalThis.DOMParser = dom.window.DOMParser;
}
