-- Remove user activity/profile timestamp fields that are no longer used.
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastActiveAt";
ALTER TABLE "users" DROP COLUMN IF EXISTS "profileCompletedAt";

-- Keep the canonical display name fields in sync for users who already completed profiles.
UPDATE "users"
SET
  "firstName" = COALESCE(NULLIF("realFirstName", ''), "firstName"),
  "lastName" = COALESCE(NULLIF("realLastName", ''), "lastName")
WHERE "profileCompleted" = TRUE;
