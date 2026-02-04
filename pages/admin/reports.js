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
        // Fetch only used data
        const [groupsRes, studentsRes, gradesRes] = await Promise.all([
            supabaseClient.from('student_groups').select('*'),
            supabaseClient.from('students').select('*'),
            supabaseClient.from('grades').select('*')
        ]);

        if (groupsRes.error) throw groupsRes.error;
        if (studentsRes.error) throw studentsRes.error;
        if (gradesRes.error) throw gradesRes.error;

        allGroups = groupsRes.data || [];
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
                student_id: student.id,
                student_name: student.full_name,
                group_id: group.id,
                group_name: group.group_name || '-',
                program: group.program || '-',
                year: group.year_level || '-',
                section: group.section || '-',
                grade: isGradeValid ? gradeRecord.grade : 'N/A'
            });
        }
    });

    // Update Counter Cards
    if (document.getElementById('countPass')) document.getElementById('countPass').innerText = passCount;
    if (document.getElementById('countFailed')) document.getElementById('countFailed').innerText = failedCount;
    if (document.getElementById('countTotal')) document.getElementById('countTotal').innerText = passCount + failedCount;

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

    // Grouping logic for cleaner UI
    const groups = {};
    filteredRows.forEach(row => {
        if (!groups[row.group_id]) {
            groups[row.group_id] = {
                group_name: row.group_name,
                program: row.program,
                year: row.year,
                section: row.section,
                students: []
            };
        }
        groups[row.group_id].students.push(row);
    });

    Object.keys(groups).forEach(groupId => {
        const group = groups[groupId];
        const collapseId = `collapse-${groupId}`;

        // Parent Row
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.className = 'group-row';
        tr.onclick = () => toggleRow(collapseId);

        const program = group.program.toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        tr.innerHTML = `
            <td style="font-weight: 700; color: var(--primary-dark);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="material-icons-round" style="font-size: 18px; color: #64748b; transition: transform 0.2s;" id="icon-${collapseId}">chevron_right</span>
                    ${group.group_name}
                </div>
            </td>
            <td style="color: #64748b; font-size: 0.85rem;">${group.students.length} Student(s)</td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>${group.year}</td>
            <td>${group.section}</td>
            <td><span class="material-icons-round" style="color: var(--primary-color);">expand_circle_down</span></td>
        `;
        tableBody.appendChild(tr);

        // Child Row (Collapse)
        const childTr = document.createElement('tr');
        childTr.id = collapseId;
        childTr.style.display = 'none';
        childTr.className = 'student-details-row';

        childTr.innerHTML = `
            <td colspan="6" style="padding: 0; background: #f8fafc;">
                <div style="padding: 15px 40px;">
                    <table style="width: 100%; border-spacing: 0; border-collapse: separate;">
                        <thead>
                            <tr style="background: #f1f5f9;">
                                <th style="padding: 8px 12px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #64748b; border-radius: 6px 0 0 6px;">Student Name</th>
                                <th style="padding: 8px 12px; text-align: right; font-size: 0.75rem; text-transform: uppercase; color: #64748b; border-radius: 0 6px 6px 0;">Grade</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${group.students.map(s => `
                                <tr>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #334155;">${s.student_name}</td>
                                    <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: var(--primary-color);">${s.grade}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </td>
        `;
        tableBody.appendChild(childTr);
    });
}

window.toggleRow = (id) => {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (!el) return;

    if (el.style.display === 'none') {
        el.style.display = 'table-row';
        if (icon) icon.style.transform = 'rotate(90deg)';
    } else {
        el.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
// --- Debug Utilities ---
window.debugReportData = async () => {
    console.log("--- DEBUG: GRADES DATA ---");
    const { data: grades, error: gError } = await supabaseClient.from('grades').select('*').limit(5);
    if (gError) console.error(gError);
    else console.log(JSON.stringify(grades, null, 2));

    console.log("\n--- DEBUG: STUDENTS DATA ---");
    const { data: students, error: sError } = await supabaseClient.from('students').select('*').limit(5);
    if (sError) console.error(sError);
    else console.log(JSON.stringify(students, null, 2));

    console.log("\n--- DEBUG: GROUPS DATA ---");
    const { data: groups, error: grError } = await supabaseClient.from('student_groups').select('*').limit(5);
    if (grError) console.error(grError);
    else console.log(JSON.stringify(groups, null, 2));
};
