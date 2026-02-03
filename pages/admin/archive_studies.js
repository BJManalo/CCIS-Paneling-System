document.addEventListener('DOMContentLoaded', () => {
    loadArchives();
});

let archiveData = [];

async function loadArchives() {
    const tableBody = document.getElementById('archiveTableBody');
    const emptyState = document.getElementById('emptyState');

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">Fetching archives...</td></tr>';

    try {
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

function renderArchiveTable(data) {
    const tableBody = document.getElementById('archiveTableBody');
    tableBody.innerHTML = '';

    data.forEach(item => {
        const row = document.createElement('tr');

        // Members & Panels
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

    // 1. Original Submissions
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

    // 2. Panelist Annotations/Feedback
    Object.entries(annotations).forEach(([defType, fileMap]) => {
        Object.entries(fileMap).forEach(([fKey, panelMap]) => {
            Object.entries(panelMap).forEach(([panelName, url]) => {
                const label = `${panelName}'s Feedback`;
                const category = defType.toUpperCase();
                addFileCard(fileGrid, label, url, 'history_edu', category, '#8b5cf6');
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

// Search Functionality
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

async function syncCompletedGroups() {
    const btn = document.getElementById('syncBtn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round" style="font-size:18px; animation: spin 1s linear infinite;">sync</span> Syncing...';

    try {
        console.log("Checking for 'Completed' feedback...");
        const { data: feedbacks, error } = await supabaseClient
            .from('capstone_feedback')
            .select('group_id')
            .eq('status', 'Completed');

        if (error) throw error;

        if (feedbacks.length === 0) {
            alert("No groups found with 'Completed' status.");
            return;
        }

        const uniqueGroupIds = [...new Set(feedbacks.map(f => f.group_id))];
        console.log(`Found ${uniqueGroupIds.length} unique groups to potentially archive.`);

        let successfulArchivedCount = 0;
        for (const groupId of uniqueGroupIds) {
            const success = await archiveProject(groupId);
            if (success) successfulArchivedCount++;
        }

        if (successfulArchivedCount > 0) {
            alert(`Sync complete! ${successfulArchivedCount} groups archived.`);
            loadArchives();
        } else {
            alert("Sync finished, but no new groups were added to the archive. They might have missing details or are already archived.");
        }

    } catch (err) {
        console.error("Sync Error:", err);
        alert("Error during sync: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function archiveProject(groupId) {
    try {
        console.log("Archiving Group ID:", groupId);
        // 1. Fetch Group Details
        const { data: group, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (gError) {
            console.warn("Could not find group in student_groups table:", groupId, gError);
            return false;
        }

        // 2. Fetch Members
        const { data: members, error: mError } = await supabaseClient
            .from('students')
            .select('name')
            .eq('group_id', groupId);

        if (mError) {
            console.warn("Could not fetch students for group:", groupId, mError);
            return false;
        }

        // 3. Fetch Panelists from Schedules
        const { data: schedules, error: sError } = await supabaseClient
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
        const { data: annotations, error: aError } = await supabaseClient
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
                const type = a.defense_type.toLowerCase();
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
                members: members.map(m => m.name),
                panelists: Array.from(panelSet),
                submissions: submissions,
                annotations: annotationsMap,
                completed_at: new Date()
            }, { onConflict: 'group_id' });

        if (archError) {
            console.error("Database upsert failed for archive:", archError);
            return false;
        }

        return true;
    } catch (err) {
        console.error("Critical Archival Error for Group ID:", groupId, err);
        return false;
    }
}
