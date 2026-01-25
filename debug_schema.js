
const { createClient } = require('@supabase/supabase-js');

const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = createClient(PROJECT_URL, PUBLIC_KEY);

async function checkSchema() {
    try {
        const { data, error } = await supabase
            .from('defense_statuses')
            .select('*')
            .limit(1);

        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Columns:', data && data.length > 0 ? Object.keys(data[0]) : 'No data found');
            console.log('First Row:', data && data.length > 0 ? JSON.stringify(data[0], null, 2) : 'No data');
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

checkSchema();
