
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let filteredGroups = [];
let currentCategory = 'ALL'; // 'ALL', 'APPROVED', 'REJECTED', 'COMPLETED'
let displayRows = [];

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
    if (!sectionFilter) return;
    const sections = [...new Set(allGroups.map(g => g.section).filter(Boolean))].sort();

    sections.forEach(sec => {
        const option = document.createElement('option');
        option.value = sec;
        option.textContent = sec;
        sectionFilter.appendChild(option);
    });
}

window.setCategoryFilter = (category) => {
    // Toggle functionality: clicking same category resets to ALL
    if (currentCategory === category) {
        currentCategory = 'ALL';
    } else {
        currentCategory = category;
    }

    // Visual feedback for cards
    document.querySelectorAll('.chart-card').forEach(card => {
        card.style.border = '1px solid #f0f0f0';
        card.style.transform = 'none';
        card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
    });

    if (currentCategory !== 'ALL') {
        const titleMap = { 'APPROVED': 'Approved Titles', 'REJECTED': 'Rejected Titles', 'COMPLETED': 'Completed Titles' };
        const cards = document.querySelectorAll('.chart-card');
        cards.forEach(card => {
            if (card.querySelector('.chart-title').innerText === titleMap[currentCategory]) {
                card.style.border = '2px solid var(--primary-color)';
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)';
            }
        });
    }

    applyDashboardFilters();
};

