// https://github.com/thlorenz/parse-link-header
interface Link {
	url: string;
	rel: string;
	[queryParam: string]: string;
}

interface Links {
	[rel: string]: Link;
}

const PARSE_LINK_HEADER_MAXLEN = parseInt(process.env.PARSE_LINK_HEADER_MAXLEN ?? '', 10) || 2000;
const PARSE_LINK_HEADER_THROW_ON_MAXLEN_EXCEEDED =
	process.env.PARSE_LINK_HEADER_THROW_ON_MAXLEN_EXCEEDED != null;

function hasRel(x: Record<string, string> | null): x is Record<string, string> & { rel: string } {
	return !!x && !!x.rel;
}

function intoRels(acc: Links, x: Record<string, string> & { rel: string }): Links {
	function splitRel(rel: string) {
		acc[rel] = { ...x, rel } as Link;
	}

	x.rel.split(/\s+/).forEach(splitRel);

	return acc;
}

function createObjects(acc: Record<string, string>, p: string): Record<string, string> {
	// rel="next" => 1: rel 2: next
	const m = p.match(/\s*(.+)\s*=\s*"?([^"]+)"?/);
	if (m) acc[m[1]] = m[2];
	return acc;
}

function parseLink(link: string): Record<string, string> | null {
	try {
		const m = link.match(/<?([^>]*)>(.*)/);
		if (!m) return null;
		const linkUrl = m[1];
		const parts = m[2].split(';');
		const qry: Record<string, string> = {};
		// The origin is unused but it's required to parse relative URLs
		const url = new URL(linkUrl, 'https://example.com');

		for (const [key, value] of url.searchParams) {
			qry[key] = value;
		}

		parts.shift();

		let info: Record<string, string> = parts.reduce(createObjects, {});

		info = { ...qry, ...info };
		info.url = linkUrl;
		return info;
	} catch {
		return null;
	}
}

function checkHeader(linkHeader: string | null | undefined) {
	if (!linkHeader) return false;

	if (linkHeader.length > PARSE_LINK_HEADER_MAXLEN) {
		if (PARSE_LINK_HEADER_THROW_ON_MAXLEN_EXCEEDED) {
			throw new Error(
				`Input string too long, it should be under ${PARSE_LINK_HEADER_MAXLEN} characters.`
			);
		} else {
			return false;
		}
	}
	return true;
}

export function parseLinkHeader(linkHeader: string | null | undefined): Links | null {
	if (!checkHeader(linkHeader)) return null;

	return linkHeader!.split(/,\s*</).map(parseLink).filter(hasRel).reduce(intoRels, {});
}
