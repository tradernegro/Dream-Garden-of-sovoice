import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { seedData } from "./seed-data";
import { initializeSystemAgents } from "./init-system-agents";

function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

function serveStaticFiles(app: express.Express) {
  // Use process.cwd() instead of import.meta.dirname for bundled code compatibility
  // In production, the bundled code is in dist/, and static files are in dist/public/
  const distPath = path.resolve(process.cwd(), "dist", "public");
  if (!fs.existsSync(distPath)) {
    console.error(`[Error] Build directory not found: ${distPath}`);
    return;
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

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

// ========== CRITICAL: Configure static files IMMEDIATELY (synchronously) ==========
// This ensures the frontend is available right away, even before routes are registered
if (isProduction) {
  // Production: Serve static files immediately
  serveStaticFiles(app);
  log("[Init] Static files configured (production)");
}

// Error handler - register early to catch any errors
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  console.error("[Error]", message);
  res.status(status).json({ message });
});

// ========== ASYNC INITIALIZATION (runs AFTER server is already listening) ==========
// CRITICAL: Use setImmediate to ensure health check can respond FIRST
setImmediate(async () => {
  try {
    // Register routes in background - don't wait for completion
    // Routes will be available when ready, but server is already responding
    registerRoutes(app, httpServer).catch(err => {
      console.error("[Init] Route registration error (continuing):", err);
    });
    log("[Init] Route registration started in background");

    // Setup Vite for development only
    if (!isProduction) {
      try {
        // Dynamic import for development only
        const viteModule = await import("./vite");
        await viteModule.setupVite(app, httpServer);
        log("[Init] Vite dev server ready");
      } catch (err) {
        console.error("[Init] Failed to load Vite:", err);
        // Fallback to static serving if Vite fails
        serveStaticFiles(app);
        log("[Init] Static files configured (fallback)");
      }
    }

    // Background initialization - ONLY in development, NEVER in production
    if (!isProduction) {
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
    } else {
      log("[Init] Production mode - skipping seed data and system agents");
    }
  } catch (error) {
    console.error("[Fatal] Server initialization failed:", error);
    // Don't exit - keep health checks responding
  }
});
