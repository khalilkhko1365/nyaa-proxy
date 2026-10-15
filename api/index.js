import { Hono } from "hono";
import { handle } from "hono/vercel";

export const runtime = "edge";

const app = new Hono();
const urlToProxy = process.env.PROXY_URL || "https://nyaa.si";
const proxyRssPage = process.env.PROXY_RSS_PAGE === "true";

// رمز اختصاصی خودت (می‌تونی تغییرش بدی)
const AUTH_KEY = "Khko_Secure_2026";

// Function to determine if the URL is an RSS feed
const isRssFeedUrl = (url) => {
	const rssFeedPattern = /page=rss/;
	return rssFeedPattern.test(url);
};

// Proxy handler - تمام روت‌ها بررسی می‌شوند
app.all("*", async (c) => {
	// بررسی قفل امنیتی: چک کردن هدر یا پارامتر auth
	const clientAuth = c.req.header("x-proxy-auth") || c.req.query("auth");

	if (clientAuth !== AUTH_KEY) {
		return c.text("Forbidden: Unauthorized Bot Access", 403);
	}

	const url = new URL(c.req.url);
	const targetUrl = new URL(urlToProxy + url.pathname + url.search);

	// حذف پارامتر auth از ارسالی به Nyaa (در صورت ارسال با query)
	targetUrl.searchParams.delete("auth");

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

// Export the Hono API
export const GET = handle(app);
export const POST = handle(app);
