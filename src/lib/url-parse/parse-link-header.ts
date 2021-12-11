// https://github.com/thlorenz/parse-link-header
import assignIn from 'lodash/assignIn';
import url from 'url';

function hasRel(x: { [key: string]: string }) {
	return x && x.rel;
}

function intoRels(acc: { [key: string]: { [key: string]: string } }, x: { [key: string]: string }) {
	function splitRel(rel: string) {
		acc[rel] = assignIn({}, x, { rel });
	}

	x.rel.split(/\s+/).forEach(splitRel);

	return acc;
}

function createObjects(acc: { [key: string]: string }, p: string) {
	// rel="next" => 1: rel 2: next
	const m = p.match(/\s*(.+)\s*=\s*"?([^"]+)"?/);
	if (m) {
		acc[m[1]] = m[2];
	}
	return acc;
}

function parseLink(link: string) {
	let info = {};
	const m = link.match(/<?([^>]*)>(.*)/);
	if (m) {
		const linkUrl = m[1];
		const parts = m[2].split(';');
		const parsedUrl = url.parse(linkUrl, true);
		parts.shift();
		info = parts.reduce(createObjects, {});
		info = assignIn({}, parsedUrl.query, info, { url: linkUrl });
	}
	return info;
}

const parseLinkHeader = (linkHeader: string): Record<string, unknown> => {
	const p = linkHeader.split(/,\s*</).map(parseLink).filter(hasRel);

	return p.reduce(intoRels, {});
};

export default parseLinkHeader;
