
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        // Fetch all student groups
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
    const sections = [...new Set(allGroups.map(g => g.section).filter(Boolean))].sort();

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

    const filteredGroups = allGroups.filter(g => {
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        return progMatch && sectMatch;
    });

    updateCounts(filteredGroups);
};

function updateCounts(groups) {
    const groupIds = groups.map(g => g.id);

    // Filter relevant statuses belonging to these groups
    const relevantStatuses = allDefenseStatuses.filter(ds => groupIds.includes(ds.group_id));

    // 1. Approved Titles (Check 'Title Defense' rows)
    const approvedTitles = countDefenseStatus(relevantStatuses, 'Title Defense', ['Approved']);

    // 2. Rejected Titles (Check 'Title Defense' rows)
    const rejectedTitles = countDefenseStatus(relevantStatuses, 'Title Defense', ['Rejected']);

    // 3. Completed (Check 'Final Defense' rows)
    const completed = countDefenseStatus(relevantStatuses, 'Final Defense', ['Passed', 'Approved']);

    // Animate or set text
    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    // Update Labels if needed (HTML might say "Recommended", we should ensure it matches "Rejected")
    // Previous HTML had "Recommended Titles". User asked for "Rejected Titles".
    // I should update the HTML too, or simpler: update the ID or just the number logic.
    // Let's stick to updating numbers. 
    // Wait, the HTML says "Recommended Titles" for the middle card.
    // I will rename the middle card title dynamically to "Rejected Titles" to be safe.

    // Safety check for elements
    if (titleEl) titleEl.innerText = approvedTitles;
    if (preOralEl) {
        preOralEl.innerText = rejectedTitles;
        // Find sibling key
        const titleContainer = preOralEl.parentElement.querySelector('.chart-title');
        if (titleContainer) titleContainer.innerText = "Rejected Titles";
        preOralEl.style.color = '#dc2626'; // Red for rejected
    }
    if (finalEl) finalEl.innerText = completed;
}

function countDefenseStatus(allStatuses, defenseType, passValues) {
    let count = 0;

    // Filter by type (normalize to be safe)
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
