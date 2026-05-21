import { AccountsTable } from "@/components/finance/AccountsTable";
import { BalanceSnapshotsSection } from "@/components/finance/BalanceSnapshotsSection";
import { ChartsSection } from "@/components/finance/ChartsSection";
import { DashboardHeader } from "@/components/finance/DashboardHeader";
import { FileActions } from "@/components/finance/FileActions";
import { ImportPreviewSection } from "@/components/finance/ImportPreviewSection";
import { StatusMessages } from "@/components/finance/StatusMessages";
import { TransactionsPreviewTable } from "@/components/finance/TransactionsPreviewTable";
import { UserSummarySection } from "@/components/finance/UserSummarySection";

export function FinanceDashboard({ profileName, workspace }) {
  return (
    <>
      <DashboardHeader
        onThemeToggle={workspace.handleThemeToggle}
        parsedData={workspace.parsedData}
        profileName={profileName}
        theme={workspace.theme}
      />

      <FileActions
        importInputRef={workspace.importInputRef}
        onDownloadExcel={workspace.handleDownloadExcel}
        onDownloadPfa={workspace.handleDownloadPfa}
        onImportFileChange={workspace.handleImportFileChange}
        onPfaFileChange={workspace.handlePfaFileChange}
        onVaultPasswordChange={workspace.handleVaultPasswordChange}
        parsedData={workspace.parsedData}
        pfaInputRef={workspace.pfaInputRef}
        vaultPasswordInputRef={workspace.vaultPasswordInputRef}
      />

      <ChartsSection
        institutionNetWorthStackSeries={workspace.institutionNetWorthStackSeries}
      />

      <StatusMessages error={workspace.error} message={workspace.message} />

      {workspace.importPreview && (
        <ImportPreviewSection
          bulkRuleMatchCount={workspace.bulkRuleMatchCount}
          categorySuggestions={workspace.categorySuggestions}
          importAccountMode={workspace.importAccountMode}
          importAccountOptions={workspace.importAccountOptions}
          importPreview={workspace.importPreview}
          importPreviewAccountNames={workspace.importPreviewAccountNames}
          importRules={workspace.importRules}
          newAccountDraft={workspace.newAccountDraft}
          onApplyDraftRule={workspace.handleApplyDraftRule}
          onImportAccountModeChange={workspace.handleImportAccountModeChange}
          onNewAccountDraftChange={workspace.handleNewAccountDraftChange}
          onPreviewFieldChange={workspace.handlePreviewFieldChange}
          onSaveDraftRule={workspace.handleSaveDraftRule}
          onSaveImportPreview={workspace.handleSaveImportPreview}
          onSelectedImportAccountChange={
            workspace.handleSelectedImportAccountChange
          }
          ruleDraft={workspace.ruleDraft}
          selectedImportAccountId={workspace.selectedImportAccountId}
        />
      )}

      {workspace.parsedData && (
        <>
          <UserSummarySection
            importRules={workspace.importRules}
            parsedData={workspace.parsedData}
          />
          <AccountsTable
            accountNames={workspace.accountNames}
            accounts={workspace.accounts}
          />
          <BalanceSnapshotsSection
            accountNames={workspace.accountNames}
            accounts={workspace.accounts}
            balanceSnapshotDraft={workspace.balanceSnapshotDraft}
            balanceSnapshots={workspace.balanceSnapshots}
            onBalanceSnapshotDraftChange={
              workspace.handleBalanceSnapshotDraftChange
            }
            onSaveBalanceSnapshot={workspace.handleSaveBalanceSnapshot}
          />
          <TransactionsPreviewTable transactions={workspace.transactions} />
        </>
      )}
    </>
  );
}
