import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
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

// ========== CRITICAL: Health check MUST be registered FIRST ==========
// These routes respond BEFORE any other middleware to ensure fastest response
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});

// Now register body parsers and other middleware
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false }));

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

// Determine environment
const isProduction = process.env.NODE_ENV === "production";
const port = parseInt(process.env.PORT || '5000', 10);

// ========== CRITICAL: Create HTTP server and start listening IMMEDIATELY ==========
// This ensures health checks can be answered within Replit's 5-second window
const httpServer = createServer(app);

// Start listening BEFORE any async initialization
httpServer.listen(port, "0.0.0.0", () => {
  log(`Server listening on 0.0.0.0:${port} (${isProduction ? 'production' : 'development'} mode)`);
  log(`Health check available at /health`);
});

// ========== ASYNC INITIALIZATION (runs AFTER server is already listening) ==========
(async () => {
  try {
    // Register all routes (this attaches to the already-running server)
    await registerRoutes(app, httpServer);
    log("[Init] Routes registered");

    // Error handler - don't throw to prevent crashes
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("[Error]", message);
      res.status(status).json({ message });
    });

    // Setup Vite for development, static serving for production
    if (!isProduction) {
      await setupVite(app, httpServer);
      log("[Init] Vite dev server ready");
    } else {
      serveStatic(app);
      log("[Init] Static files configured");
    }

    // Background initialization - runs after everything else is ready
    if (!isProduction) {
      // Use setImmediate to ensure this runs after current event loop
      setImmediate(async () => {
        try {
          log("[Init] Starting background initialization...");
          await Promise.all([
            initializeSystemAgents().catch(err => {
              console.error("[Init] System agents failed:", err);
            }),
            seedData().catch(err => {
              console.error("[Init] Seed data failed:", err);
            })
          ]);
          log("[Init] Background initialization complete");
        } catch (error) {
          console.error("[Init] Initialization error:", error);
        }
      });
    }
  } catch (error) {
    console.error("[Fatal] Server initialization failed:", error);
    // Don't exit - keep health checks responding
  }
})();
