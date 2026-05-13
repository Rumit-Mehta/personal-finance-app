import crypto from "node:crypto";
import { config, requireAuthConfig } from "./config.js";
import { readToken, writeToken } from "./tokenStore.js";

export function createAuthorizationUrl({ state = crypto.randomUUID() } = {}) {
  requireAuthConfig();

  const url = new URL(`${config.authBaseUrl}/`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return { state, url: url.toString() };
}

export async function exchangeCodeForToken(code) {
  requireAuthConfig();

  const token = await tokenRequest({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  await writeToken(withExpiry(token));
  return token;
}

export async function getAccessToken() {
  const token = await readToken();

  if (!token) {
    throw new Error("No Monzo token found. Run `npm run monzo:auth` first.");
  }

  if (!isExpiring(token)) {
    return token.access_token;
  }

  if (!token.refresh_token) {
    throw new Error("Monzo token is expired and has no refresh_token.");
  }

  const refreshedToken = await refreshAccessToken(token.refresh_token);
  return refreshedToken.access_token;
}

export async function refreshAccessToken(refreshToken) {
  requireAuthConfig();

  const token = await tokenRequest({
    grant_type: "refresh_token",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: refreshToken,
  });

  const tokenToStore = withExpiry({
    ...token,
    refresh_token: token.refresh_token || refreshToken,
  });

  await writeToken(tokenToStore);
  return tokenToStore;
}

async function tokenRequest(params) {
  const response = await fetch(`${config.apiBaseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  const payload = await parseJson(response);

  if (!response.ok) {
    throw new Error(
      `Monzo OAuth request failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function withExpiry(token) {
  const expiresIn = Number(token.expires_in || 0);

  return {
    ...token,
    expires_at: expiresIn ? Date.now() + expiresIn * 1000 : null,
  };
}

function isExpiring(token) {
  if (!token.expires_at) {
    return false;
  }

  return Date.now() > Number(token.expires_at) - 60_000;
}

async function parseJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
