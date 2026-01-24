// instructor_grades.js

// --- Supabase Configuration ---
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// State
let fetchedGroups = [];

document.addEventListener('DOMContentLoaded', () => {
    loadGrades();
});

// --- Load Grades List ---
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

        tableBody.innerHTML = '';

        if (!groups || groups.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No scheduled groups found.</td></tr>';
            return;
        }

        let hasData = false;

        groups.forEach(group => {
            if (!group.schedules || group.schedules.length === 0) return;

            group.schedules.forEach(schedule => {
                const schedType = schedule.schedule_type;

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

                hasData = true;

                const totalStudents = group.students.length;
                const status = (gradedCount === totalStudents) ? 'Completed' : 'Partial';
                const statusColor = status === 'Completed' ? '#4CAF50' : '#FF9800';

                // Create unique ID for collapse
                const collapseId = `collapse-${group.id}-${schedType.replace(/\s+/g, '')}`;

                // --- PARENT ROW ---
                const row = document.createElement('tr');
                row.style.cursor = 'pointer';
                row.onclick = () => toggleRow(collapseId);
                row.innerHTML = `
                    <td style="font-weight:600; color:var(--primary-color);">
                        <span class="material-icons-round" style="vertical-align: middle; font-size: 16px; margin-right:5px; transition: transform 0.2s;" id="icon-${collapseId}">chevron_right</span>
                        ${group.group_name}
                    </td>
                    <td><span style="color:var(--accent-color); font-weight:500;">${schedType}</span></td>
                    <td>${group.program} ${group.year_level}-${group.section}</td>
                    <td><span style="color: ${statusColor}; font-weight: 500;">${status} (${gradedCount}/${totalStudents})</span></td>
                    <td>
                        <button class="edit-btn" onclick="event.stopPropagation(); openGradeModalForEdit(${group.id}, '${schedType}')" style="background:none; border:none; cursor:pointer; color:var(--primary-color);" title="Edit Grades">
                            <span class="material-icons-round">edit</span>
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);

                // --- CHILD ROW (DETAILS) ---
                const detailRow = document.createElement('tr');
                detailRow.id = collapseId;
                detailRow.style.display = 'none'; // Hidden by default
                detailRow.style.background = '#f9f9f9';

                // Construct student list HTML
                const studentListHtml = gradedStudents.map(s => `
                    <div style="display:flex; justify-content:space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
                        <span>${s.name}</span>
                        <span style="font-weight:bold;">${s.grade !== null ? s.grade : 'N/A'}</span>
                    </div>
                `).join('');

                detailRow.innerHTML = `
                    <td colspan="5" style="padding: 10px 20px;">
                        <div style="font-size: 0.9em; color: #555;">
                            <strong>Student Grades:</strong>
                            <div style="margin-top: 5px; max-width: 400px;">
                                ${studentListHtml}
                            </div>
                        </div>
                    </td>
                `;
                tableBody.appendChild(detailRow);
            });
        });

        if (!hasData) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No graded items found. Use the + button to start grading.</td></tr>';
        }

    } catch (err) {
        console.error('Error loading grades:', err);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading grades.</td></tr>';
    }
}

// Helper to toggle rows
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
            // A group might have multiple schedules (Title, Pre Oral, Final)
            // We need to check EACH one.
            if (!group.schedules || group.schedules.length === 0) return;

            group.schedules.forEach(schedule => {
                const currentType = schedule.schedule_type;

                // Logic: Check if fully graded for THIS specific schedule type
                const totalStudents = group.students.length;
                if (totalStudents === 0) return;

                // Count how many students have a grade matching THIS schedule type
                const gradedCount = group.students.filter(s =>
                    s.grades && s.grades.some(g => g.grade_type === currentType)
                ).length;

                // If all students are graded for this type, HIDE from dropdown
                // UNLESS this is the group we are currently editing (includeGroupId)
                const isEditingThisGroup = (includeGroupId && group.id == includeGroupId);

                if (gradedCount === totalStudents && !isEditingThisGroup) {
                    return;
                }

                const option = document.createElement('option');
                option.value = group.id;
                // Show distinct type in dropdown
                option.textContent = `${group.group_name} (${currentType})`;
                // Store type in data attribute so we know which one to grade
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

    // Get schedule type directly from the selected option (we stored it there!)
    // This handles cases where one group has multiple options (e.g., Title AND Pre Oral)
    const selectedOption = select.options[select.selectedIndex];
    const currentScheduleType = selectedOption.dataset.scheduleType || 'Title Defense';

    // Store it for saving later
    document.getElementById('gradeForm').dataset.currentScheduleType = currentScheduleType;

    if (!groupId) {
        gradingArea.innerHTML = '<p class="text-light">Select a group to load students.</p>';
        return;
    }

    gradingArea.innerHTML = '<p>Loading students...</p>';

    try {
        // Fetch students AND their existing grade if any
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
            // Find grade matching the current schedule type. 
            // STRICT MATCH ONLY: If not found, it means it's not graded yet for this type.
            // We do NOT default to student.grades[0] anymore.
            const gradeRecord = (student.grades)
                ? student.grades.find(g => g.grade_type === currentScheduleType)
                : null;

            const gradeValue = gradeRecord ? gradeRecord.grade : ''; // Show empty/0 if new
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
                    <input type="number" step="0.01" class="grade-input" name="grade" value="${gradeValue}" placeholder="0.00" style="font-weight: bold;">
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
async function saveGrades(e) {
    e.preventDefault();

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
                grade: gradeValue || null,
                grade_type: currentScheduleType // Save the type!
            };

            // Check if we have a grade record
            if (gradeId) {
                // Update
                updates.push(
                    supabaseClient
                        .from('grades')
                        .update(gradeData)
                        .eq('id', gradeId)
                );
            } else if (gradeValue) {
                // Insert only if there's a value
                updates.push(
                    supabaseClient
                        .from('grades')
                        .insert(gradeData)
                );
            }
        });

        await Promise.all(updates);

        closeGradeModal();
        loadGrades();

    } catch (err) {
        alert('Error saving grades: ' + err.message);
        console.error(err);
    } finally {
        saveBtn.textContent = originalBtnText;
        saveBtn.disabled = false;
    }
}

// --- Modal Functions ---
// --- Modal Functions ---

// Open Modal for NEW Grading (via FAB)
async function openGradeModal() {
    await fetchGroupsForDropdown(); // Normal fetch (hides completed)
    document.getElementById('gradeForm').reset();
    document.getElementById('gradeGroupId').disabled = false; // Re-enable for new
    document.getElementById('gradingArea').innerHTML = '<p class="text-muted">Select a group to load students.</p>';
    document.querySelector('.modal-title').textContent = 'Input Grades';
    document.getElementById('gradeModal').classList.add('active');
}

// Open Modal for EDITING (via Pencil Icon)
async function openGradeModalForEdit(groupId, scheduleType) {
    // Pass groupId to FORCE it to appear in the list even if it's completed
    await fetchGroupsForDropdown(groupId);

    // Select the group in the dropdown
    const select = document.getElementById('gradeGroupId');

    // Lock the dropdown so they can't change groups while in "Edit Mode"
    select.disabled = true;

    // Find the option
    let matchedOptionIndex = -1;
    for (let i = 0; i < select.options.length; i++) {
        const opt = select.options[i];
        if (opt.value == groupId && opt.dataset.scheduleType === scheduleType) {
            select.selectedIndex = i;
            matchedOptionIndex = i;
            break;
        }
    }

    if (matchedOptionIndex === -1 && groupId) {
        select.value = groupId;
    }

    // Load students
    handleGroupChange();

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

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../index.html';
}

