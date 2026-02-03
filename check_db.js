const { createClient } = require('@supabase/supabase-js');

const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = createClient(PROJECT_URL, PUBLIC_KEY);

async function checkCompleted() {
    console.log("Checking for 'Completed' feedback...");
    const { data, error } = await supabase
        .from('capstone_feedback')
        .select('*')
        .eq('status', 'Completed');

    if (error) {
        console.error("Error:", error);
        return;
    }

    if (data.length === 0) {
        console.log("No feedback with 'Completed' status found.");
    } else {
        console.log(`Found ${data.length} records with 'Completed' status.`);
        data.forEach(item => {
            console.log(`- Group ID: ${item.group_id}, File: ${item.file_key}, Panel: ${item.user_name}`);
        });

        // Also check if they are in archived_projects
        const groupIds = [...new Set(data.map(i => i.group_id))];
        const { data: archived, error: archError } = await supabase
            .from('archived_projects')
            .select('group_id')
            .in('group_id', groupIds);

        if (archError) {
            console.error("Archive Check Error:", archError);
        } else {
            const archivedIds = (archived || []).map(a => a.group_id);
            console.log(`Archived Group IDs: ${archivedIds.join(', ') || 'None'}`);
        }
    }
}

checkCompleted();
