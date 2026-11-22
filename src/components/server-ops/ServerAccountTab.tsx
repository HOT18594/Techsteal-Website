"use client";

import { EmptyState } from "@/components/EmptyState";
import type {
  ExarotonAccountInfo,
  ExarotonCreditPool,
  ExarotonServerFullInfo,
} from "@/lib/exaroton";

export function ServerAccountTab({
  configured,
  loading,
  account,
  pools,
  server,
  playerLists,
  onRefresh,
}: {
  configured: boolean;
  loading: boolean;
  account: ExarotonAccountInfo | null;
  pools: ExarotonCreditPool[];
  server: ExarotonServerFullInfo | null;
  playerLists: string[];
  onRefresh: () => Promise<void>;
}) {
  if (!configured) {
    return (
      <section className="admin-directory">
        <EmptyState
          className="admin-empty"
          icon="fa-plug-circle-xmark"
          title="Exaroton not connected"
          hint="Configure EXAROTON_TOKEN and EXAROTON_SERVER_ID to view account credits and host info."
        />
      </section>
    );
  }

  const totalPoolCredits = pools.reduce((acc, p) => acc + p.credits, 0);

  return (
    <div className="grid gap-4">
      <section className="admin-metrics" aria-label="Exaroton hosting credits">
        <div className="admin-metric">
          <span className="admin-metric-icon is-green">
            <i className="fa-solid fa-coins" aria-hidden="true" />
          </span>
          <div>
            <span>Account credits · {account?.name ?? "Exaroton"}</span>
            <strong>{loading ? "—" : (account?.credits ?? 0).toFixed(2)}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-icon is-blue">
            <i className="fa-solid fa-vault" aria-hidden="true" />
          </span>
          <div>
            <span>Credit pools ({pools.length})</span>
            <strong>{loading ? "—" : totalPoolCredits.toFixed(2)}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-icon is-purple">
            <i className="fa-solid fa-earth-americas" aria-hidden="true" />
          </span>
          <div>
            <span>Region</span>
            <strong>{loading ? "—" : server?.region ?? "Auto"}</strong>
          </div>
        </div>
        <div className="admin-metric">
          <span className="admin-metric-icon is-amber">
            <i className="fa-solid fa-server" aria-hidden="true" />
          </span>
          <div>
            <span>Server limit</span>
            <strong>{loading ? "—" : account?.maxServers ?? "—"}</strong>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="admin-directory lg:col-span-6">
          <div className="admin-directory-head">
            <div>
              <h2>Credit pools</h2>
              <p>Shared credit pools linked to this Exaroton account.</p>
            </div>
            <button
              type="button"
              className="admin-action-btn"
              onClick={() => void onRefresh()}
              disabled={loading}
            >
              <i className={`fa-solid fa-rotate ${loading ? "fa-spin" : ""}`} aria-hidden="true" /> Refresh
            </button>
          </div>
          {pools.length === 0 ? (
            <EmptyState
              className="admin-empty"
              icon="fa-vault"
              title="No shared credit pools"
              hint="This server is funded directly from the Exaroton account balance."
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {pools.map((pool) => (
                <div key={pool.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--fg)]">{pool.name}</span>
                      {pool.isOwner ? <span className="admin-pill is-accent">Owner</span> : null}
                    </div>
                    <p className="text-xs text-[var(--muted)] mt-0.5">
                      {pool.servers} server(s) · {pool.members} member(s) · Your share:{" "}
                      {Math.round(pool.ownShare * 100)}% ({pool.ownCredits.toFixed(2)} cr)
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[var(--fg)] tabular-nums">
                      {pool.credits.toFixed(2)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      Credits
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="admin-directory lg:col-span-6">
          <div className="admin-directory-head">
            <div>
              <h2>Exaroton host metadata</h2>
              <p>Live server details returned by the Exaroton v1 API.</p>
            </div>
          </div>
          <div className="p-5 grid gap-2.5 text-xs">
            {[
              { k: "Server name", v: server?.serverName ?? "—" },
              { k: "Exaroton ID", v: server?.id ?? "—" },
              { k: "Exaroton address", v: server?.address ?? "—" },
              {
                k: "Direct host : port",
                v: server?.host && server?.port ? `${server.host}:${server.port}` : "Offline / unassigned",
              },
              { k: "Software", v: `${server?.software ?? "—"} ${server?.version ?? ""}`.trim() },
              { k: "Status", v: server?.stateLabel ?? "—" },
              { k: "Shared access", v: server?.shared ? "Shared server" : "Owned server" },
              { k: "Player lists", v: playerLists.length ? playerLists.join(", ") : "—" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between gap-4 py-1.5 border-b border-[var(--border)] last:border-b-0"
              >
                <span className="text-[var(--muted)]">{row.k}</span>
                <span className="font-mono text-[var(--fg)] text-right truncate max-w-[65%]">
                  {row.v}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
