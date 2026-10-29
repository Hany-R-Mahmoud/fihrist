import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export function createAppAuth(pool: Pool, options: {
  baseURL: string;
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
}) {
  return betterAuth({
    appName: 'Fihrist',
    baseURL: options.baseURL,
    basePath: '/api/auth',
    secret: options.secret,
    trustedOrigins: [new URL(options.baseURL).origin],
    database: {
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      schemaName: 'neon_auth',
      transaction: true,
    },
    advanced: { database: { generateId: 'uuid' }, disableOriginCheck: false },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: { clientId: options.googleClientId, clientSecret: options.googleClientSecret },
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    // Match Neon's existing admin fields, including its ban checks.
    plugins: [admin()],
  });
}

let instance: ReturnType<typeof createAppAuth> | undefined;

export function appAuth() {
  if (instance) return instance;
  const { DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  if (!DATABASE_URL || !BETTER_AUTH_URL || !BETTER_AUTH_SECRET || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error('App authentication environment is required');
  }
  instance = createAppAuth(new Pool({ connectionString: DATABASE_URL, max: 3 }), {
    baseURL: BETTER_AUTH_URL,
    secret: BETTER_AUTH_SECRET,
    googleClientId: GOOGLE_CLIENT_ID,
    googleClientSecret: GOOGLE_CLIENT_SECRET,
  });
  return instance;
}
