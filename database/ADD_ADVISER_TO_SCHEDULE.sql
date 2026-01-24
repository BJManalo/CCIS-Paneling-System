-- SQL command to add 'adviser' column to the 'schedules' table
ALTER TABLE schedules 
ADD COLUMN IF NOT EXISTS adviser TEXT;

-- Optional: Sync existing schedules with advisers from student_groups
-- UPDATE schedules s
-- SET adviser = sg.adviser
-- FROM student_groups sg
-- WHERE s.group_id = sg.id;
