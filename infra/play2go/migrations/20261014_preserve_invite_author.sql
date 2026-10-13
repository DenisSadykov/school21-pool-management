-- Run explicitly AFTER a verified backup, BEFORE publishing the API fix.
-- Keep invitations usable when their creator is removed; application deletion
-- clears the creator FK. This is additive and safe for the previous app version.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.pool_invite_links ALTER COLUMN created_by DROP NOT NULL;
COMMIT;
