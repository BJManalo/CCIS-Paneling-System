
const { createClient } = require('@supabase/supabase-js');
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = createClient(PROJECT_URL, PUBLIC_KEY);

async function checkDebugger() {
    const { data: groups } = await supabase.from('student_groups').select('id, group_name, pre_oral_link, title_link, final_link').ilike('group_name', '%Debugger%');
    console.log('Groups found:', JSON.stringify(groups, null, 2));

    if (!groups || groups.length === 0) return;

    const gId = groups[0].id;
    const { data: archived } = await supabase.from('archived_projects').select('submissions').eq('group_id', gId);
    console.log('Archived Submissions:', JSON.stringify(archived, null, 2));
}

checkDebugger();
