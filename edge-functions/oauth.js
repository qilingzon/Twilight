function getEnv(env, key) {
  if (env && typeof env === "object" && key in env) return env[key];
  if (typeof process !== "undefined" && process?.env) return process.env[key];
  return undefined;
}

function isValidGithubClientId(clientId) {
  return typeof clientId === "string" && /^[A-Za-z0-9]+$/.test(clientId);
}

function sanitizeForDisplay(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[^A-Za-z0-9]/g, "•");
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncodeBytes(bytes);
}

function buildAuthorizeUrl({ clientId, scope, redirectUri, state }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", scope);
  if (redirectUri) url.searchParams.set("redirect_uri", redirectUri);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

async function handle(request, env) {
  const requestUrl = new URL(request.url);
  const clientId = getEnv(env, "OAUTH_GITHUB_CLIENT_ID");
  if (!clientId) {
    return new Response("Missing OAUTH_GITHUB_CLIENT_ID", { status: 500 });
  }

  if (!isValidGithubClientId(clientId)) {
    const message = [
      "Invalid OAUTH_GITHUB_CLIENT_ID.",
      "It should contain only letters and digits (no spaces, quotes, or punctuation).",
      `Current value (sanitized): ${sanitizeForDisplay(clientId)}`,
    ].join("\n");

    return new Response(message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const scope = requestUrl.searchParams.get("scope") || "repo,user";
  const redirectUri = new URL("/oauth/callback", requestUrl.origin).toString();

  const nonce = generateNonce();
  const cookie = [
    `__Host-decap-oauth-nonce=${nonce}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=600",
  ].join("; ");

  const url = buildAuthorizeUrl({ clientId, scope, redirectUri, state: nonce });
  return new Response(null, {
    status: 302,
    headers: {
      Location: url,
      "Set-Cookie": cookie,
      "Cache-Control": "no-store",
    },
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
