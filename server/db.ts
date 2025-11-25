import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@shared/schema';

// Type alias for database
type DbType = ReturnType<typeof drizzle>;

// Lazy database initialization - don't connect at import time
let _db: DbType | null = null;
let _connectionPromise: Promise<DbType | null> | null = null;

// Database connection timeout (5 seconds in production, 10 in development)
const DB_CONNECTION_TIMEOUT = process.env.NODE_ENV === 'production' ? 5000 : 10000;

export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      console.error("[DB] DATABASE_URL is not set");
      throw new Error("DATABASE_URL is required for database operations");
    }
    
    try {
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

// Async database initialization with timeout
export async function initDbWithTimeout(): Promise<DbType | null> {
  if (_db) return _db;
  
  if (_connectionPromise) {
    return _connectionPromise;
  }
  
  _connectionPromise = new Promise<DbType | null>(async (resolve) => {
    const timeoutId = setTimeout(() => {
      console.error(`[DB] Connection timeout after ${DB_CONNECTION_TIMEOUT}ms`);
      resolve(null);
    }, DB_CONNECTION_TIMEOUT);
    
    try {
      if (!process.env.DATABASE_URL) {
        console.error("[DB] DATABASE_URL is not set");
        clearTimeout(timeoutId);
        resolve(null);
        return;
      }
      
      const sql = neon(process.env.DATABASE_URL);
      _db = drizzle(sql, { schema });
      
      // Test the connection with a simple query
      try {
        await sql`SELECT 1`;
        console.log("[DB] Database connection verified");
      } catch (queryError) {
        console.warn("[DB] Connection test failed, but continuing:", queryError);
      }
      
      clearTimeout(timeoutId);
      resolve(_db);
    } catch (error) {
      console.error("[DB] Failed to initialize database:", error);
      clearTimeout(timeoutId);
      resolve(null);
    }
  });
  
  return _connectionPromise;
}

// Check if database is available
export function isDatabaseAvailable(): boolean {
  return _db !== null && process.env.DATABASE_URL !== undefined;
}

// Export a getter for backward compatibility
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(target, prop) {
    const database = getDb();
    return database[prop as keyof typeof database];
  }
});
