-- Users now come from WorkOS sign-in. Every earlier row was a demo user without an identity.
DELETE FROM users;
ALTER TABLE users ADD COLUMN email text NOT NULL;
