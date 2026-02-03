-- Create table for storing archived graduated projects
CREATE TABLE IF NOT EXISTS public.archived_projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id BIGINT,
    group_name TEXT,
    project_title TEXT,
    members JSONB DEFAULT '[]'::jsonb,
    panelists JSONB DEFAULT '[]'::jsonb,
    submissions JSONB DEFAULT '{}'::jsonb,
    annotations JSONB DEFAULT '{}'::jsonb,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Enable access
ALTER TABLE public.archived_projects DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.archived_projects TO postgres;
GRANT ALL ON public.archived_projects TO anon;
GRANT ALL ON public.archived_projects TO authenticated;
GRANT ALL ON public.archived_projects TO service_role;
