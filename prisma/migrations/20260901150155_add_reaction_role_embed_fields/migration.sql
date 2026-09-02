-- CreateTable
CREATE TABLE "ReactionRoleEmbedField" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "inline" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReactionRoleEmbedField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReactionRoleEmbedField_panelId_position_idx" ON "ReactionRoleEmbedField"("panelId", "position");

-- AddForeignKey
ALTER TABLE "ReactionRoleEmbedField" ADD CONSTRAINT "ReactionRoleEmbedField_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "ReactionRolePanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
