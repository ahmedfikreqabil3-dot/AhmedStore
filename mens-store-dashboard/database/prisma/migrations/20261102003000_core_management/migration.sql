ALTER TABLE "Organization" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "settingsVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_settings_version_check" CHECK ("settingsVersion">0);
