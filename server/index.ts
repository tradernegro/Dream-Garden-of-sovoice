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

// Health check endpoint - responds immediately without any complexity
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// Additional health check endpoint
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
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

// Determine environment
const isProduction = process.env.NODE_ENV === "production";
const port = parseInt(process.env.PORT || '5000', 10);

// Start server synchronously first, then do async setup
(async () => {
  const server = await registerRoutes(app);

  // Error handler - don't throw to prevent crashes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    console.error("[Error]", message);
    res.status(status).json({ message });
  });

  // Setup Vite for development, static serving for production
  if (!isProduction) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start server - this must happen quickly for health checks
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port} (${isProduction ? 'production' : 'development'} mode)`);
  });

  // Background initialization - only in development, completely skipped in production
  if (!isProduction) {
    setTimeout(async () => {
      try {
        log("[Init] Development mode - starting background initialization");
        await Promise.all([
          initializeSystemAgents().catch(err => {
            console.error("[Init] System agents failed:", err);
          }),
          seedData().catch(err => {
            console.error("[Init] Seed data failed:", err);
          })
        ]);
        log("[Init] Development initialization complete");
      } catch (error) {
        console.error("[Init] Initialization error:", error);
      }
    }, 100);
  }
})();
