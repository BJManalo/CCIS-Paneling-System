-- Remove the schedule for "Gods of the Gods" 
-- This will remove it from the Grades tab list.

DELETE FROM schedules 
WHERE group_id IN (SELECT id FROM student_groups WHERE group_name = 'Gods of the Gods');
