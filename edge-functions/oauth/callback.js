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

  const clientId = getEnv(env, "OAUTH_GITHUB_CLIENT_ID");
  const clientSecret = getEnv(env, "OAUTH_GITHUB_CLIENT_SECRET");
  const repoId = getEnv(env, "OAUTH_GITHUB_REPO_ID");

  if (!clientId || !clientSecret) {
    return new Response("Missing OAuth env vars", { status: 500 });
  }

  if (!code) {
    return new Response("Missing code", { status: 400 });
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

    const html = `<!doctype html>
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
      window.opener.postMessage('authorizing:${content.provider}', '*');
    </script>
  </body>
</html>`;

    return htmlResponse(html);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return htmlResponse(`OAuth error: ${msg}`, 500);
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
