-- CreateTable
CREATE TABLE "PostedVideo" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "videoUrl" TEXT,
    "igMediaId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "PostedVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostedVideo_url_key" ON "PostedVideo"("url");

-- CreateIndex
CREATE INDEX "PostedVideo_status_idx" ON "PostedVideo"("status");

-- CreateIndex
CREATE INDEX "PostedVideo_account_idx" ON "PostedVideo"("account");
