import { useHealthCheck } from "./features/health/health.api";

function App() {
  const { data, isPending, isError } = useHealthCheck();

  return (
    <main>
      <h1>VerifyAddress NG</h1>
      <p>Verify. Trust. Connect.</p>

      <h2>Backend Status</h2>

      {isPending && <p>Checking backend...</p>}
      {isError && <p>Backend connection failed.</p>}
      {data && <p>{data.message}</p>}
    </main>
  );
}

export default App;