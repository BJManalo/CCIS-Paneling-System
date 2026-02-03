// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allSchedules = [];
let allGrades = [];
let filteredRows = [];
let currentTab = 'pass'; // 'pass' or 'failed'

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || loginUser.role !== 'Admin') {
        window.location.href = '../../';
        return;
    }

    fetchReportData();
});

async function fetchReportData() {
    try {
        // Fetch all data
        const [groupsRes, statusesRes, studentsRes, schedulesRes, gradesRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('defense_statuses').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('schedules').select('*'),
            supabaseClient.from('grades').select('*')
        ]);

        if (groupsRes.error) throw groupsRes.error;
        if (statusesRes.error) throw statusesRes.error;
        if (studentsRes.error) throw studentsRes.error;
        if (schedulesRes.error) throw schedulesRes.error;
        if (gradesRes.error) throw gradesRes.error;

        allGroups = groupsRes.data || [];
        allDefenseStatuses = statusesRes.data || [];
        allStudents = studentsRes.data || [];
        allSchedules = schedulesRes.data || [];
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

window.switchReportTab = (tab) => {
    currentTab = tab;

    // Update active tab styles
    document.querySelectorAll('.role-tab').forEach(btn => {
        btn.classList.toggle('active', btn.id === `tab-${tab}`);
    });

    applyFilters();
};

window.applyFilters = () => {
    const phase = document.getElementById('defenseFilter').value;
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Reset counters
    let passCount = 0;
    let failedCount = 0;

    filteredRows = [];

    // Helper to normalize defense type matching
    const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
    const phaseNorm = normalize(phase);

    allStudents.forEach(student => {
        // Use String() for robust ID matching
        const group = allGroups.find(g => String(g.id) === String(student.group_id));
        if (!group) return;

        // Base Filters
        const progMatch = program === 'ALL' || (group.program && group.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (group.section === section);
        const searchMatch = !searchTerm ||
            (student.full_name && student.full_name.toLowerCase().includes(searchTerm)) ||
            (group.group_name && group.group_name.toLowerCase().includes(searchTerm));

        if (!(progMatch && sectMatch && searchMatch)) return;

        // Robust Grade Matching
        const gradeRecord = allGrades.find(gr =>
            String(gr.student_id) === String(student.id) &&
            normalize(gr.grade_type || '') === phaseNorm
        );

        const isGradeValid = gradeRecord &&
            gradeRecord.grade !== null &&
            gradeRecord.grade !== undefined &&
            String(gradeRecord.grade).toLowerCase() !== 'null';

        if (isGradeValid) {
            passCount++;
        } else {
            failedCount++;
        }

        const matchesTab = (currentTab === 'pass') ? isGradeValid : !isGradeValid;

        if (matchesTab) {
            filteredRows.push({
                student_name: student.full_name,
                group_name: group.group_name || '-',
                program: group.program || '-',
                year: group.year_level || '-',
                section: group.section || '-',
                grade: isGradeValid ? gradeRecord.grade : 'N/A'
            });
        }
    });

    // Update Counter Cards
    document.getElementById('countPass').innerText = passCount;
    document.getElementById('countFailed').innerText = failedCount;
    document.getElementById('countTotal').innerText = passCount + failedCount;

    renderTable();
};

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
            <td style="font-weight: 500;">${row.group_name}</td>
            <td style="font-weight: 600;">${row.student_name}</td>
            <td>${row.program}</td>
            <td>${row.year}</td>
            <td>${row.section}</td>
            <td style="font-weight: 700; color: var(--primary-color);">${row.grade}</td>
        `;
        tableBody.appendChild(tr);
    });
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
