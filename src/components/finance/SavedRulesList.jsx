import { formatRuleSummary } from "@/utils/importPreview";

export function SavedRulesList({ importRules }) {
  return (
    <div className="saved-rules">
      <h3>Reusable rules</h3>
      <ul>
        {importRules.map((rule) => (
          <li key={rule.id}>{formatRuleSummary(rule)}</li>
        ))}
      </ul>
    </div>
  );
}
