import createDOMPurify from 'dompurify';

export interface SanitizeHtmlOptions {
	/** Additional tag names to allow beyond DOMPurify's default HTML profile. */
	addTags?: string[];
	/** Additional attribute names to allow beyond DOMPurify's default HTML profile. */
	addAttributes?: string[];
}

/**
 * Sanitize rendered receipt HTML before it is inserted into an admin/browser DOM.
 *
 * The default profile deliberately excludes SVG/MathML and strips scripts,
 * event handlers, and unsafe URL protocols while preserving normal receipt HTML.
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

	if (typeof DOMParser !== 'undefined') {
		return sanitizeWithDomParser(html, options);
	}

	// Last-resort non-DOM fallback for SSR/build tooling: return escaped text instead of unsafe markup.
	return escapeHtml(html);
}

const URL_BEARING_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'xlink:href']);

function hasUnsafeProtocol(raw: string): boolean {
	const normalized = raw.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
	return (
		normalized.startsWith('javascript:') ||
		normalized.startsWith('vbscript:') ||
		normalized.startsWith('data:')
	);
}

function sanitizeWithDomParser(html: string, options: SanitizeHtmlOptions): string {
	const doc = new DOMParser().parseFromString(html, 'text/html');
	const allowedExtraTags = new Set((options.addTags ?? []).map((tag) => tag.toLowerCase()));
	const allowedExtraAttrs = new Set(
		(options.addAttributes ?? []).map((attr) => attr.toLowerCase())
	);

	for (const el of Array.from(doc.querySelectorAll('script, iframe, object, embed, svg, math'))) {
		if (!allowedExtraTags.has(el.tagName.toLowerCase())) {
			el.remove();
		}
	}

	for (const el of Array.from(doc.body.querySelectorAll('*'))) {
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			const value = attr.value.trim();

			if (name.startsWith('on') && !allowedExtraAttrs.has(name)) {
				el.removeAttribute(attr.name);
				continue;
			}

			if (URL_BEARING_ATTRIBUTES.has(name) && hasUnsafeProtocol(value)) {
				el.removeAttribute(attr.name);
			}
		}
	}

	return doc.body.innerHTML;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
