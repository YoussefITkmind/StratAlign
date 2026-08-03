import { getHealthStatus } from "@/services/health.service";

export const dynamic = "force-dynamic";

function StatusItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const connected = value === "connected" || value === "running";

  return (
    <li>
      <strong>{label}:</strong>{" "}
      <span style={{ color: connected ? "green" : "crimson" }}>
        {value}
      </span>
    </li>
  );
}

export default async function HomePage() {
  const health = await getHealthStatus();

  return (
    <main>
      <section>
        <h1>Strategic Performance Management</h1>
        <p>Platform foundation status:</p>

        <ul>
          <StatusItem label="Frontend" value="running" />
          <StatusItem
            label="Backend"
            value={health?.status === "ok" ? "running" : "unavailable"}
          />
          <StatusItem
            label="Database"
            value={health?.database ?? "unavailable"}
          />
          <StatusItem
            label="Redis"
            value={health?.redis ?? "unavailable"}
          />
        </ul>
      </section>
    </main>
  );
}