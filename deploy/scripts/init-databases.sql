-- Runs once on first postgres container start.
-- Primary DB `nordly` is created via POSTGRES_DB env.
-- Other DB names must match DB_SERVICES in deploy/scripts/services.conf.sh.
CREATE DATABASE nordly_billing;
CREATE DATABASE nordly_sandbox;
CREATE DATABASE nordly_rooms;
CREATE DATABASE nordly_tracker;
CREATE DATABASE nordly_notes;
CREATE DATABASE nordly_focus;
