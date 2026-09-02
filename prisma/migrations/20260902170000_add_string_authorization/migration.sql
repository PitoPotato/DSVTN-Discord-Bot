-- RBAC roles and their permissions are application data. Permissions are
-- descriptive strings, never a numeric/bit-mask field.
CREATE TABLE "AuthorizationRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthorizationRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthorizationRolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthorizationRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthorizationRoleBinding" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthorizationRoleBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorizationRole_guildId_key_key" ON "AuthorizationRole"("guildId", "key");
CREATE INDEX "AuthorizationRole_guildId_idx" ON "AuthorizationRole"("guildId");
CREATE UNIQUE INDEX "AuthorizationRolePermission_roleId_permission_key" ON "AuthorizationRolePermission"("roleId", "permission");
CREATE INDEX "AuthorizationRolePermission_permission_idx" ON "AuthorizationRolePermission"("permission");
CREATE UNIQUE INDEX "AuthorizationRoleBinding_roleId_discordRoleId_key" ON "AuthorizationRoleBinding"("roleId", "discordRoleId");
CREATE INDEX "AuthorizationRoleBinding_discordRoleId_idx" ON "AuthorizationRoleBinding"("discordRoleId");

ALTER TABLE "AuthorizationRolePermission" ADD CONSTRAINT "AuthorizationRolePermission_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "AuthorizationRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthorizationRoleBinding" ADD CONSTRAINT "AuthorizationRoleBinding_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "AuthorizationRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
