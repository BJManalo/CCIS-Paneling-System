-- Delete ALL schedule records for "Faith in Motion"
-- This removes Title, Pre Oral, Final, and any duplicates for this group.
DELETE FROM schedules 
WHERE group_id IN (SELECT id FROM student_groups WHERE group_name = 'Faith in Motion');

-- If you actually wanted to delete EVERY schedule for EVERY group (Total Reset), run this instead:
-- DELETE FROM schedules;
