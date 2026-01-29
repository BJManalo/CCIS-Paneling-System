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
                    <span style="font-weight:700; color:var(--primary-color); background:#ebf4ff; padding:2px 10px; border-radius:6px; min-width:50px; text-align:center;">${s.grade !== null ? parseFloat(s.grade) : '-'}</span>
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

//Helper to toggle rows
function toggleRow(id) {
    const row = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (row.style.display === 'none') {
        row.style.display = 'table-row';
        if (icon) icon.style.transform = 'rotate(90deg)';
    } else {
        row.style.display = 'none';
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

// --- Fetch Groups for Dropdown ---
async function fetchGroupsForDropdown(includeGroupId = null) {
    try {
        // Fetch groups with schedules, AND students with their grades
        const { data: groups, error: groupsError } = await supabaseClient
            .from('student_groups')
            .select(`
                *, 
                schedules!inner(id, schedule_type),
                students (
                    id,
                    grades ( id, grade_type )
                )
            `)
            .order('group_name', { ascending: true });

        if (groupsError) throw groupsError;

        fetchedGroups = groups;

        const select = document.getElementById('gradeGroupId');
        select.innerHTML = '<option value="">Select Group</option>';

        groups.forEach(group => {
            if (!group.schedules || group.schedules.length === 0) return;

            group.schedules.forEach(schedule => {
                const currentType = schedule.schedule_type;
                const totalStudents = group.students.length;
                if (totalStudents === 0) return;

                // Count graded students for this type
                const gradedCount = group.students.filter(s =>
                    s.grades && s.grades.some(g => g.grade_type === currentType)
                ).length;

                // Filter out fully graded ones unless editing
                const isEditingThisGroup = (includeGroupId && group.id == includeGroupId);
                if (gradedCount === totalStudents && !isEditingThisGroup) {
                    return;
                }

                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = `${group.group_name} (${currentType})`;
                option.dataset.scheduleType = currentType;
                select.appendChild(option);
            });
        });
    } catch (err) {
        console.error("Error loading groups:", err);
    }
}

// --- Handle Group Selection & Load Students ---
async function handleGroupChange() {
    const select = document.getElementById('gradeGroupId');
    const groupId = select.value;
    const gradingArea = document.getElementById('gradingArea');

    const selectedOption = select.options[select.selectedIndex];
    // If "Select Group" is chosen, selectedOption might not have dataset. Default safe.
    const currentScheduleType = selectedOption && selectedOption.dataset.scheduleType ? selectedOption.dataset.scheduleType : '';

    // Store it for saving later
    document.getElementById('gradeForm').dataset.currentScheduleType = currentScheduleType;

    if (!groupId) {
        gradingArea.innerHTML = '<p class="text-light" style="font-size:0.9em;">Select a group to load students.</p>';
        return;
    }

    gradingArea.innerHTML = '<p>Loading students...</p>';

    try {
        // Fetch students AND their existing grade
        const { data: students, error } = await supabaseClient
            .from('students')
            .select(`
                id, 
                full_name,
                grades (
                    id, 
                    grade,
                    grade_type
                )
            `)
            .eq('group_id', groupId);

        if (error) throw error;

        gradingArea.innerHTML = `
            <div style="margin-bottom:15px; padding:10px; background:#e3f2fd; border-radius:8px; color:#1565c0; font-size:0.9em; font-weight:500;">
                Grading for: ${currentScheduleType || 'Defense'}
            </div>
        `;

        if (!students || students.length === 0) {
            gradingArea.innerHTML += '<p>No students found in this group.</p>';
            return;
        }

        students.forEach(student => {
            const gradeRecord = (student.grades)
                ? student.grades.find(g => g.grade_type === currentScheduleType)
                : null;

            const gradeValue = (gradeRecord && (gradeRecord.grade || gradeRecord.grade === 0)) ? gradeRecord.grade : '';
            const gradeId = gradeRecord ? gradeRecord.id : '';

            const div = document.createElement('div');
            div.className = 'student-grade-row';
            div.style.cssText = 'background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between;';

            div.innerHTML = `
                <div style="flex: 1;">
                    <h4 style="margin: 0; color: #333;">${student.full_name}</h4>
                </div>
                
                <input type="hidden" name="studentId" value="${student.id}">
                <input type="hidden" name="gradeId" value="${gradeId}">
                
                <div class="input-group" style="margin-bottom: 0; width: 150px;">
                    <label style="font-size: 0.8em; margin-bottom: 5px;">Grade</label>
                    <input type="number" step="0.01" class="grade-input" name="grade" value="${gradeValue}" placeholder="0" style="font-weight: bold;">
                </div>
            `;
            gradingArea.appendChild(div);
        });

    } catch (err) {
        console.error('Error loading students:', err);
        gradingArea.innerHTML = '<p>Error loading students.</p>';
    }
}

// --- Save Grades ---
async function saveGrades(event) {
    if (event) event.preventDefault();

    const saveBtn = document.querySelector('.btn-save');
    const originalBtnText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    const currentScheduleType = document.getElementById('gradeForm').dataset.currentScheduleType;

    try {
        const studentRows = document.querySelectorAll('.student-grade-row');
        const updates = [];

        studentRows.forEach(row => {
            const studentId = row.querySelector('[name="studentId"]').value;
            const gradeId = row.querySelector('[name="gradeId"]').value;
            const gradeValue = row.querySelector('[name="grade"]').value;

            const gradeData = {
                student_id: studentId,
                grade: gradeValue === '' ? null : gradeValue,
                grade_type: currentScheduleType
            };

            if (gradeId) {
                updates.push(supabaseClient.from('grades').update(gradeData).eq('id', gradeId));
            } else if (gradeValue !== '') {
                updates.push(supabaseClient.from('grades').insert(gradeData));
            }
        });

        await Promise.all(updates);

        closeGradeModal();
        loadGrades();

    } catch (err) {
        showCustomAlert('Error saving grades: ' + err.message, "Saving Error");
        console.error(err);
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
}

// --- Modal Functions ---
async function openGradeModal() {
    await fetchGroupsForDropdown();
    document.getElementById('gradeForm').reset();
    document.getElementById('gradeGroupId').disabled = false;
    document.getElementById('gradingArea').innerHTML = '<p class="text-light" style="font-size:0.9em;">Select a group to load students.</p>';
    document.querySelector('.modal-title').textContent = 'Input Grades';
    document.getElementById('gradeModal').classList.add('active');
}

async function openGradeModalForEdit(groupId, scheduleType) {
    await fetchGroupsForDropdown(groupId);

    const select = document.getElementById('gradeGroupId');
    select.disabled = true;

    // Find the right option
    let found = false;
    for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (opt.value == groupId && opt.dataset.scheduleType === scheduleType) {
            select.selectedIndex = i;
            found = true;
            break;
        }
    }

    if (!found) {
        // Fallback if odd state
        select.value = groupId;
    }

    await handleGroupChange();

    document.querySelector('.modal-title').textContent = 'Edit Grades';
    document.getElementById('gradeModal').classList.add('active');
}

function closeGradeModal() {
    document.getElementById('gradeModal').classList.remove('active');
    document.getElementById('gradeForm').reset();
}

document.getElementById('gradeModal').addEventListener('click', (e) => {
    if (e.target.id === 'gradeModal') {
        closeGradeModal();
    }
});

// --- Custom Alert Modal Functions ---
function showCustomAlert(message, title = "Notice") {
    const modal = document.getElementById('alertModal');
    const titleEl = document.getElementById('alertTitle');
    const msgEl = document.getElementById('alertMessage');

    if (modal && titleEl && msgEl) {
        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.classList.add('active');

        // Add subtle animation
        const content = modal.querySelector('.modal-content');
        content.style.opacity = '0';
        content.style.transform = 'scale(0.95)';
        setTimeout(() => {
            content.style.opacity = '1';
            content.style.transform = 'scale(1)';
        }, 10);
    } else {
        // Fallback
        alert(message);
    }
}

window.closeAlertModal = () => {
    const modal = document.getElementById('alertModal');
    if (modal) modal.classList.remove('active');
}

document.getElementById('alertModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'alertModal') {
        closeAlertModal();
    }
});

// --- Print Report (Global) ---
window.printReport = () => {
    const typeFilter = document.getElementById('typeFilter').value;
    const sectionFilter = document.getElementById('sectionFilter').value;
    const programFilter = document.getElementById('programFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Validate filters for "Academic Report" style printing
    if (typeFilter === 'All') {
        showCustomAlert("Please select a specific Defense Type to print an Academic Report.", "Report Requirement");
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
        showCustomAlert("No visible grades found for this selection to print.", "No Data Found");
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
                // Remove .00 by just parsing it as a number
                gradeVal = parseFloat(gradeRec.grade);
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
    window.location.href = '../../';
}
