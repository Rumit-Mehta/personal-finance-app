import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createPfaVault } from "../../../src/data/vault/index.js";
import { monzoJsonToFinanceData } from "../../../src/data/vault/adapters/monzo.js";
import { hashInput } from "../../../src/data/vault/hash.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultInputPath = path.join(moduleDir, "data", "monzo-data.json");
const defaultOutputPath = path.join(moduleDir, "data", "monzo-data.pfa");
const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input || defaultInputPath);
const outputPath = path.resolve(args.output || defaultOutputPath);
const password = process.env.PFA_PASSWORD;

if (!password) {
  throw new Error("Set PFA_PASSWORD before running `npm run monzo:pfa`.");
}

const monzoJsonBytes = await fs.readFile(inputPath);
const monzoData = JSON.parse(new TextDecoder().decode(monzoJsonBytes));
const financeData = monzoJsonToFinanceData(monzoData, {
  fileHash: await hashInput(monzoJsonBytes),
  fileName: path.basename(inputPath),
});
const pfaBuffer = await createPfaVault(financeData, password);

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, Buffer.from(pfaBuffer));

console.log(`Wrote encrypted PFA vault to ${outputPath}`);

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--input") {
      parsed.input = next;
      index += 1;
    } else if (arg === "--output") {
      parsed.output = next;
      index += 1;
    }
  }

  return parsed;
}
