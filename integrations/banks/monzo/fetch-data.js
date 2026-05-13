import process from "node:process";
import { config } from "./src/config.js";
import {
  fetchMonzoData,
  parseFetchArgs,
  writeMonzoData,
} from "./src/fetchData.js";

const options = parseFetchArgs(process.argv.slice(2));
const data = await fetchMonzoData(options);
const outputPath = await writeMonzoData(data, config.outputPath);

console.log(`Wrote Monzo data to ${outputPath}`);
console.log(
  `Fetched ${data.accounts.length} accounts and ${data.accounts.reduce(
    (count, account) => count + account.transactions.length,
    0,
  )} transactions.`,
);
