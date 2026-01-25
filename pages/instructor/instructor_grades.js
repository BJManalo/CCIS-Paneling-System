// instructor_grades.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let allGradesData = [];
let fetchedGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    loadGrades();

    // Search and Filter Listeners
    document.getElementById('searchInput').addEventListener('input', renderGrades);
    document.getElementById('typeFilter').addEventListener('change', renderGrades);
    document.getElementById('sectionFilter').addEventListener('change', renderGrades);
    document.getElementById('programFilter').addEventListener('change', renderGrades);
});

// --- Populate Section Filter ---
function populateSectionFilter() {
    const filter = document.getElementById('sectionFilter');
    const sections = [...new Set(allGradesData.map(g => g.section).filter(Boolean))].sort();

    // reset (keep first "All")
    while (filter.options.length > 1) {
        filter.remove(1);
    }

    sections.forEach(sec => {
        const opt = document.createElement('option');
        opt.value = sec;
        opt.textContent = sec;
        filter.appendChild(opt);
    });
}

// --- Load Grades Data ---
async function loadGrades() {
    const tableBody = document.getElementById('gradesTableBody');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">Loading grades...</td></tr>';

    try {
        const { data: groups, error } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                schedules (id, schedule_type),
                students (
                    id,
                    full_name,
                    grades ( grade, grade_type )
                )
            `)
            .order('id', { ascending: false });

        if (error) throw error;

        allGradesData = groups || [];
        populateSectionFilter();
        renderGrades();

    } catch (err) {
        console.error('Error loading grades:', err);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading grades.</td></tr>';
    }
}

// --- Render Grades Table with Filters ---
function renderGrades() {
    const tableBody = document.getElementById('gradesTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('typeFilter').value;
    const sectionFilter = document.getElementById('sectionFilter').value;
    const programFilter = document.getElementById('programFilter').value;

    tableBody.innerHTML = '';

    if (!allGradesData || allGradesData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No scheduled groups found.</td></tr>';
        return;
    }

    let hasVisibleData = false;

    allGradesData.forEach(group => {
        // Search Filter (Group Name or Student Names)
        const matchesSearch = group.group_name.toLowerCase().includes(searchTerm) ||
            group.students.some(s => s.full_name.toLowerCase().includes(searchTerm));

        // Section Filter
        const matchesSection = sectionFilter === 'All' || group.section === sectionFilter;

        // Program Filter
        const matchesProgram = programFilter === 'All' || group.program === programFilter;

        if (!matchesSearch || !matchesSection || !matchesProgram) return;

        if (!group.schedules || group.schedules.length === 0) return;

        group.schedules.forEach(schedule => {
            const schedType = schedule.schedule_type;

            // Type Filter
            if (typeFilter !== 'All' && schedType !== typeFilter) return;

            // Get students/grades for THIS schedule type
            const gradedStudents = group.students.map(s => {
                const g = (s.grades || []).find(gr => gr.grade_type === schedType);
                return {
                    name: s.full_name,
                    grade: g ? g.grade : null,
                    hasGrade: !!(g && (g.grade || g.grade === 0))
                };
            });

            // Check strict "Show only if graded" rule
            const gradedCount = gradedStudents.filter(s => s.hasGrade).length;
            if (gradedCount === 0) return;

            hasVisibleData = true;

            const totalStudents = group.students.length;
            const status = (gradedCount === totalStudents) ? 'Completed' : 'Partial';
            const statusClass = status === 'Completed' ? 'badge-completed' : 'badge-partial';
            const statusIcon = status === 'Completed' ? 'check_circle' : 'pending';

            const program = (group.program || '').toUpperCase();
            let progClass = 'prog-unknown';
            if (program.includes('BSIS')) progClass = 'prog-bsis';
            else if (program.includes('BSIT')) progClass = 'prog-bsit';
            else if (program.includes('BSCS')) progClass = 'prog-bscs';

            let typeClass = 'type-unknown';
            const lowerType = schedType.toLowerCase();
            if (lowerType.includes('title')) typeClass = 'type-title';
            else if (lowerType.includes('pre-oral') || lowerType.includes('preoral')) typeClass = 'type-pre-oral';
            else if (lowerType.includes('final')) typeClass = 'type-final';

            // Create unique ID for collapse
            const collapseId = `collapse-${group.id}-${schedType.replace(/\s+/g, '')}`;

            // --- PARENT ROW ---
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.onclick = () => toggleRow(collapseId);
            row.innerHTML = `
                <td style="font-weight:700; color:var(--primary-dark);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="material-icons-round" style="font-size: 18px; color:var(--text-light); transition: transform 0.2s;" id="icon-${collapseId}">chevron_right</span>
                        ${group.group_name}
                    </div>
                </td>
                <td><span class="type-badge ${typeClass}">${schedType}</span></td>
                <td><span class="prog-badge ${progClass}">${program}</span></td>
                <td>
                    <span class="badge ${statusClass}">
                        <span class="material-icons-round" style="font-size:14px;">${statusIcon}</span>
                        ${status} (${gradedCount}/${totalStudents})
                    </span>
                </td>
                <td>
                    <div style="display:flex; gap: 5px;">
                        <button class="action-btn edit" onclick="event.stopPropagation(); openGradeModalForEdit(${group.id}, '${schedType}')" title="Edit Grades">
                            <span class="material-icons-round">edit</span>
                        </button>
                        <button class="action-btn" onclick="event.stopPropagation(); printGroup(${group.id}, '${schedType}')" title="Print Group Grades" style="color: var(--primary-color); background: #eff6ff;">
                            <span class="material-icons-round">print</span>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(row);

            // --- CHILD ROW (DETAILS) ---
            const detailRow = document.createElement('tr');
            detailRow.id = collapseId;
            detailRow.className = 'detail-row';
            detailRow.style.display = 'none'; // Hidden by default
            detailRow.style.background = '#f8fafc';

            // Construct student list HTML
            const studentListHtml = gradedStudents.map(s => `
                <div style="display:flex; justify-content:space-between; padding: 10px 0; border-bottom: 1px solid #edf2f7;">
                    <span style="font-weight:500; color:#4a5568;">${s.name}</span>
                    <span style="font-weight:700; color:var(--primary-color); background:#ebf4ff; padding:2px 10px; border-radius:6px; min-width:50px; text-align:center;">${s.grade !== null ? s.grade : '-'}</span>
                </div>
            `).join('');

            detailRow.innerHTML = `
                <td colspan="5" style="padding: 20px 40px;">
                    <div style="max-width: 500px; background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; box-shadow: 0 2px 10px rgba(0,0,0,0.02);">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:15px; color:var(--primary-dark);">
                            <span class="material-icons-round">assignment_ind</span>
                            <strong style="font-size:0.95rem;">Student Grades Summary</strong>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            ${studentListHtml}
                        </div>
                    </div>
                </td>
            `;
            tableBody.appendChild(detailRow);
        });
    });

    if (!hasVisibleData) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No grades found matching your criteria.</td></tr>';
    }
}

