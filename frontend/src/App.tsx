import { useEffect, useState } from "react";
import { checkBackend } from "./services/api";

function App() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {
    checkBackend()
      .then(() => {
        setStatus("Backend connected successfully!");
      })
      .catch(() => {
        setStatus("Backend connection failed.");
      });
  }, []);

  return (
    <main>
      <h1>VerifyAddress NG</h1>
      <p>Verify. Trust. Connect.</p>

      <h2>Backend Status</h2>
      <p>{status}</p>
    </main>
  );
}

export default App;
