
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

function getStatusMap(row) {
    if (!row || !row.statuses) return {};
    let s = row.statuses;
    if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return {}; } }
    return s;
}

window.applyFilters = () => {
    const phase = document.getElementById('defenseFilter').value;
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    filteredRows = [];

    allStudents.forEach(student => {
        const group = allGroups.find(g => g.id === student.group_id);
        if (!group) return;

        // Base Filters
        const progMatch = program === 'ALL' || (group.program && group.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (group.section === section);
        const searchMatch = !searchTerm ||
            (student.full_name && student.full_name.toLowerCase().includes(searchTerm)) ||
            (group.group_name && group.group_name.toLowerCase().includes(searchTerm));

        if (!(progMatch && sectMatch && searchMatch)) return;

        // Determine project title from defense statuses
        const titleRow = allDefenseStatuses.find(ds => ds.group_id === group.id && ds.defense_type === 'Title Defense');
        const tMap = getStatusMap(titleRow);
        const projectTitle = Object.keys(tMap).find(k => tMap[k].toLowerCase().includes('approved')) || group.group_name || '-';

        // Find schedule for specific phase
        const phaseSchedule = allSchedules.find(s => s.group_id === group.id && s.schedule_type === phase);

        // Find individual grade for this student in this phase (match by student_id and grade_type)
        const gradeRecord = allGrades.find(gr => gr.student_id === student.id && gr.grade_type === phase);
        const studentGrade = (gradeRecord && (gradeRecord.grade || gradeRecord.grade === 0)) ? parseFloat(gradeRecord.grade).toFixed(2) : '-';

        // Phase Status Logic
        let phaseStatus = 'Pending';
        let statusHtml = '<span class="status-badge pending">Pending</span>';

        if (phase === 'Title Defense') {
            const isApproved = Object.values(tMap).some(v => v.toLowerCase().includes('approved'));
            const isRejected = Object.values(tMap).some(v => v.toLowerCase().includes('rejected'));
            if (studentGrade !== '-') {
                phaseStatus = 'Passed';
                statusHtml = '<span class="status-badge approved">Graded</span>';
            } else if (isApproved) {
                phaseStatus = 'Passed';
                statusHtml = '<span class="status-badge approved">Passed</span>';
            } else if (isRejected) {
                phaseStatus = 'Rejected';
                statusHtml = '<span class="status-badge rejected">Rejected</span>';
            }
        } else {
            // Pre-Oral or Final Defense
            const phaseSchedule = allSchedules.find(s => s.group_id === group.id && s.schedule_type === phase);
            if (studentGrade !== '-') {
                phaseStatus = 'Passed';
                statusHtml = '<span class="status-badge approved">Graded</span>';
            } else if (phaseSchedule) {
                if (phaseSchedule.status === 'Completed') {
                    phaseStatus = 'Incomplete';
                    statusHtml = '<span class="status-badge rejected">No Grade</span>';
                } else {
                    phaseStatus = 'Scheduled';
                    statusHtml = '<span class="status-badge pending" style="background:#e0f2fe; color:#0369a1;">Scheduled</span>';
                }
            }
        }

        filteredRows.push({
            student_name: student.full_name,
            group_name: group.group_name || '-',
            project_title: projectTitle,
            program: group.program || '-',
            section: group.section || '-',
            year: group.year_level || '-',
            phase: phase,
            statusHtml: statusHtml,
            grade: studentGrade,
            isPassed: phaseStatus === 'Passed',
            isFailed: phaseStatus === 'Rejected' || phaseStatus === 'Incomplete'
        });
    });

    updateCounters();
    renderTable();
};

function updateCounters() {
    const counts = {
        passed: filteredRows.filter(r => r.isPassed).length,
        failed: filteredRows.filter(r => r.isFailed).length,
        total: filteredRows.length
    };

    document.getElementById('countTitle').innerText = counts.passed;
    document.getElementById('countRejected').innerText = counts.failed;
    document.getElementById('countCompleted').innerText = counts.total;
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

window.printReport = () => {
    const phase = document.getElementById('defenseFilter').value;
    const prog = document.getElementById('programFilter').value;
    const sect = document.getElementById('sectionFilter').value;

    const printHeader = document.querySelector('.print-header');

    // Always show header for all defense phases (Title, Pre-oral, Final)
    printHeader.style.display = 'block';

    document.getElementById('printDate').innerText = `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    let titleStr = `${phase} Academic Report`;
    if (prog !== 'ALL') titleStr += ` - ${prog}`;
    if (sect !== 'ALL') titleStr += ` - Section ${sect}`;

    document.getElementById('printReportTitle').innerText = titleStr;

    // Temporarily remove page title to hide browser-generated print headers
    const originalTitle = document.title;
    document.title = "";

    window.print();

    // Restore title and reset display for screen
    document.title = originalTitle;
    printHeader.style.display = 'none';
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
