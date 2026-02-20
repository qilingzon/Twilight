function getEnv(env, key) {
  if (env && typeof env === "object" && key in env) return env[key];
  if (typeof process !== "undefined" && process?.env) return process.env[key];
  return undefined;
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlEncodeString(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlDecodeToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

async function issueAuthToken({ secret, ttlSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ v: 1, iat: now, exp: now + ttlSeconds });
  const payloadB64 = base64UrlEncodeString(payload);
  const sigBytes = await hmacSha256(secret, payloadB64);
  const sigB64 = base64UrlEncodeBytes(sigBytes);
  return `${payloadB64}.${sigB64}`;
}

function loginPage({ error } = {}) {
  const errorHtml = error ? `<p style="color: #b91c1c;">${error}</p>` : "";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 24px;">
    <h2 style="margin: 0 0 12px;">Decap 登录</h2>
    <p style="margin: 0 0 12px; color: #6b7280;">由于当前网络无法访问 GitHub，本登录使用站点密码授权。</p>
    ${errorHtml}
    <form method="POST">
      <label style="display:block; margin-bottom: 8px;">密码</label>
      <input name="password" type="password" autocomplete="current-password" style="padding: 10px; width: min(360px, 100%);" />
      <div style="margin-top: 12px;">
        <button type="submit" style="padding: 10px 14px;">登录</button>
      </div>
    </form>
  </body>
</html>`;
}

function successHandshakePage({ provider, token }) {
  const content = {
    token,
    provider,
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorizing…</title>
  </head>
  <body>
    <script>
      const receiveMessage = (message) => {
        try {
          window.opener.postMessage(
            'authorization:${content.provider}:success:${JSON.stringify(content)}',
            message.origin
          );
        } finally {
          window.removeEventListener('message', receiveMessage, false);
          window.close();
        }
      };

      window.addEventListener('message', receiveMessage, false);
      window.opener && window.opener.postMessage('authorizing:${content.provider}', '*');
    </script>
  </body>
</html>`;
}

async function readPasswordFromRequest(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const body = await request.text();
    const params = new URLSearchParams(body);
    return params.get("password") || "";
  }
  if (contentType.includes("application/json")) {
    const json = await request.json().catch(() => null);
    return (json && typeof json.password === "string" ? json.password : "") || "";
  }
  return "";
}

async function handle(request, env) {
  const adminPassword = getEnv(env, "CMS_ADMIN_PASSWORD");
  const authSecret = getEnv(env, "CMS_AUTH_SECRET");

  if (!adminPassword || !authSecret) {
    return new Response(
      "Missing env vars: CMS_ADMIN_PASSWORD and/or CMS_AUTH_SECRET",
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (request.method === "GET") {
    return htmlResponse(loginPage());
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const password = await readPasswordFromRequest(request);
  if (!password || password !== adminPassword) {
    return htmlResponse(loginPage({ error: "密码错误" }), 401);
  }

  const token = await issueAuthToken({ secret: authSecret, ttlSeconds: 60 * 60 * 12 });
  return htmlResponse(successHandshakePage({ provider: "github", token }));
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
