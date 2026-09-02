-- AlterTable
ALTER TABLE "GuildConfig"
  ADD COLUMN "notificationFooterText" TEXT,
  ADD COLUMN "notificationFooterIconUrl" TEXT;

-- AlterTable
ALTER TABLE "ReactionRolePanel"
  ADD COLUMN "titleUrl" TEXT,
  ADD COLUMN "authorName" TEXT,
  ADD COLUMN "authorIconUrl" TEXT,
  ADD COLUMN "footerIconUrl" TEXT;
