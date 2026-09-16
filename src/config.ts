const localDatabaseUrl = "postgres://orchestra:change-me-local@localhost:5432/orchestra";

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DATABASE_URL?.trim();
  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL must be set in production");
    }
    return localDatabaseUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// scheme");
  }
  return configured;
}

export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string | readonly string[] | null {
  const configured = env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured?.length) {
    return configured.length === 1 ? configured[0]! : configured;
  }
  return env.NODE_ENV === "production" ? null : "*";
}

type CorsHeaders = { "access-control-allow-origin"?: string };

export function corsHeaders(
  request: Request,
  env: NodeJS.ProcessEnv = process.env,
): CorsHeaders {
  const origin = request.headers.get("origin");
  const allowed = corsOrigins(env);
  if (!origin || allowed === null) return {};
  if (allowed === "*" || (Array.isArray(allowed) && allowed.includes(origin)) || allowed === origin) {
    return { "access-control-allow-origin": allowed === "*" ? "*" : origin };
  }
  return {};
}
