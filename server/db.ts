import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@shared/schema';

// Lazy database initialization - don't connect at import time
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    // Check DATABASE_URL when first needed, not at import time
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is not set - using in-memory fallback");
      // In production, we might want to throw here, but for now let's fail gracefully
      // This allows the server to start even without a database
      throw new Error("DATABASE_URL is required for database operations");
    }
    
    try {
      // Use HTTP-based connection (no WebSocket needed)
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql, { schema });
      console.log("[DB] Database connection initialized");
    } catch (error) {
      console.error("[DB] Failed to initialize database:", error);
      throw error;
    }
  }
  return _db;
}

// Export a getter for backward compatibility
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const database = getDb();
    return database[prop as keyof typeof database];
  }
});
