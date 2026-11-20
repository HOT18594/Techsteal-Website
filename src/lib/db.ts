import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

/**
 * ---------------------------------------------------------------------------
 * Pipelining guard (why this file is not a one-liner)
 * ---------------------------------------------------------------------------
 * postgres.js will happily reuse a connection that already has a query in
 * flight ("pipelining") whenever every pooled connection is busy. That is a
 * feature for plain Postgres, but Supabase's TRANSACTION pooler (port 6543)
 * does not answer pipelined queries: the extra query is written to the socket
 * and no response ever comes back, so the request hangs until an upstream
 * timeout (measured 60-90s; every DB-backed route could stall and multiple
 * concurrent visitors made it frequent).
 *
 * Reproduced deterministically outside the app with this exact pool config:
 * `max: 3` + 4 concurrent queries hangs on the second round forever, while the
 * same concurrency with `max: 10` (one connection per query) is clean. The
 * session pooler (5432) also tolerates pipelining, but it caps the whole
 * project at ~15 server sessions and was the original source of the
 * EMAXCONNSESSION outages — so the fix is to keep the recommended transaction
 * pooler and never pipeline.
 *
 * Every statement (and every transaction, which reserves one connection and
 * must keep it for its whole life) is therefore gated per server process to at
 * most POOL_MAX wire users. That is exactly the pool size, so postgres.js
 * always has a free connection to hand out and never pipelines — while still
 * allowing several queries to run in parallel instead of one global mutex.
 */
type RawSql = ReturnType<typeof postgres>;
type QueryMode = "plain" | "values" | "raw";

/** Connections in the pool — also the maximum number of concurrent wire users. */
const POOL_MAX = 3;

/** The lazy query surface drizzle's postgres-js driver actually uses. */
interface SerializedQuery extends PromiseLike<unknown> {
  values(): SerializedQuery;
  raw(): SerializedQuery;
}

/** Loosely-typed view of a postgres.js query so mode changes don't fight TS. */
interface LooseQuery extends PromiseLike<unknown> {
  values(): LooseQuery;
  raw(): LooseQuery;
}

type Gate = <T>(run: () => PromiseLike<T> | T) => Promise<T>;

/**
 * Counting semaphore with `size` slots. FIFO, failure-proof, and releases in a
 * `finally` so a rejected query can never permanently eat a slot.
 */
function createGate(size: number): Gate {
  let active = 0;
  const waiting: Array<() => void> = [];
  const acquire = (): Promise<void> => {
    if (active < size) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      waiting.push(() => {
        active += 1;
        resolve();
      });
    });
  };
  const release = (): void => {
    active = Math.max(0, active - 1);
    waiting.shift()?.();
  };
  return <T>(run: () => PromiseLike<T> | T): Promise<T> =>
    acquire().then(async () => {
      try {
        return await run();
      } finally {
        release();
      }
    });
}

/**
 * Lazy query wrapper mirroring postgres.js's own thenable: `.values()`/`.raw()`
 * are recorded until the query is awaited, then it is created and awaited
 * inside a gate slot.
 */
function gatedQuery(
  start: (mode: QueryMode) => PromiseLike<unknown>,
  gate: Gate
): SerializedQuery {
  let mode: QueryMode = "plain";
  let pending: Promise<unknown> | null = null;
  const execute = (): Promise<unknown> => {
    if (!pending) {
      pending = gate(async () => await start(mode));
    }
    return pending;
  };
  const wrapper: SerializedQuery = {
    values() {
      mode = "values";
      return wrapper;
    },
    raw() {
      mode = "raw";
      return wrapper;
    },
    then(onFulfilled, onRejected) {
      return execute().then(onFulfilled, onRejected);
    },
  };
  return wrapper as SerializedQuery;
}

