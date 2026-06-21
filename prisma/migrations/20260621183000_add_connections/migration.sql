-- Transient request/connection authorization state for signaling.
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Connection_requesterId_idx" ON "Connection"("requesterId");
CREATE INDEX "Connection_targetId_idx" ON "Connection"("targetId");
CREATE INDEX "Connection_status_idx" ON "Connection"("status");
