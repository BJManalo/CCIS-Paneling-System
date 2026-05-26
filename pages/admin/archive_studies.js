document.addEventListener('DOMContentLoaded', () => {
    loadArchives();
});

let archiveData = [];
let filteredArchiveData = [];
let currentPage = 1;
const rowsPerPage = 15;
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
        filteredArchiveData = [...archiveData];
        renderArchiveTable();

    } catch (err) {
        console.error("Archive Load Error:", err);
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: #ef4444; padding: 40px; font-weight: 600;">Error loading archives.</td></tr>';
    }
}

// Helper to extract a single title string from JSON/Object if needed
function cleanTitle(title, groupName) {
    if (!title) return groupName || 'Untitled Project';
    if (typeof title === 'string' && title.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(title);
            return parsed.title1 || parsed.title2 || parsed.title3 || Object.values(parsed)[0] || title;
        } catch (e) { return title; }
    }
    return title;
}

async function autoSyncMissingArchives() {
    try {
        console.log("%c[ArchiveSync] Starting automatic synchronization...", "color: #3b82f6; font-weight: bold;");

        // 1. Fetch data independently for reliability
        const [gRes, sRes, grRes, aRes] = await Promise.all([
            supabaseClient.from('student_groups').select('id, group_name'),
            supabaseClient.from('students').select('id, group_id, full_name'),
            supabaseClient.from('grades').select('student_id, grade_type, grade'),
            supabaseClient.from('archived_projects').select('group_id')
        ]);

        if (gRes.error || sRes.error || grRes.error) {
            console.error("[ArchiveSync] Error fetching data:", gRes.error || sRes.error || grRes.error);
            return;
        }

        const groups = gRes.data || [];
        const students = sRes.data || [];
        const allGrades = grRes.data || [];
        const archivedIds = new Set((aRes.data || []).map(a => a.group_id));

        for (const group of groups) {
            const groupStudents = students.filter(s => s.group_id === group.id);
            if (groupStudents.length === 0) continue;

            console.log(`%c[ArchiveSync] Checking Group: ${group.group_name}`, "color: #6366f1;");

            let isGroupComplete = true;

            groupStudents.forEach(student => {
                const sGrades = allGrades.filter(g => g.student_id === student.id && g.grade !== null);
                const types = sGrades.map(g => (g.grade_type || '').toLowerCase());

                // Fuzzy matching to handle "Pre-Oral", "Pre Oral", "Preoral", etc.
                const hasTitle = types.some(t => t.includes('title'));
                // DATABASE FIX: Looking for "Pre Oral" or "Preoral"
                const hasPreOral = types.some(t => t.includes('pre') && t.includes('oral')) || types.some(t => t.includes('preoral'));
                const hasFinal = types.some(t => t.includes('final'));

                if (!hasTitle || !hasPreOral || !hasFinal) {
                    isGroupComplete = false;
                    const missing = [];
                    if (!hasTitle) missing.push("Title");
                    if (!hasPreOral) missing.push("Pre Oral");
                    if (!hasFinal) missing.push("Final");
                    console.log(`%c   -> Student: ${student.full_name} is missing: ${missing.join(', ')}`, "color: #f59e0b;");
                }
            });

            // We now update archives even if they exist, to pick up "Revised" uploads
            if (isGroupComplete) {
                console.log(`%c[ArchiveSync] Synchronizing ${group.group_name}...`, "color: #22c55e; font-weight: bold;");
                const success = await archiveProject(group.id);
                if (success) console.log(`%c[ArchiveSync] Successfully synced ${group.group_name}`, "color: #22c55e;");
                else console.error(`[ArchiveSync] Failed to sync ${group.group_name}.`);
            }
        }
    } catch (e) {
        console.warn("[ArchiveSync] Unexpected error:", e);
    }
}

