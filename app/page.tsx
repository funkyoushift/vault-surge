import { PrototypeShell } from "../components/prototype-shell";

type Surface = "config" | "session";

function parseSurface(value: string | string[] | undefined): Surface | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "config" || candidate === "session"
    ? candidate
    : undefined;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string | string[] }>;
}) {
  const requestedSurface = parseSurface((await searchParams).surface);
  return (
    <PrototypeShell
      initialSurface={requestedSurface ?? "config"}
      lockSurface={Boolean(requestedSurface)}
    />
  );
}
