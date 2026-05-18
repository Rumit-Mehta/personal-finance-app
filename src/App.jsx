import { FinanceDashboard } from "@/components/finance/FinanceDashboard";
import { AppMenu } from "@/components/navigation/AppMenu";
import { useFinanceWorkspace } from "@/hooks/useFinanceWorkspace";
import { useLocalProfileSession } from "@/hooks/useLocalProfileSession";
import { DataExplorerPage } from "@/pages/DataExplorerPage";
import { ProfilePage } from "@/pages/ProfilePage";

function App() {
  const workspace = useFinanceWorkspace();
  const profileSession = useLocalProfileSession();

  return (
    <main>
      <AppMenu
        activeView={profileSession.activeView}
        onData={profileSession.openData}
        onDashboard={profileSession.openDashboard}
        onProfile={profileSession.openProfile}
        profile={profileSession.profile}
        profileComplete={profileSession.profileComplete}
      />

      {profileSession.activeView === "profile" ? (
        <ProfilePage
          onSave={profileSession.saveProfile}
          profile={profileSession.profile}
          saveError={profileSession.storageError}
        />
      ) : profileSession.activeView === "data" ? (
        <DataExplorerPage
          financeData={workspace.currentFinanceData}
          importPreview={workspace.importPreview}
          onDashboard={profileSession.openDashboard}
        />
      ) : (
        <FinanceDashboard
          profileName={profileSession.profile.name}
          workspace={workspace}
        />
      )}
    </main>
  );
}

export default App;
