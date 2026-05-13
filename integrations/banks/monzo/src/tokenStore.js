import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export async function readToken() {
  try {
    const tokenJson = await fs.readFile(config.tokenPath, "utf8");
    return JSON.parse(tokenJson);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeToken(token) {
  await fs.mkdir(path.dirname(config.tokenPath), { recursive: true });
  await fs.writeFile(config.tokenPath, `${JSON.stringify(token, null, 2)}\n`);
}

export async function clearToken() {
  try {
    await fs.unlink(config.tokenPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
