function getEnv(env, key) {
  if (env && typeof env === "object" && key in env) return env[key];
  if (typeof process !== "undefined" && process?.env) return process.env[key];
  return undefined;
}

function buildAuthorizeUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "repo,user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

async function handle(request, env) {
  const clientId = getEnv(env, "OAUTH_GITHUB_CLIENT_ID");
  if (!clientId) {
    return new Response("Missing OAUTH_GITHUB_CLIENT_ID", { status: 500 });
  }

  const url = buildAuthorizeUrl(clientId);
  return Response.redirect(url, 302);
}

export async function onRequest(context) {
  return handle(context.request, context.env);
}

export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
