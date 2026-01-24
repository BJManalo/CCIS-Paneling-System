
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let filteredGroups = [];

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

        // Fetch students
        const { data: students, error: stdError } = await supabaseClient
            .from('students')
            .select('*');

        if (stdError) throw stdError;
        allStudents = students || [];

        console.log('Fetched Groups:', allGroups.length);
        console.log('Fetched DefStatuses:', allDefenseStatuses.length);
        console.log('Fetched Students:', allStudents.length);

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
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    filteredGroups = allGroups.filter(g => {
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));

        return progMatch && sectMatch && searchMatch;
    });

    updateCounts(filteredGroups);
    renderTable();
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

    // Display
    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    if (titleEl) titleEl.innerText = approvedTitles;
    if (preOralEl) preOralEl.innerText = rejectedTitles;
    if (finalEl) finalEl.innerText = completed;
}

function countDefenseStatus(allStatuses, defenseType, passValues) {
    let count = 0;

    const specificRows = allStatuses.filter(ds =>
        ds.defense_type && ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === defenseType.toLowerCase().replace(/[^a-z0-9]/g, '')
    );

    specificRows.forEach(row => {
        let statusMap = row.statuses;
        // Resilience: Parse if it's a string
        if (typeof statusMap === 'string') {
            try { statusMap = JSON.parse(statusMap); } catch (e) { statusMap = {}; }
        }
        if (!statusMap) statusMap = {};

        Object.values(statusMap).forEach(v => {
            if (typeof v === 'string' && passValues.some(p => v.toLowerCase().includes(p.toLowerCase()))) {
                count++;
            }
        });
    });

    return count;
}

async function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    if (filteredGroups.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    // Fetch student members for each filtered group if possible
    // For now, assume we just show the group info. 
    // If members are in a separate table, we'd need another fetch.

    filteredGroups.forEach(g => {
        // Get status for Title Defense
        const titleRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Title Defense');
        const finalRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Final Defense');

        let statusHtml = '<span class="status-badge pending">Pending</span>';

        // Check Final First (Completed)
        if (finalRow && Object.values(finalRow.statuses || {}).some(v => v.toLowerCase().includes('approved'))) {
            statusHtml = '<span class="status-badge approved">Completed</span>';
        } else if (titleRow) {
            const statusVals = Object.values(titleRow.statuses || {});
            const approvedCount = statusVals.filter(v => v.toLowerCase().includes('approved')).length;
            const rejectedCount = statusVals.filter(v => v.toLowerCase().includes('rejected')).length;
            const totalSubmitted = statusVals.length;

            if (approvedCount > 0) {
                statusHtml = '<span class="status-badge approved" style="background:#dbeafe; color: #2563eb; border-color:#bfdbfe;">Title Approved</span>';
            } else if (rejectedCount > 0) {
                if (rejectedCount === totalSubmitted) {
                    statusHtml = `<span class="status-badge rejected">All Rejected (${rejectedCount}/${totalSubmitted})</span>`;
                } else {
                    statusHtml = `<span class="status-badge rejected">${rejectedCount}/${totalSubmitted} Rejected</span>`;
                }
            }
        }

        const members = allStudents
            .filter(s => s.group_id === g.id)
            .map(s => s.full_name)
            .join(', ');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${g.group_name || '-'}</td>
            <td>Group #${g.id}</td>
            <td style="font-size: 11px; color: #64748b;">${members || '-'}</td>
            <td>${g.program || '-'}</td>
            <td>${g.year_level || '-'}</td>
            <td>${statusHtml}</td>
        `;
        tableBody.appendChild(row);
    });
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};

document.getElementById('searchInput')?.addEventListener('input', applyDashboardFilters);