async function archiveProject(groupId) {
    try {
        const { data: group, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (gError || !group) return false;

        const { data: studentsData } = await supabaseClient
            .from('students')
            .select('id, full_name')
            .eq('group_id', groupId);

        const studentIds = (studentsData || []).map(s => s.id);
        const { data: gradesData } = await supabaseClient
            .from('grades')
            .select('*')
            .in('student_id', studentIds);

        const gradesSnapshot = (studentsData || []).map(s => ({
            name: s.full_name,
            grades: (gradesData || []).filter(g => g.student_id === s.id)
        }));

        const { data: schedules } = await supabaseClient
            .from('schedules')
            .select('panel1, panel2, panel3, panel4, panel5')
            .eq('group_id', groupId);

        const panelSet = new Set();
        if (schedules) {
            schedules.forEach(s => {
                ['panel1', 'panel2', 'panel3', 'panel4', 'panel5'].forEach(p => {
                    if (s[p]) panelSet.add(s[p]);
                });
            });
        }

        // --- IMPROVED: RESOLVE APPROVED TITLE ---
        let resolvedTitle = group.group_name;
        try {
            const pTitles = typeof group.project_title === 'string' ? JSON.parse(group.project_title || '{}') : group.project_title || {};
            const { data: fb } = await supabaseClient
                .from('capstone_feedback')
                .select('file_key, status')
                .eq('group_id', groupId)
                .eq('defense_type', 'Title Defense');

            const approvedEntry = (fb || []).find(f => (f.status || '').includes('Approved') || f.status === 'Completed');
            if (approvedEntry && pTitles[approvedEntry.file_key]) {
                resolvedTitle = pTitles[approvedEntry.file_key];
            } else {
                resolvedTitle = cleanTitle(group.project_title, group.group_name);
            }
        } catch (e) {
            resolvedTitle = cleanTitle(group.project_title, group.group_name);
        }

        const submissions = {
            title_link: group.title_link,
            pre_oral_link: group.pre_oral_link,
            final_link: group.final_link,
            project_title: group.project_title,
            resolved_title: resolvedTitle, // Store for easy rendering
            grades_snapshot: gradesSnapshot
        };

        // 7. Manual Upsert
        const { data: existing } = await supabaseClient
            .from('archived_projects')
            .select('id')
            .eq('group_id', groupId)
            .single();

        const archivePayload = {
            group_id: groupId,
            group_name: group.group_name,
            project_title: resolvedTitle, // Saved as the actual string now
            members: (studentsData || []).map(s => s.full_name),
            panelists: Array.from(panelSet),
            submissions: submissions,
            completed_at: new Date().toISOString()
        };

        if (existing) {
            await supabaseClient.from('archived_projects').update(archivePayload).eq('id', existing.id);
        } else {
            await supabaseClient.from('archived_projects').insert(archivePayload);
        }

        return true;
    } catch (err) {
        console.error("[ArchiveProject] Exception:", err);
        return false;
    }
}

function renderArchiveTable() {
    const data = filteredArchiveData;
    const tableBody = document.getElementById('archiveTableBody');
    tableBody.innerHTML = '';

    // --- Pagination Logic ---
    const totalPages = Math.ceil(data.length / rowsPerPage);
    if (currentPage > totalPages && totalPages > 0) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginatedData = data.slice(startIndex, startIndex + rowsPerPage);

    paginatedData.forEach(item => {
        const row = document.createElement('tr');
        row.className = 'archive-row';
        row.style.cursor = 'pointer';
        const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
        const panels = Array.isArray(item.panelists) ? item.panelists : JSON.parse(item.panelists || '[]');
        const displaysTitle = cleanTitle(item.project_title || item.group_name);

        const fullMembers = members.join(', ');
        const fullPanels = panels.join(', ');

        row.onclick = () => viewArchiveDetails(item.id);
        row.innerHTML = `
            <td style="font-weight: 700; color: #1e293b; font-size: 0.9rem; max-width: 300px;">
                <div style="display:flex; align-items:flex-start; gap:10px;">
                    <span class="material-icons-round" style="font-size: 20px; color:#cbd5e1;">description</span>
                    <span style="line-height: 1.4;">${displaysTitle}</span>
                </div>
            </td>
            <td><span class="group-badge">${item.group_name}</span></td>
            <td title="${fullMembers}"><div class="member-names">${members.slice(0, 2).join(', ')}${members.length > 2 ? '...' : ''}</div></td>
            <td title="${fullPanels}"><div class="panel-names">${panels.slice(0, 2).join(', ')}${panels.length > 2 ? '...' : ''}</div></td>
            <td style="color: #64748b; font-size: 0.85rem;">${new Date(item.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</td>
            <td style="text-align: right;">
                <button class="action-btn view" onclick="event.stopPropagation(); viewArchiveDetails('${item.id}')" style="padding: 10px; border-radius: 12px; background: #f1f5f9; color: #475569;">
                    <span class="material-icons-round" style="font-size: 20px;">folder_open</span>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    updatePaginationUI(totalPages);
}

function updatePaginationUI(totalPages) {
    let paginationContainer = document.querySelector('.pagination');
    if (!paginationContainer) {
        // Create if it doesn't exist
        const tableContainer = document.querySelector('.table-container');
        if (tableContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.className = 'pagination';
            paginationContainer.style.justifyContent = 'flex-end';
            tableContainer.after(paginationContainer);
        } else {
            return;
        }
    }

    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }

    paginationContainer.style.display = 'flex';
    
    paginationContainer.innerHTML = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage - 1})"`}>Previous</button>
        <span class="page-number active">${currentPage}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePage(${currentPage + 1})"`}>Next</button>
    `;
}

window.changePage = (newPage) => {
    currentPage = newPage;
    renderArchiveTable();
};

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
    // CLEAN TITLE FOR MODAL
    document.getElementById('modalProjectTitle').innerText = cleanTitle(item.project_title || item.group_name);
    document.getElementById('modalGroupName').innerText = item.group_name;

    const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
    const panels = Array.isArray(item.panelists) ? item.panelists : JSON.parse(item.panelists || '[]');
    const subData = typeof item.submissions === 'string' ? JSON.parse(item.submissions || '{}') : item.submissions || {};
    const annotations = typeof item.annotations === 'string' ? JSON.parse(item.annotations || '{}') : item.annotations || {};

    // Modal names should be displayed as a clear list
    document.getElementById('modalMembers').innerHTML = members.map(m => `<div style="margin-bottom:4px;">• ${m}</div>`).join('');
    document.getElementById('modalPanels').innerHTML = panels.map(p => `<div style="margin-bottom:4px;">• ${p}</div>`).join('');

    const fileGrid = document.getElementById('modalFiles');
    fileGrid.innerHTML = '';

    const catInfo = {
        'title_link': { label: 'Title Defense', icon: 'description', color: '#3b82f6' },
        'pre_oral_link': { label: 'Pre Oral Defense', icon: 'article', color: '#f59e0b' },
        'final_link': { label: 'Final Manuscript', icon: 'military_tech', color: '#10b981' }
    };

    // Helper to get pretty label for titles and chapters
    const getPrettyLabel = (key, rawJSONTitles) => {
        if (!key) return "Document";

        // Clean key if it's a revision
        const cleanKey = key.replace('_revised', '');

        if (cleanKey.startsWith('title')) {
            try {
                const titles = typeof rawJSONTitles === 'string' ? JSON.parse(rawJSONTitles) : rawJSONTitles;
                return (titles && titles[cleanKey]) ? titles[cleanKey] : "Project Title";
            } catch (e) { return "Project Title"; }
        }
        if (cleanKey.match(/^ch\d+$/)) return `Manuscript - Chapter ${cleanKey.replace('ch', '')}`;
        return cleanKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    Object.keys(catInfo).forEach(catKey => {
        const linkVal = subData[catKey];
        if (linkVal) {
            let links = {};
            try {
                if (typeof linkVal === 'string' && linkVal.trim().startsWith('{')) links = JSON.parse(linkVal);
                else if (typeof linkVal === 'object') links = linkVal;
                else links = { [catInfo[catKey].label]: linkVal };
            } catch (e) { links = { [catInfo[catKey].label]: linkVal }; }

            Object.entries(links).forEach(([fileKey, url]) => {
                if (url && url.toString().trim() !== '' && url !== "null") {
                    const lowKey = fileKey.toLowerCase();
                    const isRevisionKey = lowKey.includes('revised');

                    let isRelevant = false;

                    if (catKey === 'title_link' && lowKey.startsWith('title')) {
                        isRelevant = true;
                    } else if ((catKey === 'pre_oral_link' || catKey === 'final_link') && lowKey.match(/^ch[1-5]/)) {
                        isRelevant = true;
                    }

                    if (isRelevant) {
                        let prettyLabel = getPrettyLabel(fileKey, subData.project_title);
                        if (isRevisionKey) {
                            prettyLabel += ' (Revised)';
                        }
                        addFileCard(fileGrid, prettyLabel, url, catInfo[catKey].icon, catInfo[catKey].label, catInfo[catKey].color);
                    }
                }
            });
        }
    });

    // Panel feedback (annotations) removed as requested

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
    filteredArchiveData = archiveData.filter(item => {
        const members = Array.isArray(item.members) ? item.members : JSON.parse(item.members || '[]');
        return (
            (item.project_title || '').toLowerCase().includes(term) ||
            item.group_name.toLowerCase().includes(term) ||
            members.some(m => m.toLowerCase().includes(term))
        );
    });
    currentPage = 1;
    renderArchiveTable();
});

window.logout = function () {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
};
