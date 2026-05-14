const EDITABLE_FIELDS = new Set(["category", "tag", "merchant", "notes"]);
const MATCH_OPERATORS = new Set(["equals", "contains", "startsWith", "wildcard"]);

export function applyImportRules(stagedBatch, rules = []) {
  const applicableRules = normalizeImportRules(rules)
    .filter((rule) => rule.enabled)
    .filter((rule) => ruleAppliesToBatch(rule, stagedBatch));

  return {
    ...stagedBatch,
    rows: stagedBatch.rows.map((row) => applyRulesToRow(row, applicableRules)),
  };
}

export function normalizeImportRules(rules = []) {
  return rules
    .map((rule, index) => normalizeImportRule(rule, index))
    .sort((left, right) => left.order - right.order);
}

export function normalizeImportRule(rule = {}, index = 0) {
  const match = rule.match ?? {};
  const set = rule.set ?? {};
  const normalizedSet = {};

  EDITABLE_FIELDS.forEach((field) => {
    if (set[field] !== undefined) {
      normalizedSet[field] = text(set[field]);
    }
  });

  return {
    id: text(rule.id) || createRuleId(),
    name: text(rule.name),
    enabled: rule.enabled !== false,
    sourceType: text(rule.sourceType),
    sourceProvider: text(rule.sourceProvider),
    order: Number.isFinite(Number(rule.order)) ? Number(rule.order) : index,
    match: {
      field: text(match.field),
      operator: MATCH_OPERATORS.has(match.operator) ? match.operator : "contains",
      value: text(match.value),
    },
    set: normalizedSet,
  };
}

export function createImportRule({
  name = "",
  enabled = true,
  sourceType = "",
  sourceProvider = "",
  order = 0,
  match,
  set,
} = {}) {
  return normalizeImportRule({
    id: createRuleId(),
    name,
    enabled,
    sourceType,
    sourceProvider,
    order,
    match,
    set,
  });
}

export function importRuleMatchesRow(rule, row) {
  const normalizedRule = normalizeImportRule(rule);
  const fieldValue = text(row[normalizedRule.match.field]).toLowerCase();
  const matchValue = normalizedRule.match.value.toLowerCase();

  if (!normalizedRule.match.field || !matchValue) {
    return false;
  }

  if (normalizedRule.match.operator === "equals") {
    return fieldValue === matchValue;
  }

  if (normalizedRule.match.operator === "startsWith") {
    return fieldValue.startsWith(matchValue);
  }

  if (normalizedRule.match.operator === "wildcard") {
    return wildcardToRegExp(matchValue).test(fieldValue);
  }

  return fieldValue.includes(matchValue);
}

export function countImportRuleMatches(batch, rule) {
  if (!batch) {
    return 0;
  }

  const normalizedRule = normalizeImportRule(rule);

  return batch.rows.filter((row) => importRuleMatchesRow(normalizedRule, row)).length;
}

function applyRulesToRow(row, rules) {
  let nextRow = {
    ...row,
    appliedRuleIds: [...(row.appliedRuleIds ?? [])],
  };

  rules.forEach((rule) => {
    if (!importRuleMatchesRow(rule, nextRow)) {
      return;
    }

    nextRow = {
      ...nextRow,
      ...rule.set,
      appliedRuleIds: [...nextRow.appliedRuleIds, rule.id],
    };
  });

  return nextRow;
}

function ruleAppliesToBatch(rule, batch) {
  if (rule.sourceType && rule.sourceType !== batch.sourceType) {
    return false;
  }

  if (rule.sourceProvider && rule.sourceProvider !== batch.sourceProvider) {
    return false;
  }

  return true;
}

function wildcardToRegExp(value) {
  const escaped = value
    .split("*")
    .map((part) => part.replace(/[\\^$+?.()|[\]{}]/gu, "\\$&"))
    .join(".*");

  return new RegExp(`^${escaped}$`, "iu");
}

function createRuleId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function text(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
