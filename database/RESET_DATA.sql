
-- RESET SCRIPT
-- WARNING: This will delete ALL data from these tables.

-- 1. Clear Defense Statuses (The new table we just made)
TRUNCATE TABLE defense_statuses RESTART IDENTITY CASCADE;

-- 2. Clear Submission Links from student_groups (Set to NULL)
UPDATE student_groups
SET title_link = NULL,
    pre_oral_link = NULL,
    final_link = NULL;

-- 3. (Optional) If you want to delete ALL students and groups to start fresh:
-- TRUNCATE TABLE students RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE student_groups RESTART IDENTITY CASCADE;
