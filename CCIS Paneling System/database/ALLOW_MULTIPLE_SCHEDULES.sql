-- Run this to allow multiple schedules per group (e.g., Title AND Pre Oral)
-- 1. Drop the old unique constraint on group_id (this prevented multiple schedules)
ALTER TABLE schedules 
DROP CONSTRAINT IF EXISTS schedules_group_id_key;

-- 2. Add a new constraint: A group can't have two schedules of the SAME TYPE
--    But they CAN have (Group A, Title) and (Group A, Pre Oral)
ALTER TABLE schedules 
ADD CONSTRAINT unique_group_schedule_type UNIQUE (group_id, schedule_type);