// ... existing toggleRow, fetchGroupsForDropdown, handleGroupChange, saveGrades, openGradeModal, openGradeModalForEdit, closeGradeModal ... 
// (I will keep them, but since this tool replaces a block, I must ensure I don't cut them off incorrectly. 
// The target range was lines 18-209. I ended replacement at 209 in previous calls.
// The user has cursor at 600.
// Let's replace the whole `renderGrades` and `printReport`.

// --- Print Report (Global) ---
window.printReport = () => {
    const typeFilter = document.getElementById('typeFilter').value;
    const sectionFilter = document.getElementById('sectionFilter').value;
    const programFilter = document.getElementById('programFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Validate filters for "Academic Report" style printing
    if (typeFilter === 'All') {
        alert("Please select a specific Defense Type to print an Academic Report.");
        return;
    }

    // Filter Logic
    const groupsToPrint = [];

    for (const group of allGradesData) {
        const matchesSearch = group.group_name.toLowerCase().includes(searchTerm) ||
            group.students.some(s => s.full_name.toLowerCase().includes(searchTerm));
        const matchesSection = sectionFilter === 'All' || group.section === sectionFilter;
        const matchesProgram = programFilter === 'All' || group.program === programFilter;

        if (!matchesSearch || !matchesSection || !matchesProgram) continue;
        if (!group.schedules) continue;

        group.schedules.forEach(schedule => {
            if (schedule.schedule_type !== typeFilter) return;

            const gradedCount = group.students.filter(s =>
                s.grades && s.grades.some(g => g.grade_type === schedule.schedule_type && g.grade !== null)
            ).length;

            if (gradedCount > 0) {
                groupsToPrint.push({
                    group: group,
                    scheduleType: schedule.schedule_type
                });
            }
        });
    }

    if (groupsToPrint.length === 0) {
        alert("No visible grades found for this selection to print.");
        return;
    }

    // Construct Title: "[Program?] [Type] Defense Academic Report - Section [Section]"
    // e.g. "BSIS Title Defense Academic Report - Section E"

    let reportTitle = "";
    if (programFilter !== 'All') {
        reportTitle += `${programFilter} `;
    }
    reportTitle += `${typeFilter} Academic Report`;

    if (sectionFilter !== 'All') {
        reportTitle += ` - Section ${sectionFilter}`;
    } else {
        reportTitle += ` - All Sections`;
    }

    const printHeader = document.querySelector('#printableArea .print-header');
    if (printHeader) printHeader.style.display = 'block';

    generatePrintTable(groupsToPrint, reportTitle);
    window.print();

    if (printHeader) printHeader.style.display = 'none';
};

// --- Print Single Group ---
window.printGroup = (groupId, scheduleType) => {
    const group = allGradesData.find(g => g.id === groupId);
    if (!group) return;

    const printHeader = document.querySelector('#printableArea .print-header');
    if (printHeader) printHeader.style.display = 'block';

    const data = [{
        group: group,
        scheduleType: scheduleType
    }];

    // Similar format for single group
    const title = `${scheduleType} Academic Report - Section ${group.section || 'N/A'}`;

    generatePrintTable(data, title);
    window.print();

    if (printHeader) printHeader.style.display = 'none';
};

// --- Table Generator ---
function generatePrintTable(dataList, reportTitle) {
    const printContent = document.getElementById('printContent');

    // Explicitly find and set the header title
    const titleEl = document.getElementById('printReportTitle');
    if (titleEl) {
        // Clean up old subtitle if any
        const oldSub = document.getElementById('dynamicSubtitle');
        if (oldSub) oldSub.remove();

        titleEl.style.color = '#0f766e'; // Teal-700
        titleEl.style.fontSize = '16px'; // Slightly smaller/sharper
        titleEl.style.fontWeight = '700'; // Bold
        titleEl.style.marginTop = '10px';
        titleEl.style.fontFamily = "sans-serif";
        titleEl.style.textTransform = 'none';
        titleEl.style.display = 'block'; // Ensure visibility
        titleEl.textContent = reportTitle;
    }

    // Set Date
    const dateEl = document.getElementById('printDate');
    if (dateEl) {
        dateEl.innerText = `Generated on: ${new Date().toLocaleString()}`;
    }

    // Table Columns: GROUP NAME | DEFENSE TYPE | STUDENT NAME | PROGRAM | YEAR | SECTION | GRADE

    let html = `
        <table style="width: 100%; border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; margin-top: 20px; color: black;">
            <thead>
                <tr style="background-color: #f8fafc; border: 1px solid #cbd5e1;">
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-weight: 700; width: 15%; color: #475569;">GROUP NAME</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; width: 15%; color: #475569;">DEFENSE TYPE</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: left; font-weight: 700; width: 25%; color: #475569;">STUDENT NAME</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; width: 10%; color: #475569;">PROGRAM</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; width: 10%; color: #475569;">YEAR</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; width: 10%; color: #475569;">SECTION</th>
                    <th style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; width: 15%; color: #475569;">GRADE</th>
                </tr>
            </thead>
            <tbody>
    `;

    dataList.forEach(item => {
        const { group, scheduleType } = item;
        const students = group.students || [];

        students.forEach(student => {
            const gradeRec = student.grades ? student.grades.find(g => g.grade_type === scheduleType) : null;
            // Ensure grade has 2 decimal places if present
            let gradeVal = '-';
            if (gradeRec && gradeRec.grade !== null) {
                gradeVal = parseFloat(gradeRec.grade).toFixed(2);
            }

            html += `
                <tr>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #1e293b;">${group.group_name}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; color: #1e293b; text-transform: uppercase; font-size: 10px; font-weight: 700;">${scheduleType}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: 700; color: #1e293b;">${student.full_name}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; color: #1e293b;">${group.program || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; color: #1e293b;">${group.year_level || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; color: #1e293b;">${group.section || '-'}</td>
                    <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: 700; color: #2563eb;">${gradeVal}</td>
                </tr>
             `;
        });
    });

    html += `</tbody></table>`;
    printContent.innerHTML = html;
}

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}
