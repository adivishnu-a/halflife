import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

if (process.env.NODE_ENV === "development") {
  // Node 22+ has a global WebSocket; the driver only needs a hint in dev on older runtimes.
  neonConfig.webSocketConstructor ??= globalThis.WebSocket;
}

// The pool connects on the first query, not here, so `next build` runs without a
// database. A missing URL then fails at the first query with a clear connection error.
const url = process.env.DATABASE_URL;
if (!url && process.env.NEXT_PHASE !== "phase-production-build") {
  console.warn("[db] DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: url ?? "postgres://unset:unset@127.0.0.1:1/unset" });

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export { schema };
