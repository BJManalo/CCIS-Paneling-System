
-- Remove status and remarks columns from student_groups
ALTER TABLE student_groups
DROP COLUMN IF EXISTS title_status,
DROP COLUMN IF EXISTS pre_oral_status,
DROP COLUMN IF EXISTS final_status,
DROP COLUMN IF EXISTS title_remarks,
DROP COLUMN IF EXISTS pre_oral_remarks,
DROP COLUMN IF EXISTS final_remarks;

-- Note: We are keeping the '_link' columns (title_link, etc.) here for now? 
-- Or should submissions also move?
-- Usually submissions are tied to the group entity. 
-- Moving links to defense_statuses table might be cleaner if we want complete separation,
-- but the prompt strictly said "remove status and title remarks". 
-- Links are technically "student input", not "panel status".
