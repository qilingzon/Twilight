function getEnv(env, key) {
  if (env && typeof env === "object" && key in env) return env[key];
  if (typeof process !== "undefined" && process?.env) return process.env[key];
  return undefined;
}

function jsonResponse(body, status = 200, extraHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(extraHeaders ? Object.fromEntries(new Headers(extraHeaders)) : {}),
    },
  });
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmacSha256(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

function extractAuthToken(request) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^(?:token|bearer)\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

async function verifyAuthToken({ token, secret }) {
  if (!token || !secret) return { ok: false, reason: "missing" };

  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "format" };

  const [payloadB64, sigB64] = parts;
  let payloadJson;
  try {
    payloadJson = new TextDecoder().decode(base64UrlDecodeToBytes(payloadB64));
  } catch {
    return { ok: false, reason: "payload" };
  }

  let payload;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { ok: false, reason: "payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.v !== 1 || typeof payload.exp !== "number" || payload.exp <= now) {
    return { ok: false, reason: "expired" };
  }

  const expectedSig = await hmacSha256(secret, payloadB64);
  let givenSig;
  try {
    givenSig = base64UrlDecodeToBytes(sigB64);
  } catch {
    return { ok: false, reason: "sig" };
  }

  if (!timingSafeEqual(expectedSig, givenSig)) return { ok: false, reason: "sig" };
  return { ok: true, payload };
}

function looksLikeSignedToken(token) {
  // Our signed token format is: <base64url(payload)>.<base64url(sig)>
  return typeof token === "string" && token.includes(".") && token.split(".").length === 2;
}

function stripHopByHopHeaders(headers) {
  const h = new Headers(headers);
  const hopByHop = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ];
  for (const k of hopByHop) h.delete(k);
  return h;
}

function normalizeRepo(repo) {
  if (!repo) return "";
  const trimmed = String(repo).trim();
  const m = trimmed.match(/^([^/]+)\/([^/]+)$/);
  return m ? `${m[1]}/${m[2]}` : "";
}

function isAllowedPath({ apiPath, repo }) {
  // Allow minimal endpoints needed by Decap GitHub backend.
  if (apiPath === "/user" || apiPath.startsWith("/user/")) return true;

  if (!repo) return false;
  const repoPrefix = `/repos/${repo}`;
  return apiPath === repoPrefix || apiPath.startsWith(repoPrefix + "/");
}

async function handle(request, env) {
  const authSecret = getEnv(env, "CMS_AUTH_SECRET");
  const repo = normalizeRepo(getEnv(env, "CMS_GITHUB_REPO") || "qilingzon/Twilight");

  const url = new URL(request.url);
  if (!url.pathname.startsWith("/github-api")) {
    return jsonResponse({ error: "Not Found" }, 404);
  }

  const apiPath = url.pathname.slice("/github-api".length) || "/";
  if (!isAllowedPath({ apiPath, repo })) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  // Auth strategy:
  // - If the request carries our signed token AND CMS_AUTH_SECRET is set, verify it and use GITHUB_PAT server-side.
  // - Otherwise treat the token as a GitHub OAuth access token and pass it through.
  const presentedToken = extractAuthToken(request);
  if (!presentedToken) {
    return jsonResponse({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  }

  let githubToken = presentedToken;
  if (authSecret && looksLikeSignedToken(presentedToken)) {
    const verified = await verifyAuthToken({ token: presentedToken, secret: authSecret });
    if (verified.ok) {
      const githubPat = getEnv(env, "GITHUB_PAT");
      if (!githubPat) {
        return jsonResponse({ error: "Missing env var: GITHUB_PAT" }, 500);
      }
      githubToken = githubPat;
    }
  }

  const upstream = new URL(`https://api.github.com${apiPath}`);
  upstream.search = url.search;

  const upstreamHeaders = stripHopByHopHeaders(request.headers);
  upstreamHeaders.set("Authorization", `token ${githubToken}`);
  upstreamHeaders.set("Accept", upstreamHeaders.get("Accept") || "application/vnd.github+json");
  upstreamHeaders.set("User-Agent", upstreamHeaders.get("User-Agent") || "edgeone-decap-proxy");
  upstreamHeaders.set("X-GitHub-Api-Version", "2022-11-28");
  upstreamHeaders.delete("Host");

  const init = {
    method: request.method,
    headers: upstreamHeaders,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  };

  const res = await fetch(upstream.toString(), init);

  const resHeaders = stripHopByHopHeaders(res.headers);
  resHeaders.set("Cache-Control", "no-store");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
  });
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
