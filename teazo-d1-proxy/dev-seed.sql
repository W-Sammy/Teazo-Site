-- LOCAL DEVELOPMENT ONLY. This is not a migration and must never become one:
-- it is applied by `npm run db:seed:dev`, which is hard-wired to --local.
--
-- It gives you an Owner account and a signed-in session, so you can open
-- /admin on your machine before Google sign-in exists. Run it after a reset,
-- then set this cookie in your browser for http://localhost:3000:
--
--     name:  teazo_session
--     value: local-dev-session
--
-- admin_session.id stores the SHA-256 of the cookie value, never the value
-- itself, exactly as real sessions will.

INSERT OR IGNORE INTO admin_user (id, email, email_normalized, display_name, role_id)
VALUES ('local-dev-owner', 'dev@teazo.local', 'dev@teazo.local', 'Local Dev Owner', 1);

INSERT OR REPLACE INTO admin_session (id, admin_user_id, expires_at)
VALUES ('69795db1e1a8a8b7393d059493c1879b75ecaadf95c616ee443a4f7978239bac', 'local-dev-owner', '2099-01-01T00:00:00.000Z');
