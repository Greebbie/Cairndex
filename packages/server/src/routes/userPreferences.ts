import {
  DEFAULT_USER_PREFERENCES,
  readUserPreferences,
  UserPreferencesSchema,
  writeUserPreferences,
} from "@cairndex/core";
import type { FastifyInstance } from "fastify";

/**
 * User preferences are machine-scoped: they live at `~/.cairndex/preferences.yaml`
 * regardless of which project the GUI is currently looking at. Vault config (per-project)
 * takes precedence where keys overlap; this endpoint is purely the user's personal layer.
 */
export async function registerUserPreferencesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/user/preferences", async () => {
    const prefs = await readUserPreferences();
    return prefs;
  });

  app.put("/api/user/preferences", async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    // Accept partial updates — readUserPreferences supplies defaults for missing keys,
    // and writeUserPreferences merges with existing values before validating.
    const parsed = UserPreferencesSchema.partial().safeParse(body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid preferences",
        issues: parsed.error.issues,
      });
    }
    try {
      // Drop undefined keys before forwarding — exactOptionalPropertyTypes is strict
      // about the difference between "key absent" and "key explicitly undefined".
      const update: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) update[k] = v;
      }
      const written = await writeUserPreferences(update);
      return written;
    } catch (err) {
      app.log.error({ err }, "writeUserPreferences failed");
      return reply.code(500).send({ error: "could not persist preferences" });
    }
  });

  // Convenience: expose the defaults so the GUI can show them when no file exists yet.
  app.get("/api/user/preferences/defaults", async () => DEFAULT_USER_PREFERENCES);
}
