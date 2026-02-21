function getEnv(env, key) {
  if (env && typeof env === "object" && key in env) return env[key];
  if (typeof process !== "undefined" && process?.env) return process.env[key];
  return undefined;
}

function isValidGithubClientId(clientId) {
  return typeof clientId === "string" && /^[A-Za-z0-9]+$/.test(clientId);
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

function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const parts = cookie.split(/;\s*/g);
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return part.slice(idx + 1);
  }
  return "";
}

function clearNonceCookie() {
  return [
    "__Host-decap-oauth-nonce=",
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

async function exchangeCodeForToken({ code, clientId, clientSecret, repoId }) {
  const payload = {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    ...(repoId ? { repository_id: repoId } : {}),
  };

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed: ${response.status}`);
  }

  const body = await response.json();
  if (!body?.access_token) {
    throw new Error("GitHub did not return access_token");
  }

  return body.access_token;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const clientId = getEnv(env, "OAUTH_GITHUB_CLIENT_ID");
  const clientSecret = getEnv(env, "OAUTH_GITHUB_CLIENT_SECRET");
  const repoId = getEnv(env, "OAUTH_GITHUB_REPO_ID");

  if (!clientId || !clientSecret) {
    return new Response("Missing OAuth env vars: OAUTH_GITHUB_CLIENT_ID and/or OAUTH_GITHUB_CLIENT_SECRET", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!isValidGithubClientId(clientId)) {
    return new Response("Invalid OAUTH_GITHUB_CLIENT_ID (must be alphanumeric)", {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  const expectedNonce = getCookie(request, "__Host-decap-oauth-nonce");
  if (!state || !expectedNonce || state !== expectedNonce) {
    return new Response("Invalid state", {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": clearNonceCookie(),
      },
    });
  }

  try {
    const token = await exchangeCodeForToken({
      code,
      clientId,
      clientSecret,
      repoId,
    });

    const content = {
      token,
      provider: "github",
    };

    const allowedOrigin = url.origin;
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorizing…</title>
  </head>
  <body>
    <script>
      const allowedOrigin = ${JSON.stringify(allowedOrigin)};
      const receiveMessage = (message) => {
        if (!message || message.origin !== allowedOrigin) return;
        try {
          window.opener.postMessage(
            'authorization:${content.provider}:success:${JSON.stringify(content)}',
            allowedOrigin
          );
        } finally {
          window.removeEventListener('message', receiveMessage, false);
          window.close();
        }
      };

      window.addEventListener('message', receiveMessage, false);
      if (window.opener) {
        window.opener.postMessage('authorizing:${content.provider}', allowedOrigin);
      }
    </script>
  </body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": clearNonceCookie(),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`OAuth error: ${msg}`, {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": clearNonceCookie(),
      },
    });
  }
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