window.applyDashboardFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // 1. Get base groups matching metadata filters
    const baseGroups = allGroups.filter(g => {
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));
        return progMatch && sectMatch && searchMatch;
    });

    const getStatusMap = (row) => {
        if (!row || !row.statuses) return {};
        let s = row.statuses;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return {}; } }

        // Flatten for easy checking: if a key's value is an object (multi-panel), 
        // we consider the "overall" status as the first non-Pending one or "Approved" if it exists.
        const flat = {};
        Object.keys(s).forEach(fileKey => {
            const val = s[fileKey];
            if (typeof val === 'object' && val !== null) {
                // Multi-panel: { "Panel A": "Approved", "Panel B": "Pending" }
                const values = Object.values(val);
                if (values.some(v => v.includes('Approved'))) flat[fileKey] = 'Approved';
                else if (values.some(v => v.includes('Approve with Revisions'))) flat[fileKey] = 'Approve with Revisions';
                else if (values.some(v => v.includes('Rejected') || v.includes('Redefense'))) flat[fileKey] = 'Rejected';
                else flat[fileKey] = 'Pending';
            } else {
                flat[fileKey] = val || 'Pending';
            }
        });
        return flat;
    };

    displayRows = [];

    baseGroups.forEach(g => {
        const titleRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Title Defense');
        const finalRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Final Defense');
        const tMap = getStatusMap(titleRow);
        const fMap = getStatusMap(finalRow);

        const membersList = allStudents
            .filter(s => s.group_id === g.id)
            .map(s => s.full_name)
            .join(', ');

        const baseObj = {
            group_name: g.group_name || '-',
            members: membersList || '-',
            program: g.program || '-',
            year: g.year_level || '-',
            original: g
        };

        if (currentCategory === 'ALL') {
            let titleLabel = g.group_name;
            let statusBadge = '<span class="status-badge pending">Pending</span>';

            const approvedKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved'));
            const finalApproved = Object.values(fMap).some(v => v.toLowerCase().includes('approved'));

            if (finalApproved) {
                statusBadge = '<span class="status-badge approved">Completed</span>';
                titleLabel = `<strong>${approvedKey || g.group_name}</strong>`;
            } else if (approvedKey) {
                statusBadge = '<span class="status-badge approved" style="background:#dbeafe; color:#2563eb;">Title Approved</span>';
                titleLabel = `<strong>${approvedKey}</strong>`;
            } else if (Object.values(tMap).some(v => v.toLowerCase().includes('rejected'))) {
                const rejCount = Object.values(tMap).filter(v => v.toLowerCase().includes('rejected')).length;
                statusBadge = `<span class="status-badge rejected">${rejCount} Rejected</span>`;
                titleLabel = Object.keys(tMap).filter(k => tMap[k].toLowerCase().includes('rejected'))[0];
            }
            displayRows.push({ ...baseObj, title: titleLabel, statusHtml: statusBadge });

        } else if (currentCategory === 'APPROVED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k].toLowerCase().includes('approved')) {
                    displayRows.push({
                        ...baseObj,
                        title: `<strong>${k}</strong>`,
                        statusHtml: '<span class="status-badge approved">Title Approved</span>'
                    });
                }
            });
        } else if (currentCategory === 'REJECTED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k].toLowerCase().includes('rejected')) {
                    displayRows.push({
                        ...baseObj,
                        title: `<span style="color: #dc2626;">${k}</span>`,
                        statusHtml: '<span class="status-badge rejected">Rejected</span>'
                    });
                }
            });
        } else if (currentCategory === 'COMPLETED') {
            if (Object.values(fMap).some(v => v.toLowerCase().includes('approved'))) {
                const approvedKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved'));
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${approvedKey || g.group_name}</strong>`,
                    statusHtml: '<span class="status-badge approved">Completed</span>'
                });
            }
        }
    });

    updateCounts(baseGroups);
    renderTable();
};

function updateCounts(groups) {
    const groupIds = groups.map(g => g.id);
    const relevantStatuses = allDefenseStatuses.filter(ds => groupIds.includes(ds.group_id));

    const getVals = (row) => {
        if (!row || !row.statuses) return [];
        let s = row.statuses;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return []; } }

        const results = [];
        Object.values(s).forEach(val => {
            if (typeof val === 'object' && val !== null) {
                // If any panel approved, we count the file as approved in this summary
                const inner = Object.values(val);
                if (inner.some(v => v.includes('Approved'))) results.push('Approved');
                else if (inner.some(v => v.includes('Rejected') || v.includes('Redefense'))) results.push('Rejected');
                else results.push('Pending');
            } else {
                results.push(val);
            }
        });
        return results;
    };

    let approvedTotal = 0;
    let rejectedTotal = 0;
    let completedTotal = 0;

    groupIds.forEach(id => {
        const titleRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Title Defense');
        const finalRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Final Defense');
        const tVals = getVals(titleRow);
        const fVals = getVals(finalRow);

        approvedTotal += tVals.filter(v => typeof v === 'string' && v.toLowerCase().includes('approved')).length;
        rejectedTotal += tVals.filter(v => typeof v === 'string' && v.toLowerCase().includes('rejected')).length;
        completedTotal += fVals.filter(v => typeof v === 'string' && v.toLowerCase().includes('approved')).length;
    });

    const titleEl = document.getElementById('countTitle');
    const preOralEl = document.getElementById('countPreOral');
    const finalEl = document.getElementById('countFinal');

    if (titleEl) titleEl.innerText = approvedTotal;
    if (preOralEl) preOralEl.innerText = rejectedTotal;
    if (finalEl) finalEl.innerText = completedTotal;
}

function countDefenseStatus(allStatuses, defenseType, passValues) { return 0; }

async function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (displayRows.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    displayRows.forEach(row => {
        const program = (row.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        const members = (row.members || '').split(',').filter(m => m.trim());
        const membersHtml = members.map(m => `<span class="chip">${m.trim()}</span>`).join('');

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.title || '-'}</td>
            <td>${row.group_name}</td>
            <td>
                <div class="chips-container">
                    ${membersHtml}
                </div>
            </td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>${row.year}</td>
            <td>${row.statusHtml}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

window.filterTable = (program) => {
    const filterEl = document.getElementById('programFilter');
    if (filterEl) {
        filterEl.value = program;
        applyDashboardFilters();
    }
};

document.getElementById('searchInput')?.addEventListener('input', applyDashboardFilters);
