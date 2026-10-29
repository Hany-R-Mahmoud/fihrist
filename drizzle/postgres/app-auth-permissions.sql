-- Run as the database owner when enabling app-hosted Google OAuth.
-- Reuse existing Neon Auth tables and user IDs without granting schema creation.
GRANT USAGE ON SCHEMA neon_auth TO fihrist_web_prod;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON neon_auth."user", neon_auth.session, neon_auth.account, neon_auth.verification
  TO fihrist_web_prod;
