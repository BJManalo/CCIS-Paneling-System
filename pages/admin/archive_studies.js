document.addEventListener('DOMContentLoaded', () => {
    loadArchives();
});

let archiveData = [];

async function loadArchives() {
    const tableBody = document.getElementById('archiveTableBody');
    const emptyState = document.getElementById('emptyState');

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">Checking for completed records and initializing archives...</td></tr>';

    try {
        // 1. First, check if there are any "Completed" groups in feedback that ARE NOT archived yet
        await autoSyncMissingArchives();

        // 2. Now fetch and display from the official archive table
        const { data, error } = await supabaseClient
            .from('archived_projects')
            .select('*')
            .order('completed_at', { ascending: false });

        if (error) throw error;

        archiveData = data || [];

        if (archiveData.length === 0) {
            tableBody.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        renderArchiveTable(archiveData);

    } catch (err) {
        console.error("Archive Load Error:", err);
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #ef4444; padding: 40px; font-weight: 600;">Error loading archives.</td></tr>';
    }
}

async function autoSyncMissingArchives() {
    try {
        // 1. Fetch all student groups
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('id');

        if (gError || !groups) return;

        // 2. Fetch all students and their grades
        const { data: students, error: sError } = await supabaseClient
            .from('students')
            .select('id, group_id, grades(grade_type)');

        if (sError || !students) return;

        // 3. Get currently archived IDs to avoid duplicate processing
        const { data: archived, error: aError } = await supabaseClient
            .from('archived_projects')
            .select('group_id');

        const archivedIds = new Set((archived || []).map(a => a.group_id));

        // 4. Group students by group_id and check for completeness
        const groupStudentsMap = {};
        students.forEach(s => {
            if (!groupStudentsMap[s.group_id]) groupStudentsMap[s.group_id] = [];
            groupStudentsMap[s.group_id].push(s);
        });

        for (const groupId of Object.keys(groupStudentsMap)) {
            if (archivedIds.has(parseInt(groupId))) continue;

            const groupStudents = groupStudentsMap[groupId];
            const isComplete = groupStudents.every(s => {
                const types = (s.grades || []).map(g => g.grade_type);
                return types.includes('Title Defense') &&
                    types.includes('Pre-Oral Defense') &&
                    types.includes('Final Defense');
            });

            if (isComplete) {
                console.log("Archiving Group due to grade completion:", groupId);
                await archiveProject(parseInt(groupId));
            }
        }
    } catch (e) {
        console.warn("Auto-sync skipped:", e);
    }
}

async function archiveProject(groupId) {
    try {
        // 1. Fetch Group Details
        const { data: group, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (gError || !group) return false;

        // 2. Fetch Members and their Grades
        const { data: membersData } = await supabaseClient
            .from('students')
            .select('id, full_name, grades(grade, grade_type)')
            .eq('group_id', groupId);

        const members = (membersData || []).map(m => m.full_name);
        const gradesSnapshot = (membersData || []).map(m => ({
            name: m.full_name,
            grades: m.grades || []
        }));

        // 3. Fetch Panelists from Schedules
        const { data: schedules } = await supabaseClient
            .from('schedules')
            .select('panel1, panel2, panel3, panel4, panel5')
            .eq('group_id', groupId);

        const panelSet = new Set();
        if (schedules) {
            schedules.forEach(s => {
                if (s.panel1) panelSet.add(s.panel1);
                if (s.panel2) panelSet.add(s.panel2);
                if (s.panel3) panelSet.add(s.panel3);
                if (s.panel4) panelSet.add(s.panel4);
                if (s.panel5) panelSet.add(s.panel5);
            });
        }

        // 4. Fetch All Annotations
        const { data: annotations } = await supabaseClient
            .from('capstone_annotations')
            .select('*')
            .eq('group_id', groupId);

        // 5. Build Submissions Map
        const submissions = {
            title_link: group.title_link,
            pre_oral_link: group.pre_oral_link,
            final_link: group.final_link,
            project_title: group.project_title
        };

        // 6. Build Annotations Map
        const annotationsMap = {};
        if (annotations) {
            annotations.forEach(a => {
                const type = (a.defense_type || 'unknown').toLowerCase();
                if (!annotationsMap[type]) annotationsMap[type] = {};
                if (!annotationsMap[type][a.file_key]) annotationsMap[type][a.file_key] = {};
                annotationsMap[type][a.file_key][a.user_name] = a.annotated_file_url;
            });
        }

        // 7. Insert into archived_projects
        const { error: archError } = await supabaseClient
            .from('archived_projects')
            .upsert({
                group_id: groupId,
                group_name: group.group_name,
                project_title: group.project_title,
                members: members,
                panelists: Array.from(panelSet),
                submissions: submissions,
                annotations: annotationsMap,
                grades: gradesSnapshot, // Assuming this column exists or can be stored in JSON
                completed_at: new Date().toISOString()
            }, { onConflict: 'group_id' });

        return !archError;
    } catch (err) {
        return false;
    }
}

function renderArchiveTable(data) {
    const tableBody = document.getElementById('archiveTableBody');
    tableBody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
        const panels = Array.isArray(item.panelists) ? item.panelists : JSON.parse(item.panelists || '[]');
        const collapseId = `collapse-${item.id}`;

        row.onclick = () => toggleRow(collapseId);
        row.innerHTML = `
            <td style="font-weight: 700; color: var(--primary-dark); font-size: 0.95rem;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="material-icons-round" style="font-size: 18px; color:#94a3b8; transition: transform 0.2s;" id="icon-${collapseId}">chevron_right</span>
                    ${item.project_title || 'Untitled Project'}
                </div>
            </td>
            <td><span class="group-badge">${item.group_name}</span></td>
            <td><div class="member-names" title="${members.join(', ')}">${members.slice(0, 2).join(', ')}${members.length > 2 ? '...' : ''}</div></td>
            <td><div class="panel-names" title="${panels.join(', ')}">${panels.slice(0, 2).join(', ')}${panels.length > 2 ? '...' : ''}</div></td>
            <td style="color: #64748b;">${new Date(item.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td style="text-align: right;">
                <button class="action-btn view" onclick="event.stopPropagation(); viewArchiveDetails('${item.id}')" style="padding: 8px; border-radius: 8px;">
                    <span class="material-icons-round" style="font-size: 20px;">folder</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);

        // Child row for grades
        const detailRow = document.createElement('tr');
        detailRow.id = collapseId;
        detailRow.style.display = 'none';
        detailRow.style.background = '#f8fafc';

        let gradesHtml = '';
        const gradesData = Array.isArray(item.grades) ? item.grades : JSON.parse(item.grades || '[]');

        if (gradesData.length > 0) {
            gradesHtml = gradesData.map(m => {
                const titleGrade = (m.grades.find(g => g.grade_type === 'Title Defense') || {}).grade || '-';
                const preoralGrade = (m.grades.find(g => (g.grade_type || '').includes('Pre-Oral')) || {}).grade || '-';
                const finalGrade = (m.grades.find(g => g.grade_type === 'Final Defense') || {}).grade || '-';

                return `
                    <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:10px; padding:12px; border-bottom:1px solid #edf2f7; align-items:center;">
                        <span style="font-weight:600; color:#334155;">${m.name}</span>
                        <div style="text-align:center;"><div style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Title</div><div style="font-weight:700; color:var(--primary-color);">${titleGrade}</div></div>
                        <div style="text-align:center;"><div style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Pre-Oral</div><div style="font-weight:700; color:var(--primary-color);">${preoralGrade}</div></div>
                        <div style="text-align:center;"><div style="font-size:10px; color:#94a3b8; text-transform:uppercase;">Final</div><div style="font-weight:700; color:var(--primary-color);">${finalGrade}</div></div>
                    </div>
                `;
            }).join('');
        } else {
            gradesHtml = '<div style="padding:20px; text-align:center; color:#94a3b8;">No grade records found in archive.</div>';
        }

        detailRow.innerHTML = `
            <td colspan="6" style="padding: 0;">
                <div style="padding: 20px 40px; border-left: 4px solid var(--primary-color);">
                    <div style="max-width: 700px; background:white; padding:20px; border-radius:15px; border:1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:15px; color:var(--primary-dark);">
                            <span class="material-icons-round">emoji_events</span>
                            <strong style="font-size:0.95rem;">Graduated Members & Final Grades</strong>
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            ${gradesHtml}
                        </div>
                    </div>
                </div>
            </td>
        `;
        tableBody.appendChild(detailRow);
    });
}

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


function viewArchiveDetails(id) {
    const item = archiveData.find(a => a.id === id);
    if (!item) return;

    const modal = document.getElementById('archiveModal');
    document.getElementById('modalProjectTitle').innerText = item.project_title || 'Untitled Project';
    document.getElementById('modalGroupName').innerText = item.group_name;

    const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
    const panels = Array.isArray(item.panelists) ? item.panelists : JSON.parse(item.panelists || '[]');
    const submissions = typeof item.submissions === 'string' ? JSON.parse(item.submissions || '{}') : item.submissions || {};
    const annotations = typeof item.annotations === 'string' ? JSON.parse(item.annotations || '{}') : item.annotations || {};

    document.getElementById('modalMembers').innerText = members.join(', ');
    document.getElementById('modalPanels').innerText = panels.join(', ');

    const fileGrid = document.getElementById('modalFiles');
    fileGrid.innerHTML = '';

    const fileLabels = {
        'title_link': { label: 'Title Defense', icon: 'description', color: '#3b82f6' },
        'pre_oral_link': { label: 'Pre-Oral Defense', icon: 'article', color: '#f59e0b' },
        'final_link': { label: 'Final Manuscript', icon: 'military_tech', color: '#10b981' }
    };

    Object.keys(fileLabels).forEach(key => {
        const linkVal = submissions[key];
        if (linkVal) {
            let links = {};
            try {
                if (typeof linkVal === 'string' && linkVal.trim().startsWith('{')) links = JSON.parse(linkVal);
                else if (typeof linkVal === 'object') links = linkVal;
                else links = { [fileLabels[key].label]: linkVal };
            } catch (e) { links = { [fileLabels[key].label]: linkVal }; }

            Object.entries(links).forEach(([label, url]) => {
                if (url && url.trim() !== '') {
                    addFileCard(fileGrid, label, url, fileLabels[key].icon, fileLabels[key].label, fileLabels[key].color);
                }
            });
        }
    });

    Object.entries(annotations).forEach(([defType, fileMap]) => {
        Object.entries(fileMap).forEach(([fKey, panelMap]) => {
            Object.entries(panelMap).forEach(([panelName, url]) => {
                const label = `${panelName}'s Feedback`;
                addFileCard(fileGrid, label, url, 'history_edu', defType.toUpperCase(), '#8b5cf6');
            });
        });
    });

    if (fileGrid.innerHTML === '') {
        fileGrid.innerHTML = '<p style="color: #94a3b8; font-style: italic;">No documentation links preserved for this project.</p>';
    }

    modal.style.display = 'flex';
}

function addFileCard(container, label, url, icon, category, color) {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.onclick = () => window.open(url, '_blank');
    card.innerHTML = `
        <div class="icon" style="color: ${color};">
            <span class="material-icons-round">${icon}</span>
        </div>
        <div style="flex: 1;">
            <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">${category}</div>
            <div style="font-size: 0.9rem; font-weight: 700; color: #334155;">${label}</div>
        </div>
        <span class="material-icons-round" style="color: #cbd5e1; font-size: 18px;">open_in_new</span>
    `;
    container.appendChild(card);
}

function closeModal() {
    document.getElementById('archiveModal').style.display = 'none';
}

document.getElementById('searchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = archiveData.filter(item => {
        const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
        return (
            (item.project_title || '').toLowerCase().includes(term) ||
            item.group_name.toLowerCase().includes(term) ||
            members.some(m => m.toLowerCase().includes(term))
        );
    });
    renderArchiveTable(filtered);
});

window.logout = function () {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
};
