import type { Route } from "./+types/home";
import { useState, type FormEvent } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Investor ETF Tracker" },
    {
      name: "description",
      content: "Track ETFs you already have or want to buy.",
    },
  ];
}

type EtfStatus = "have" | "want_to_buy";

type EtfEntry = {
  name: string;
  status: EtfStatus;
};

export default function Home() {
  const [etfName, setEtfName] = useState("");
  const [status, setStatus] = useState<EtfStatus>("have");
  const [entries, setEntries] = useState<EtfEntry[]>([]);

  function handleAddEtf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = etfName.trim();

    if (!trimmedName) return;

    setEntries((previousEntries) => [
      { name: trimmedName, status },
      ...previousEntries,
    ]);
    setEtfName("");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">AI Investor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add ETFs you have now or want to buy.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleAddEtf}>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="etf-name">
              ETF Name
            </label>
            <input
              id="etf-name"
              name="etfName"
              type="text"
              placeholder="e.g. VTI"
              value={etfName}
              onChange={(event) => setEtfName(event.currentTarget.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-300 transition focus:ring-2"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="etf-status">
              Status
            </label>
            <select
              id="etf-status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.currentTarget.value as EtfStatus)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-slate-300 transition focus:ring-2"
            >
              <option value="have">Have</option>
              <option value="want_to_buy">Want to Buy</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Add ETF
          </button>
        </form>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            ETF List
          </h2>
          {entries.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No ETFs added yet. Use the form above to add your first ETF.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {entries.map((entry, index) => (
                <li
                  key={`${entry.name}-${entry.status}-${index}`}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{entry.name}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {entry.status === "have" ? "Have" : "Want to Buy"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}
