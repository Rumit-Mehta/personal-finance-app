import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const monzoDir = path.resolve(moduleDir, "..");

loadDotEnv(path.join(monzoDir, ".env"));

export const config = {
  apiBaseUrl: "https://api.monzo.com",
  authBaseUrl: "https://auth.monzo.com",
  clientId: process.env.MONZO_CLIENT_ID,
  clientSecret: process.env.MONZO_CLIENT_SECRET,
  redirectUri:
    process.env.MONZO_REDIRECT_URI || "http://localhost:4545/oauth/callback",
  port: Number(process.env.MONZO_PORT || 4545),
  tokenPath: resolveFromMonzoDir(
    process.env.MONZO_TOKEN_PATH || "./data/monzo-token.json",
  ),
  outputPath: resolveFromMonzoDir(
    process.env.MONZO_OUTPUT_PATH || "./data/monzo-data.json",
  ),
};

export function requireAuthConfig() {
  const missing = [];

  if (!config.clientId) {
    missing.push("MONZO_CLIENT_ID");
  }

  if (!config.clientSecret) {
    missing.push("MONZO_CLIENT_SECRET");
  }

  if (!config.redirectUri) {
    missing.push("MONZO_REDIRECT_URI");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing Monzo OAuth config: ${missing.join(", ")}. Copy integrations/banks/monzo/.env.example to integrations/banks/monzo/.env and fill it in.`,
    );
  }
}

function resolveFromMonzoDir(value) {
  return path.isAbsolute(value) ? value : path.resolve(monzoDir, value);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = stripQuotes(rawValue);

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
