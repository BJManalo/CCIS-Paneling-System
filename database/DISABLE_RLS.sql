
-- Disable RLS on accounts table to restore access
ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;

-- Disable RLS on student_groups and students to ensure everything works smoothly for now
ALTER TABLE student_groups DISABLE ROW LEVEL SECURITY;
ALTER TABLE students DISABLE ROW LEVEL SECURITY;
ALTER TABLE grades DISABLE ROW LEVEL SECURITY;
ALTER TABLE schedules DISABLE ROW LEVEL SECURITY;
