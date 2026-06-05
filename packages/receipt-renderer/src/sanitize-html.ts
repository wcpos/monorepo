import { DOMParser as XmlDOMParser, XMLSerializer as XmlSerializer } from '@xmldom/xmldom';
import createDOMPurify from 'dompurify';

export interface SanitizeHtmlOptions {
	/** Additional tag names to allow beyond DOMPurify's default HTML profile. */
	addTags?: string[];
	/** Additional attribute names to allow beyond DOMPurify's default HTML profile. */
	addAttributes?: string[];
}

/**
 * Sanitize rendered receipt HTML before it is inserted into an admin/browser DOM
 * (or a native WebView via `srcDoc`).
 *
 * The default profile deliberately excludes SVG/MathML and strips scripts,
 * event handlers, and unsafe URL protocols while preserving normal receipt HTML.
 *
 * Three execution paths, in priority order:
 *   1. Browser/DOM with `window.document` → DOMPurify (the strongest profile).
 *   2. A runtime that exposes a global `DOMParser` (e.g. jsdom/SSR) → DOM walk.
 *   3. React Native, which has neither → parse via `@xmldom/xmldom` and walk.
 *
 * The xmldom fallback mirrors `parse-xml.ts`, which already uses xmldom on
 * native. Without it, native runtimes hit the escaped-text last resort and the
 * receipt preview renders raw HTML markup as visible text instead of HTML.
 */
export function sanitizeHtml(html: string, options: SanitizeHtmlOptions = {}): string {
	const win = globalThis.window;

	if (win?.document) {
		const purify = createDOMPurify(win);
		return purify.sanitize(html, {
			USE_PROFILES: { html: true },
			ADD_TAGS: options.addTags,
			ADD_ATTR: options.addAttributes,
		});
	}

	const parsed = parseHtmlForSanitize(html);
	if (!parsed) {
		// Last-resort non-DOM fallback for SSR/build tooling: return escaped text instead of unsafe markup.
		return escapeHtml(html);
	}

	sanitizeParsedBody(parsed.body, options);
	return parsed.serialize();
}

const URL_BEARING_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

/**
 * Tags stripped unless explicitly allow-listed via `options.addTags`. Mirrors
 * what DOMPurify's `html` profile drops on the web path: executable/embed nodes
 * (`script`/`iframe`/`object`/`embed`), document-control and remote-fetch nodes
 * (`style`/`link`/`meta`/`base`), and `svg`/`math` (re-allowed for barcode SVG
 * via `addTags`).
 */
const DANGEROUS_TAGS = new Set([
	'script',
	'iframe',
	'object',
	'embed',
	'style',
	'link',
	'meta',
	'base',
	'svg',
	'math',
]);

const XHTML_NAMESPACE_ATTR = / xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g;

function hasUnsafeProtocol(raw: string): boolean {
	const normalized = raw.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	return (
		normalized.startsWith('javascript:') ||
		normalized.startsWith('vbscript:') ||
		normalized.startsWith('data:')
	);
}

interface ParsedHtml {
	body: Element;
	serialize: () => string;
}

/**
 * Parse `html` into a DOM `<body>` and return a serializer for its inner HTML.
 * Uses the native `DOMParser` when present, and falls back to `@xmldom/xmldom`
 * for React Native runtimes that do not provide browser DOM globals. Returns
 * `null` when no parser can produce a document (callers escape as a last resort).
 */
function parseHtmlForSanitize(html: string): ParsedHtml | null {
	const source = `<!doctype html><html><body>${html}</body></html>`;

	if (typeof DOMParser !== 'undefined') {
		const doc = new DOMParser().parseFromString(source, 'text/html');
		const body = doc.body ?? doc.getElementsByTagName('body')[0];
		if (!body) return null;
		return { body, serialize: () => body.innerHTML };
	}

	try {
		const errors: string[] = [];
		const doc = new XmlDOMParser({
			onError: (_level: string, message: unknown) => errors.push(String(message)),
		} as unknown as ConstructorParameters<typeof XmlDOMParser>[0]).parseFromString(
			source,
			'text/html'
		) as unknown as Document;

		const body = doc.getElementsByTagName('body')[0] as unknown as Element | undefined;
		if (!body) return null;

		const serializer = new XmlSerializer();
		return {
			body,
			serialize: () => {
				let inner = '';
				for (const child of Array.from(body.childNodes)) {
					inner += serializer.serializeToString(
						child as unknown as Parameters<typeof serializer.serializeToString>[0]
					);
				}
				// xmldom annotates serialized HTML nodes with the XHTML namespace; the
				// attribute is inert in a WebView but noisy, so drop it.
				// codeql[js/unsafe-html] Safe because sanitizeParsedBody() removes dangerous
				// elements, event handlers, and unsafe URL protocols before serialize() runs.
				return inner.replace(XHTML_NAMESPACE_ATTR, '');
			},
		};
	} catch {
		return null;
	}
}

/**
 * Remove dangerous elements, event-handler attributes, and unsafe-protocol URLs
 * from an already-parsed `<body>`. Implemented with `getElementsByTagName('*')`
 * and `removeChild` (rather than `querySelectorAll`/`Element.remove`) so it
 * works across both the native DOM and the xmldom fallback, which lacks the
 * Selectors API and the modern `ChildNode` methods.
 *
 * Tag matching is case-insensitive on the lowercased `tagName`: xmldom preserves
 * the source casing and its `getElementsByTagName` is case-sensitive, so a
 * tag-name lookup would miss `<SCRIPT>` / `<Iframe>` that a WebView still
 * executes. Walking every element and comparing lowercased names closes that gap.
 */
function sanitizeParsedBody(body: Element, options: SanitizeHtmlOptions): void {
	const allowedExtraTags = new Set((options.addTags ?? []).map((tag) => tag.toLowerCase()));
	const allowedExtraAttrs = new Set(
		(options.addAttributes ?? []).map((attr) => attr.toLowerCase())
	);

	for (const el of Array.from(body.getElementsByTagName('*'))) {
		const tag = el.tagName.toLowerCase();
		if (DANGEROUS_TAGS.has(tag) && !allowedExtraTags.has(tag)) {
			el.parentNode?.removeChild(el);
		}
	}

	for (const el of Array.from(body.getElementsByTagName('*'))) {
		if (!el.attributes) continue;
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			const value = (attr.value ?? '').trim();

			if (name.startsWith('on') && !allowedExtraAttrs.has(name)) {
				el.removeAttribute(attr.name);
				continue;
			}

			if (URL_BEARING_ATTRIBUTES.has(name) && hasUnsafeProtocol(value)) {
				el.removeAttribute(attr.name);
			}
		}
	}
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
