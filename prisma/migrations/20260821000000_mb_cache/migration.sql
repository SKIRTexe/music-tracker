-- CreateTable
CREATE TABLE "MbCache" (
    "url" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MbCache_pkey" PRIMARY KEY ("url")
);

-- CreateIndex
CREATE INDEX "MbCache_expiresAt_idx" ON "MbCache"("expiresAt");
