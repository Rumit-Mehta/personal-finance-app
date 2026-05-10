import { downloadSpreadsheetTemplate } from "./data/createSpreadsheetTemplate";

function App() {
  return (
    <button onClick={() => downloadSpreadsheetTemplate("Rumit Mehta")}>
      Download template
    </button>
  );
}

export default App;
