// Modern ES Module version using native fetch and Web APIs
// کلید امنیتی اختصاصی
const AUTH_KEY = "Khko_Secure_2026";

// Function to rewrite URLs in HTML content
function rewriteUrls(html, originalDomain, proxyDomain) {
	html = html.replace(
		new RegExp(originalDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
		proxyDomain,
	);
	html = html.replace(/(<meta[^>]*content=['"])\/([^'"]*?)(['"][^>]*>)/g, "$1/$2$3");
	html = html.replace(/(<link[^>]*href=['"])\/([^'"]*?)(['"][^>]*>)/g, "$1/$2$3");
	html = html.replace(/@import\s+url\(['"]?\/([^'"]*?)['"]?\)/g, `@import url('/$1')`);
	html = html.replace(/@import\s+['"]\/([^'"]*?)['"];/g, `@import '/$1';`);
	html = html.replace(/url\(['"]?\/([^'"]*?)['"]?\)/g, `url('/$1')`);
	html = html.replace(/(action=['"])\/([^'"]*?)(['"])/g, "$1/$2$3");
	html = html.replace(/((?:window\.)?location\.href\s*=\s*['"])\/([^'"]*?)(['"])/g, "$1/$2$3");
	html = html.replace(/((?:window\.)?open\(['"])\/([^'"]*?)(['"])/g, "$1/$2$3");
	return html;
}

// Function to rewrite URLs in CSS content
function rewriteCssUrls(css, originalDomain, proxyDomain) {
	css = css.replace(
		new RegExp(originalDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
		proxyDomain,
	);
	css = css.replace(/@import\s+url\(['"]?\/([^'"]*?)['"]?\)/g, `@import url('/$1')`);
	css = css.replace(/@import\s+['"]\/([^'"]*?)['"];/g, `@import '/$1';`);
	css = css.replace(/url\(['"]?\/([^'"]*?)['"]?\)/g, `url('/$1')`);
	return css;
}

// Modern ES Module export with Web API
export default async (req, context) => {
	const url = new URL(req.url);

	// ۱. بررسی قفل امنیتی ضد ربات
	const clientAuth = url.searchParams.get("auth") || req.headers.get("x-proxy-auth");
	if (clientAuth !== AUTH_KEY) {
		return new Response("Forbidden: Bot Access Denied", {
			status: 403,
			headers: { "Content-Type": "text/plain" }
		});
	}

	const path = url.pathname;
	
	// حذف auth از پارامترهایی که به سمت Nyaa ارسال می‌شوند
	url.searchParams.delete("auth");
	const cleanQuery = url.searchParams.toString() ? `?${url.searchParams.toString()}` : "";

	const urlToProxy = (typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get("PROXY_URL") : process.env.PROXY_URL) || "https://nyaa.si";
	const proxyRssPage = (typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get("PROXY_RSS_PAGE") : process.env.PROXY_RSS_PAGE) === "true";
	const targetUrl = `${urlToProxy}${path || "/"}${cleanQuery}`;

	const proxyUrl = `${url.protocol}//${req.headers.get("host")}`;

	try {
		const response = await fetch(targetUrl, {
			method: req.method,
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Accept:
					"text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
				"Accept-Language": "en-US,en;q=0.5",
				"Accept-Encoding": "gzip, deflate, br",
				Connection: "keep-alive",
				"Upgrade-Insecure-Requests": "1",
				...(req.headers.get("referer") && {
					Referer: req.headers.get("referer"),
				}),
			},
			body:
				req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
		});

		const contentType = response.headers.get("content-type") || "";

		if (contentType.includes("text/html")) {
			let body = await response.text();
			body = rewriteUrls(body, urlToProxy, proxyUrl);

			return new Response(body, {
				status: response.status,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=300",
					"Access-Control-Allow-Origin": "*",
					"X-Frame-Options": "SAMEORIGIN",
				},
			});
		} else if (contentType.includes("text/css")) {
			let body = await response.text();
			body = rewriteCssUrls(body, urlToProxy, proxyUrl);

			return new Response(body, {
				status: response.status,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=3600",
					"Access-Control-Allow-Origin": "*",
				},
			});
		} else if (contentType.includes("application/xml")) {
			let body = await response.text();
			if (proxyRssPage) {
				body = body.replaceAll(urlToProxy, proxyUrl);
			}

			return new Response(body, {
				status: response.status,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=3600",
					"Access-Control-Allow-Origin": "*",
				},
			});
		} else {
			const arrayBuffer = await response.arrayBuffer();

			return new Response(arrayBuffer, {
				status: response.status,
				headers: {
					"Content-Type": contentType,
					"Cache-Control": "public, max-age=3600",
					"Access-Control-Allow-Origin": "*",
				},
			});
		}
	} catch (error) {
		console.error("Proxy error:", error);

		if (
			error.message &&
			(error.message.includes("429") || error.message.includes("ECONNRESET"))
		) {
			return new Response(
				`
        <html>
          <head><title>Service Temporarily Unavailable</title></head>
          <body>
            <h1>Service Temporarily Unavailable</h1>
            <p>The service is experiencing high traffic. Please try again in a few moments.</p>
          </body>
        </html>
      `,
				{
					status: 503,
					headers: { "Content-Type": "text/html" },
				},
			);
		}

		return new Response(JSON.stringify({ error: "Internal server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
