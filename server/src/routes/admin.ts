import { Router } from "express";
import { config } from "../config.js";
import { getAdminSnapshot } from "../realtime.js";

/**
 * Read-only monitoring endpoint for the admin dashboard. Gated by a shared
 * secret (ADMIN_API_KEY) rather than Entra ID because it has no relationship
 * to Azure resource access — it just exposes in-process counters.
 */
export function createAdminRouter() {
  const router = Router();

  router.use((request, response, next) => {
    const providedKey = request.header("x-admin-key");
    if (!config.adminApiKey || providedKey !== config.adminApiKey) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  router.get("/status", (_request, response) => {
    response.json(getAdminSnapshot());
  });

  return router;
}
