-- The demo's starting users. Alchemy re-applies this file whenever it changes, so it must be idempotent.
INSERT INTO users (id, name) VALUES ('alice', 'Alice'), ('bob', 'Bob') ON CONFLICT (id) DO NOTHING;
