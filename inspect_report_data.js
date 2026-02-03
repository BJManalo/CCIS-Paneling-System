const { createClient } = require('@supabase/supabase-js');

const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabase = createClient(PROJECT_URL, PUBLIC_KEY);

async function checkGrades() {
    console.log("--- GRADES DATA ---");
    const { data: grades, error: gError } = await supabase.from('grades').select('*').limit(5);
    if (gError) console.error(gError);
    else console.log(JSON.stringify(grades, null, 2));

    console.log("\n--- STUDENTS DATA ---");
    const { data: students, error: sError } = await supabase.from('students').select('*').limit(5);
    if (sError) console.error(sError);
    else console.log(JSON.stringify(students, null, 2));

    console.log("\n--- GROUPS DATA ---");
    const { data: groups, error: grError } = await supabase.from('student_groups').select('*').limit(5);
    if (grError) console.error(grError);
    else console.log(JSON.stringify(groups, null, 2));
}

checkGrades();
