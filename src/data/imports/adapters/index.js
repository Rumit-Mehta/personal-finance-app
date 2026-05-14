import { monzoCsvAdapter } from "./monzoCsv.js";

const adapters = [monzoCsvAdapter];

/**
 * Finds the first registered adapter that can handle a parsed CSV file.
 */
export function findImportAdapter(parsedCsv) {
  return adapters.find((adapter) => adapter.detect(parsedCsv));
}

/**
 * Looks up a registered adapter by its stable adapter id.
 */
export function findImportAdapterById(adapterId) {
  return adapters.find((adapter) => adapter.id === adapterId);
}

/**
 * Returns a copy of all registered import adapters.
 */
export function listImportAdapters() {
  return [...adapters];
}

export { monzoCsvAdapter };
