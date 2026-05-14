import { monzoCsvAdapter } from "./monzoCsv.js";

const adapters = [monzoCsvAdapter];

export function findImportAdapter(parsedCsv) {
  return adapters.find((adapter) => adapter.detect(parsedCsv));
}

export function findImportAdapterById(adapterId) {
  return adapters.find((adapter) => adapter.id === adapterId);
}

export function listImportAdapters() {
  return [...adapters];
}

export { monzoCsvAdapter };
