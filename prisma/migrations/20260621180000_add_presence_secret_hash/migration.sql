-- Store only a server-side hash of the private ownership secret. Existing
-- transient presence rows cannot authenticate after this migration and will
-- naturally age out.
ALTER TABLE "Presence" ADD COLUMN "secretHash" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Presence" ALTER COLUMN "secretHash" DROP DEFAULT;
