import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

if (process.env.NODE_ENV === "development") {
  // Node 22+ has a global WebSocket; the driver only needs a hint in dev on older runtimes.
  neonConfig.webSocketConstructor ??= globalThis.WebSocket;
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = new Pool({ connectionString: url });

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;
export { schema };
