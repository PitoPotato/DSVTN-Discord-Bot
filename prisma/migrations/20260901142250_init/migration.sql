-- CreateEnum
CREATE TYPE "ReactionRoleStyle" AS ENUM ('BUTTON', 'MENU');

-- CreateEnum
CREATE TYPE "ReactionRoleAction" AS ENUM ('ADD_ONLY', 'REMOVE_ONLY', 'TOGGLE');

-- CreateTable
CREATE TABLE "GuildConfig" (
    "guildId" TEXT NOT NULL,
    "renameWarningChannelId" TEXT,
    "leaderRoleId" TEXT,
    "technicianRoleId" TEXT,
    "verifiedRoleId" TEXT,
    "unverifiedRoleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildConfig_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "ReactionRolePanel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "style" "ReactionRoleStyle" NOT NULL,
    "action" "ReactionRoleAction" NOT NULL,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" INTEGER NOT NULL DEFAULT 3447003,
    "footer" TEXT,
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReactionRolePanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReactionRoleItem" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRoleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedMember" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VerifiedMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReactionRolePanel_guildId_isEnabled_idx" ON "ReactionRolePanel"("guildId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRolePanel_guildId_name_key" ON "ReactionRolePanel"("guildId", "name");

-- CreateIndex
CREATE INDEX "ReactionRoleItem_panelId_position_idx" ON "ReactionRoleItem"("panelId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionRoleItem_panelId_roleId_key" ON "ReactionRoleItem"("panelId", "roleId");

-- CreateIndex
CREATE INDEX "VerifiedMember_guildId_fullName_idx" ON "VerifiedMember"("guildId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedMember_guildId_userId_key" ON "VerifiedMember"("guildId", "userId");

-- AddForeignKey
ALTER TABLE "ReactionRoleItem" ADD CONSTRAINT "ReactionRoleItem_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "ReactionRolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