/** Wrap a raw postgres.js client so it can never pipeline onto a busy socket. */
function createGuardedClient(client: RawSql): RawSql {
  const gate = createGate(POOL_MAX);

  const unsafe = (
    query: string,
    params: unknown[] = [],
    options?: Record<string, unknown>
  ): SerializedQuery =>
    gatedQuery((mode) => {
      let result = client.unsafe(query, params as never, options as never) as unknown as LooseQuery;
      if (mode === "values") result = result.values();
      else if (mode === "raw") result = result.raw();
      return result;
    }, gate);

  const begin = (...args: unknown[]): Promise<unknown> =>
    // A transaction reserves one connection and must keep it for its whole
    // life, so its gate slot is held until COMMIT/ROLLBACK.
    gate(() =>
      (client.begin as unknown as (...beginArgs: unknown[]) => Promise<unknown>)(...args)
    );

  const tagged = (strings: TemplateStringsArray, ...args: unknown[]): SerializedQuery =>
    gatedQuery((mode) => {
      let result = (client as unknown as (...callArgs: unknown[]) => unknown)(
        strings,
        ...args
      ) as LooseQuery;
      if (mode === "values") result = result.values();
      else if (mode === "raw") result = result.raw();
      return result;
    }, gate);

  return new Proxy(client, {
    apply(_target, _thisArg, argArray) {
      const [strings, ...args] = argArray as [TemplateStringsArray, ...unknown[]];
      return tagged(strings, ...args);
    },
    get(target, prop, receiver) {
      if (prop === "unsafe") return unsafe;
      if (prop === "begin") return begin;
      const value = Reflect.get(target, prop, receiver) as unknown;
      // Bind helpers (end/json/array/...) so they keep their `this`.
      return typeof value === "function"
        ? (value as (...methodArgs: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as unknown as RawSql;
}

/**
 * Create a database client. Throws if no DATABASE_URL is available.
 * Used by the seed script and anything that requires a connection.
 *
 * Works with ANY Postgres — Supabase (recommended), Neon, RDS, local.
 * Set DATABASE_URL to your Supabase "Session pooler" or "Direct"
 * connection string. Example:
 *   postgresql://postgres.abcdefgh:[PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres
 *
 * `prepare: false` keeps the client compatible with Supabase's
 * connection pooler (transaction mode), which does not support
 * prepared statements.
 *
 * The client is cached at module level: on serverless platforms (Vercel)
 * the same warm instance serves many requests, and creating a fresh
 * `postgres()` client per request without ever calling `end()` would
 * leak connections until the pooler maxes out and the site goes down.
 */
// Cache on globalThis: Next.js dev hot-reload re-evaluates modules, so a
// plain module-level let would create a NEW postgres pool on every edit
// while the old one keeps its sockets open — until the pooler maxes out.
//
// Keyed by the resolved connection string: the cache used to be a single slot,
// so `createDb(otherUrl)` silently handed back the client for whatever URL got
// there first and connected to the wrong database (the seed script passes an
// explicit URL).
const g = globalThis as unknown as { __techstealDb?: Map<string, Db> };

/**
 * Route session-pooler URLs (port 5432) to Supabase's TRANSACTION pooler
 * (port 6543). The session pooler caps the whole project at ~15 server
 * sessions; a handful of warm serverless instances (each holding a small
 * pool) plus local dev exhausted it, and every DB call across the site
 * failed with EMAXCONNSESSION. The transaction pooler multiplexes many
 * clients over a few server sessions — it's what Supabase recommends for
 * serverless. prepare:false (below) keeps it compatible.
 */
function toTransactionPooler(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port !== "6543") {
      u.port = "6543";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

export function createDb(url = process.env.DATABASE_URL): Db {
  if (!url) throw new Error("DATABASE_URL is not set");
  const resolved = toTransactionPooler(url);
  const cache = (g.__techstealDb ??= new Map<string, Db>());
  const cached = cache.get(resolved);
  if (cached) return cached;
  const client = createGuardedClient(
    postgres(resolved, {
      // Required for the transaction pooler: it doesn't support session-level
      // prepared statements.
      prepare: false,
      max: POOL_MAX,
      idle_timeout: 20, // seconds — release the slot when an instance goes quiet
      max_lifetime: 60 * 5, // seconds — never hold a slot longer than 5 min
      connect_timeout: 10,
    })
  );
  const db = drizzle(client, { schema });
  cache.set(resolved, db);
  return db;
}

/**
 * Null-safe accessor for API routes.
 * Returns null when the database hasn't been configured yet — routes then
 * fall back to static placeholder content so the site still renders.
 */
export function getDb(): Db | null {
  return process.env.DATABASE_URL ? createDb() : null;
}
