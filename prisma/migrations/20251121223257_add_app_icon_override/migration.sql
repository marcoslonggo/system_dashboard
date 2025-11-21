-- CreateTable
CREATE TABLE "AppIconOverride" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "iconSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
