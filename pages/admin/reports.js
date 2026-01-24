
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allGrades = [];
let filteredRows = [];

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || loginUser.role !== 'Admin') {
        window.location.href = '../../index.html';
        return;
    }

    fetchReportData();
});

async function fetchReportData() {
    try {
        // Fetch all data
        const [groupsRes, statusesRes, studentsRes, gradesRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('defense_statuses').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('grades').select('*')
        ]);

        if (groupsRes.error) throw groupsRes.error;
        if (statusesRes.error) throw statusesRes.error;
        if (studentsRes.error) throw studentsRes.error;

        allGroups = groupsRes.data || [];
        allDefenseStatuses = statusesRes.data || [];
        allStudents = studentsRes.data || [];
        allGrades = gradesRes.data || [];

        // Populate Section Filter
        populateSectionFilter();

        // Initial Filter & Render
        applyFilters();

    } catch (err) {
        console.error('Error fetching report data:', err);
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

function getStatusMap(row) {
    if (!row || !row.statuses) return {};
    let s = row.statuses;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return {}; } }
    return s;
}

window.applyFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    filteredRows = [];

    allGroups.forEach(g => {
        // Base Filters
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));

        if (!(progMatch && sectMatch && searchMatch)) return;

        const titleRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Title Defense');
        const finalRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Final Defense');
        const tMap = getStatusMap(titleRow);
        const fMap = getStatusMap(finalRow);

        // Members
        const membersList = allStudents
            .filter(s => s.group_id === g.id)
            .map(s => s.full_name)
            .join(', ');

        const studentIds = allStudents.filter(s => s.group_id === g.id).map(s => s.id);
        const groupGrades = allGrades.filter(gr => studentIds.includes(gr.student_id));

        // Calculate average grade if multiple students
        let avgGrade = '-';
        if (groupGrades.length > 0) {
            const sum = groupGrades.reduce((acc, curr) => acc + (parseFloat(curr.final_grade) || 0), 0);
            avgGrade = (sum / groupGrades.length).toFixed(2);
        }

        // Status
        let statusBadge = '<span class="status-badge pending">Pending</span>';
        let projectTitle = g.group_name;

        const approvedKey = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved'));
        const finalApproved = Object.values(fMap).some(v => v.toLowerCase().includes('approved'));

        if (finalApproved) {
            statusBadge = '<span class="status-badge approved">Completed</span>';
            projectTitle = approvedKey || g.group_name;
        } else if (approvedKey) {
            statusBadge = '<span class="status-badge approved" style="background:#dbeafe; color:#2563eb;">Title Approved</span>';
            projectTitle = approvedKey;
        } else if (Object.values(tMap).some(v => v.toLowerCase().includes('rejected'))) {
            statusBadge = '<span class="status-badge rejected">Rejected</span>';
        }

        filteredRows.push({
            title: projectTitle,
            group_name: g.group_name || '-',
            members: membersList || '-',
            program: g.program || '-',
            section: g.section || '-',
            year: g.year_level || '-',
            statusHtml: statusBadge,
            grade: avgGrade,
            isApproved: !!approvedKey,
            isRejected: Object.values(tMap).some(v => v.toLowerCase().includes('rejected')) && !approvedKey,
            isCompleted: finalApproved
        });
    });

    updateCounters();
    renderTable();
};

function updateCounters() {
    const counts = {
        approved: filteredRows.filter(r => r.isApproved).length,
        rejected: filteredRows.filter(r => r.isRejected).length,
        completed: filteredRows.filter(r => r.isCompleted).length
    };

    document.getElementById('countTitle').innerText = counts.approved;
    document.getElementById('countRejected').innerText = counts.rejected;
    document.getElementById('countCompleted').innerText = counts.completed;
}

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (filteredRows.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    filteredRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.title}</td>
            <td>${row.group_name}</td>
            <td style="font-size: 11px; color: #64748b;">${row.members}</td>
            <td>${row.program}</td>
            <td>${row.section}</td>
            <td>${row.year}</td>
            <td>${row.statusHtml}</td>
            <td style="font-weight: 700; color: var(--primary-color);">${row.grade}</td>
        `;
        tableBody.appendChild(tr);
    });
}

window.printReport = () => {
    const prog = document.getElementById('programFilter').value;
    const sect = document.getElementById('sectionFilter').value;

    document.getElementById('printDate').innerText = `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    let titleStr = "Capstone Project Academic Report";
    if (prog !== 'ALL') titleStr += ` - ${prog}`;
    if (sect !== 'ALL') titleStr += ` - Section ${sect}`;

    document.getElementById('printReportTitle').innerText = titleStr;

    window.print();
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
