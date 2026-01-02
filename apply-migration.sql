-- Migration para adicionar campos de tempo trabalhado e valor final
-- Execute este SQL diretamente no banco de dados PostgreSQL

ALTER TABLE "ServiceBooking" 
ADD COLUMN IF NOT EXISTS "finalAmount" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "actualWorkedHours" INTEGER,
ADD COLUMN IF NOT EXISTS "actualWorkedMinutes" INTEGER;

