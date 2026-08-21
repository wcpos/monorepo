export function isRestRouteBase(url: string): boolean {
	return url.includes('rest_route=');
}

export function deriveSyntheticPathRoot(wpApiUrl: string): string {
	if (!isRestRouteBase(wpApiUrl)) return wpApiUrl;
	try {
		const url = new URL(wpApiUrl);
		url.search = '';
		url.hash = '';
		url.pathname = url.pathname.replace(/(?:\/index\.php)?\/?$/, '/wp-json/');
		return url.toString();
	} catch {
		return wpApiUrl;
	}
}

export function toRestRouteUrl(url: string, wpJsonRoot: string): string {
	if (isRestRouteBase(url)) return url;
	try {
		const target = new URL(url);
		const root = new URL(wpJsonRoot);
		const rootPath = root.pathname.endsWith('/') ? root.pathname : `${root.pathname}/`;
		if (target.origin !== root.origin || !target.pathname.startsWith(rootPath)) return url;

		const route = `/${target.pathname.slice(rootPath.length)}`;
		const rootSegments = rootPath.split('/').filter(Boolean);
		rootSegments.pop();
		const homePath = rootSegments.length > 0 ? `/${rootSegments.join('/')}/` : '/';
		const home = new URL(homePath, root.origin).toString();
		return `${home}?rest_route=${route}${target.search ? `&${target.search.slice(1)}` : ''}`;
	} catch {
		return url;
	}
}

export function resolveRestTransport(site: {
	wp_api_url?: string;
	use_rest_route_param?: boolean;
}): 'path' | 'query' {
	return site.use_rest_route_param === true || isRestRouteBase(site.wp_api_url ?? '')
		? 'query'
		: 'path';
}
