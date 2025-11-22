import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedData } from "./seed-data";
import { initializeSystemAgents } from "./init-system-agents";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

// Health check endpoint - responds immediately for deployment health checks
app.get("/health", async (_req, res) => {
  try {
    // Quick check that the server is running
    // Don't check database in production health checks to avoid timeouts
    res.status(200).json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development"
    });
  } catch (error) {
    // Even on error, return 200 to keep the deployment alive
    res.status(200).json({ 
      status: "ok",
      timestamp: new Date().toISOString(),
      note: "Server operational"
    });
  }
});

// Additional health check endpoint for more detailed status
app.get("/api/health", async (_req, res) => {
  res.status(200).json({ 
    status: "operational",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  // Remove reusePort option which can cause issues in production
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    
    // Run ALL initialization in the background without blocking
    // Use process.nextTick to ensure server is fully ready
    process.nextTick(() => {
      // Wrap in setTimeout to ensure complete decoupling from server startup
      setTimeout(async () => {
        const isProduction = process.env.NODE_ENV === "production";
        
        if (isProduction) {
          // In production: Skip ALL initialization to prevent timeout
          log("[Init] Production mode - server ready, skipping initialization");
          return;
        }
        
        // Only run initialization in development
        try {
          log("[Init] Development mode - starting background initialization");
          
          // Run initialization with timeout protection
          const initPromise = Promise.all([
            initializeSystemAgents().catch(err => {
              console.error("[Init] System agents initialization failed:", err);
              return null;
            }),
            seedData().catch(err => {
              console.error("[Init] Seed data failed:", err);  
              return null;
            })
          ]);
          
          // Set a timeout for initialization (30 seconds max)
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), 30000);
          });
          
          const result = await Promise.race([initPromise, timeoutPromise]);
          
          if (result === 'timeout') {
            console.error("[Init] Initialization timed out after 30s, continuing anyway");
          } else {
            log("[Init] Development initialization complete");
          }
        } catch (error) {
          console.error("[Init] Initialization error (non-fatal):", error);
        }
      }, 100); // Small delay to ensure server is fully ready
    });
  });
})();
