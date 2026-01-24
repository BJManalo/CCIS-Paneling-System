
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let instructorName = '';

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || loginUser.role !== 'Instructor') {
        window.location.href = '../../index.html';
        return;
    }
    instructorName = loginUser.full_name || '';

    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (gError) throw gError;
        allGroups = groups || [];

        // Fetch all defense statuses
        const { data: statuses, error: sError } = await supabaseClient
            .from('defense_statuses')
            .select('*');

        if (sError) throw sError;
        allDefenseStatuses = statuses || [];

        // Populate Section Filter
        populateSectionFilter();

        // Initial Count Update
        applyDashboardFilters();

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');

    // Filter groups where I am the adviser
    const myGroups = allGroups.filter(g =>
        g.adviser && g.adviser.toLowerCase().trim() === instructorName.toLowerCase().trim()
    );

    const sections = [...new Set(myGroups.map(g => g.section).filter(Boolean))].sort();

    sections.forEach(sec => {
        const option = document.createElement('option');
        option.value = sec;
        option.textContent = sec;
        sectionFilter.appendChild(option);
    });
}

window.applyDashboardFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;

    // Filter data
    const filtered = allGroups.filter(g => {
        // 1. Must be MY group (Adviser check)
        const isMyGroup = g.adviser && g.adviser.toLowerCase().trim() === instructorName.toLowerCase().trim();
        if (!isMyGroup) return false;

        // 2. Program Filter
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);

        // 3. Section Filter
        const sectMatch = section === 'ALL' || (g.section && g.section === section);

        return progMatch && sectMatch;
    });

    updateCounts(filtered);
};

function updateCounts(groups) {
    const groupIds = groups.map(g => g.id);

    // Filter statuses for MY filtered groups
    const relevantStatuses = allDefenseStatuses.filter(ds => groupIds.includes(ds.group_id));

    // 1. Approved Titles
    const approvedTitles = countDefenseStatus(relevantStatuses, 'Title Defense', ['Approved']);

    // 2. Rejected Titles
    const rejectedTitles = countDefenseStatus(relevantStatuses, 'Title Defense', ['Rejected']);

    // 3. Completed (Graduates)
    const completed = countDefenseStatus(relevantStatuses, 'Final Defense', ['Passed', 'Approved']);

    // Display Counts
    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    if (titleEl) titleEl.innerText = approvedTitles;
    if (preOralEl) {
        preOralEl.innerText = rejectedTitles;
        const titleContainer = preOralEl.parentElement.querySelector('.chart-title');
        if (titleContainer) titleContainer.innerText = "Rejected Titles";
        preOralEl.style.color = '#dc2626';
    }
    if (finalEl) finalEl.innerText = completed;
}

function countDefenseStatus(allStatuses, defenseType, passValues) {
    let count = 0;
    const specificRows = allStatuses.filter(ds =>
        ds.defense_type && ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === defenseType.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    specificRows.forEach(row => {
        const statuses = row.statuses || {};
        const values = Object.values(statuses);
        values.forEach(v => {
            if (passValues.some(p => v.toLowerCase().includes(p.toLowerCase()))) {
                count++;
            }
        });
    });

    return count;
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};
