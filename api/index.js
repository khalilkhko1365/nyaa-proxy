import { Hono } from "hono";
import { handle } from "hono/vercel";

export const runtime = "edge";

const app = new Hono();
const urlToProxy = process.env.PROXY_URL || "https://nyaa.si";
const proxyRssPage = process.env.PROXY_RSS_PAGE === "true";

// کلید اختصاصی خودت
const AUTH_KEY = "Khko_Secure_2026";

const isRssFeedUrl = (url) => {
	const rssFeedPattern = /page=rss/;
	return rssFeedPattern.test(url);
};

// Proxy handler
app.all("*", async (c) => {
	const clientAuth = c.req.header("x-proxy-auth") || c.req.query("auth");

	// قفل ضد ربات
	if (clientAuth !== AUTH_KEY) {
		return c.text("Forbidden: Unauthorized Bot Access", 403);
	}

	const url = new URL(c.req.url);

	// باگ اینجا بود: پاک کردن /api از ابتدای آدرس تا به Nyaa درست ارسال بشه
	let cleanPath = url.pathname.replace(/^\/api/, "") || "/";
	
	// حذف auth از پارامترهایی که به Nyaa فرستاده میشن
	const cleanSearch = new URLSearchParams(url.search);
	cleanSearch.delete("auth");
	const queryString = cleanSearch.toString() ? `?${cleanSearch.toString()}` : "";

	const targetUrl = new URL(urlToProxy + cleanPath + queryString);

	const headers = new Headers();
	c.req.raw.headers.forEach((value, key) => {
		if (key.toLowerCase() !== "host" && key.toLowerCase() !== "x-proxy-auth") {
			headers.set(key, value);
		}
	});

	headers.set("host", targetUrl.host);

	try {
		const response = await fetch(targetUrl.toString(), {
			method: c.req.method,
			headers: headers,
			body:
				c.req.method !== "GET" && c.req.method !== "HEAD"
					? c.req.raw.body
					: undefined,
		});

		const responseHeaders = new Headers();
		response.headers.forEach((value, key) => {
			if (
				!["content-encoding", "content-length", "transfer-encoding"].includes(
					key.toLowerCase(),
				)
			) {
				responseHeaders.set(key, value);
			}
		});

		if (proxyRssPage && isRssFeedUrl(c.req.url)) {
			const responseText = await response.text();
			const proxiedUrl = `${url.protocol}//${c.req.header("host")}`;
			const modifiedResponse = responseText.replaceAll(urlToProxy, proxiedUrl);

			return new Response(modifiedResponse, {
				status: response.status,
				statusText: response.statusText,
				headers: responseHeaders,
			});
		}

		const responseBody = await response.arrayBuffer();

		return new Response(responseBody, {
			status: response.status,
			statusText: response.statusText,
			headers: responseHeaders,
		});
	} catch (error) {
		console.error("Proxy error:", error);
		return c.json({ error: "Proxy request failed" }, 500);
	}
});

export const GET = handle(app);
export const POST = handle(app);
