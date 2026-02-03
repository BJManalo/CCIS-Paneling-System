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
        // Get all group IDs that have at least one "Completed" status
        const { data: feedbacks, error: fError } = await supabaseClient
            .from('capstone_feedback')
            .select('group_id')
            .eq('status', 'Completed');

        if (fError || !feedbacks || feedbacks.length === 0) return;

        const uniqueGroupIds = [...new Set(feedbacks.map(f => f.group_id))];

        // Get currently archived IDs to avoid duplicate processing
        const { data: archived, error: aError } = await supabaseClient
            .from('archived_projects')
            .select('group_id');

        const archivedIds = new Set((archived || []).map(a => a.group_id));

        // Process missing ones
        for (const groupId of uniqueGroupIds) {
            if (!archivedIds.has(groupId)) {
                console.log("Found missing archive for Group:", groupId);
                await archiveProject(groupId);
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

        // 2. Fetch Members
        const { data: members } = await supabaseClient
            .from('students')
            .select('name')
            .eq('group_id', groupId);

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
                members: (members || []).map(m => m.name),
                panelists: Array.from(panelSet),
                submissions: submissions,
                annotations: annotationsMap,
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
        const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
        const panels = Array.isArray(item.panelists) ? item.panelists : JSON.parse(item.panelists || '[]');

        row.innerHTML = `
            <td style="font-weight: 700; color: var(--primary-dark); font-size: 0.95rem;">${item.project_title || 'Untitled Project'}</td>
            <td><span class="group-badge">${item.group_name}</span></td>
            <td><div class="member-names" title="${members.join(', ')}">${members.slice(0, 2).join(', ')}${members.length > 2 ? '...' : ''}</div></td>
            <td><div class="panel-names" title="${panels.join(', ')}">${panels.slice(0, 2).join(', ')}${panels.length > 2 ? '...' : ''}</div></td>
            <td style="color: #64748b;">${new Date(item.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td style="text-align: right;">
                <button class="action-btn view" onclick="viewArchiveDetails('${item.id}')" style="padding: 8px; border-radius: 8px;">
                    <span class="material-icons-round" style="font-size: 20px;">visibility</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
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
