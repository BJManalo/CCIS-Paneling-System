
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

        // Find individual grade for this student in this phase
        const gradeRecord = phaseSchedule ? allGrades.find(g => g.student_id === student.id && g.schedule_id === phaseSchedule.id) : null;
        const studentGrade = gradeRecord ? parseFloat(gradeRecord.final_grade).toFixed(2) : '-';

        // Status logic for the specific phase
        let phaseStatus = 'Pending';
        let statusHtml = '<span class="status-badge pending">Pending</span>';

        if (phase === 'Title Defense') {
            const isApproved = Object.values(tMap).some(v => v.toLowerCase().includes('approved'));
            const isRejected = Object.values(tMap).some(v => v.toLowerCase().includes('rejected'));
            if (isApproved) {
                phaseStatus = 'Passed';
                statusHtml = '<span class="status-badge approved">Passed</span>';
            } else if (isRejected) {
                phaseStatus = 'Rejected';
                statusHtml = '<span class="status-badge rejected">Rejected</span>';
            }
        } else {
            // Pre-Oral or Final Defense
            if (phaseSchedule) {
                if (phaseSchedule.status === 'Completed' && studentGrade !== '-') {
                    const gradeVal = parseFloat(studentGrade);
                    if (gradeVal >= 3.0) { // Assuming 3.0 is failing in 1.0-5.0 scale, adjust if 75 is passing
                        // In many systems 3.0 is passing. Let's assume > 0 is completed/graded
                        phaseStatus = 'Passed';
                        statusHtml = '<span class="status-badge approved">Graded</span>';
                    } else {
                        phaseStatus = 'Incomplete';
                        statusHtml = '<span class="status-badge rejected">Failing/Inc</span>';
                    }
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
            <td><strong>${row.student_name}</strong></td>
            <td>${row.group_name}</td>
            <td style="font-size: 11px; color: #64748b;">${row.project_title}</td>
            <td>${row.program}</td>
            <td>${row.section}</td>
            <td>${row.phase}</td>
            <td>${row.statusHtml}</td>
            <td style="font-weight: 700; color: var(--primary-color);">${row.grade}</td>
        `;
        tableBody.appendChild(tr);
    });
}

window.printReport = () => {
    const phase = document.getElementById('defenseFilter').value;
    const prog = document.getElementById('programFilter').value;
    const sect = document.getElementById('sectionFilter').value;

    document.getElementById('printDate').innerText = `Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;

    let titleStr = `${phase} Academic Report`;
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
