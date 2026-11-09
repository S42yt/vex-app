export const PROXY_PLACEHOLDER = "http://user:pass@proxy.example.com:8080";

export const INVALID_PROXY_MESSAGE =
	"Enter the proxy's full address, like http://host:port, or leave it empty.";

function parseHttpUrl(raw: string): URL | null {
	const input = raw.trim();
	if (!/^https?:\/\//i.test(input)) return null;
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	return url.port === "0" ? null : url;
}

export function parseServerUrl(raw: string): string | null {
	const url = parseHttpUrl(raw);
	return url ? url.origin + url.pathname.replace(/\/+$/, "") : null;
}

export function parseProxyUrl(raw: string): string | null {
	if (!raw.trim()) return "";
	const url = parseHttpUrl(raw);
	if (!url || url.pathname !== "/" || url.search || url.hash) return null;
	return url.href.replace(/\/$/, "");
}
