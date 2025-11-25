import { db } from "./db";

/**
 * Performs a simple database connectivity check
 * Returns true if database is accessible, false otherwise
 * This is separated to avoid blocking server startup
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    // Simple query that should always work
    const result = await db.execute('SELECT 1');
    return !!result;
  } catch (error) {
    console.error('[Health Check] Database connection failed:', error);
    return false;
  }
}

/**
 * Get server health status
 */
export function getServerHealth() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0"
  };
}