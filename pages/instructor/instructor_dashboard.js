
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allCapstoneFeedback = []; // Added
let filteredGroups = [];
let currentCategory = 'ALL'; // 'ALL', 'APPROVED', 'REJECTED', 'COMPLETED'
let instructorName = '';
let displayRows = [];

// PDF Viewer State
// PDF Viewer State
let currentViewerFileKey = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || (loginUser.role !== 'Instructor' && loginUser.role !== 'Instructor/Adviser')) {
        window.location.href = '../../';
        return;
    }
    instructorName = loginUser.full_name || '';

    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        const { data: groups, error: gError } = await supabaseClient
            .from('student_groups')
            .select('*');

        if (gError) throw gError;
        allGroups = groups || [];

        // Fetch all defense statuses
        const { data: statuses, error: sError } = await supabaseClient
            .from('defense_statuses')
            .select('*');

        if (sError) throw sError;
        allDefenseStatuses = statuses || [];

        // Fetch students
        const { data: students, error: stdError } = await supabaseClient
            .from('students')
            .select('*');

        if (stdError) throw stdError;
        allStudents = students || [];

        console.log('Instructor Name:', instructorName);
        console.log('Total Groups:', allGroups.length);
        console.log('Adviser Names in DB:', [...new Set(allGroups.map(g => g.adviser))]);

        // Fetch capstone feedback
        const { data: feedback, error: fError } = await supabaseClient
            .from('capstone_feedback')
            .select('*');
        if (fError) console.error('Error fetching feedback:', fError);
        allCapstoneFeedback = feedback || [];

        // Populate Section Filter
        populateSectionFilter();

        // Initial Count Update
        applyDashboardFilters();

    } catch (err) {
        console.error('Error fetching dashboard data:', err);
    }
}

function populateSectionFilter() {
    const sectionFilter = document.getElementById('sectionFilter');

    // Use allGroups for section filtering to allow Instructor to see all sections
    const sections = [...new Set(allGroups.map(g => g.section).filter(Boolean))].sort();

    sections.forEach(sec => {
        const option = document.createElement('option');
        option.value = sec;
        option.textContent = sec;
        sectionFilter.appendChild(option);
    });
}

window.setCategoryFilter = (category) => {
    if (currentCategory === category) {
        currentCategory = 'ALL';
    } else {
        currentCategory = category;
    }

    // Visual feedback
    document.querySelectorAll('.chart-card').forEach(card => {
        card.style.border = '1px solid #f0f0f0';
        card.style.transform = 'none';
        card.style.boxShadow = '0 2px 10px rgba(0,0,0,0.05)';
    });

    if (currentCategory !== 'ALL') {
        const titleMap = { 'APPROVED': 'Approved Titles', 'REJECTED': 'Rejected Titles', 'COMPLETED': 'Completed Titles' };
        document.querySelectorAll('.chart-card').forEach(card => {
            if (card.querySelector('.chart-title').innerText === titleMap[currentCategory]) {
                card.style.border = '2px solid var(--primary-color)';
                card.style.transform = 'translateY(-5px)';
                card.style.boxShadow = '0 8px 20px rgba(0,0,0,0.1)';
            }
        });
    }

    applyDashboardFilters();
};

window.applyDashboardFilters = () => {
    const program = document.getElementById('programFilter').value;
    const section = document.getElementById('sectionFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // 1. Filter by Program, Section, Search
    const baseGroups = allGroups.filter(g => {
        // Removed Adviser restriction to show ALL records
        // const dbAdviser = (g.adviser || '').toLowerCase().trim();
        // const me = instructorName.toLowerCase().trim();
        // const isMyGroup = dbAdviser.includes(me) || me.includes(dbAdviser);
        // if (!isMyGroup) return false;

        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const sectMatch = section === 'ALL' || (g.section && g.section === section);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));
        return progMatch && sectMatch && searchMatch;
    });

    // Helper to robustly get title text
    const getTitleText = (pTitle, keyHint) => {
        if (!pTitle) return keyHint || '';
        let parsed = pTitle;
        if (typeof parsed === 'string') {
            try {
                if (parsed.trim().startsWith('{')) {
                    parsed = JSON.parse(parsed);
                } else {
                    return parsed;
                }
            } catch (e) { return parsed; }
        }

        if (keyHint && parsed[keyHint]) return parsed[keyHint];
        return parsed.title1 || parsed.title2 || parsed.title3 || Object.values(parsed)[0] || '';
    };

    const getStatusMap = (row) => {
        if (!row || !row.statuses) return {};
        let s = row.statuses;
        if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return {}; } }

        const flat = {};
        Object.keys(s).forEach(fileKey => {
            const val = s[fileKey];
            if (typeof val === 'object' && val !== null) {
                const values = Object.values(val);
                // Priority: Approved > Approved with Revisions > Redefend > Rejected > Pending
                if (values.some(v => v.includes('Approved') || v.includes('Completed'))) flat[fileKey] = values.find(v => v.includes('Approved') || v.includes('Completed'));
                else if (values.some(v => v.includes('Approved with Revisions'))) flat[fileKey] = 'Approved with Revisions';
                else if (values.some(v => v.includes('Redefend'))) flat[fileKey] = 'Redefend';
                else if (values.some(v => v.includes('Rejected'))) flat[fileKey] = 'Rejected';
                else flat[fileKey] = 'Pending';
            } else {
                flat[fileKey] = val || 'Pending';
            }
        });
        return flat;
    };

    displayRows = [];

    baseGroups.forEach(g => {
        const titleRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Title Defense');
        const preOralRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Pre-Oral Defense');
        const finalRow = allDefenseStatuses.find(ds => ds.group_id === g.id && ds.defense_type === 'Final Defense');

        const tMap = getStatusMap(titleRow);
        const pMap = getStatusMap(preOralRow);
        const fMap = getStatusMap(finalRow);

        const members = allStudents
            .filter(s => s.group_id === g.id)
            .map(s => s.full_name)
            .join(', ');

        const baseObj = {
            id: g.id,
            group_name: g.group_name || '-',
            members: members || '-',
            program: g.program || '-',
            year: g.year_level || '-',
            original: g
        };

        // Determine which title is approved
        const approvedKey = Object.keys(tMap).find(k => (tMap[k] || '').includes('Approved'));
        let projectTitleDisplay = g.group_name;
        if (approvedKey) {
            projectTitleDisplay = getTitleText(g.project_title, approvedKey);
        }

        if (currentCategory === 'ALL') {
            let statusBadge = '<span class="status-badge pending">Pending</span>';

            // Check progression from Final -> Pre-Oral -> Title
            const fStatus = Object.values(fMap).find(v => v === 'Completed' || v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(fMap).find(v => v === 'Redefend') || 'Pending';

            const pStatus = Object.values(pMap).find(v => v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(pMap).find(v => v === 'Redefend') || 'Pending';

            const tStatus = Object.values(tMap).find(v => v.includes('Approved') || v.includes('Revisions')) ||
                Object.values(tMap).find(v => v === 'Redefend' || v === 'Rejected') || 'Pending';

            if (Object.values(fMap).some(v => v === 'Completed')) {
                statusBadge = '<span class="status-badge approved">Completed</span>';
            } else if (Object.values(fMap).some(v => v.includes('Approved') || v.includes('Revisions'))) {
                statusBadge = '<span class="status-badge approved" style="background:#dcfce7; color:#166534;">Final Ongoing</span>';
            } else if (pStatus.includes('Approved') || pStatus.includes('Revisions')) {
                statusBadge = '<span class="status-badge approved" style="background:#e0f2fe; color:#0369a1;">Pre-Oral Passed</span>';
            } else if (tStatus.includes('Approved') || tStatus.includes('Revisions')) {
                statusBadge = '<span class="status-badge approved" style="background:#dbeafe; color:#2563eb;">Title Approved</span>';
            } else if (tStatus === 'Rejected' || tStatus === 'Redefend' || pStatus === 'Redefend' || fStatus === 'Redefend') {
                statusBadge = `<span class="status-badge rejected">${fStatus === 'Redefend' ? 'Redefend Final' : pStatus === 'Redefend' ? 'Redefend Pre-Oral' : tStatus}</span>`;
            }

            displayRows.push({ ...baseObj, title: projectTitleDisplay, statusHtml: statusBadge });

        } else if (currentCategory === 'APPROVED') {
            if (approvedKey) {
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${projectTitleDisplay}</strong>`,
                    statusHtml: '<span class="status-badge approved">Title Approved</span>'
                });
            }
        } else if (currentCategory === 'REJECTED') {
            Object.keys(tMap).forEach(k => {
                if (tMap[k] === 'Rejected' || tMap[k] === 'Redefend') {
                    displayRows.push({
                        ...baseObj,
                        title: `<span style="color: #dc2626;">${getTitleText(g.project_title, k)}</span>`,
                        statusHtml: `<span class="status-badge rejected">${tMap[k]}</span>`
                    });
                }
            });
        } else if (currentCategory === 'COMPLETED') {
            if (Object.values(fMap).some(v => v === 'Completed')) {
                displayRows.push({
                    ...baseObj,
                    title: `<strong>${projectTitleDisplay}</strong>`,
                    statusHtml: '<span class="status-badge approved">Completed</span>'
                });
            }
        }
    });

    updateCounts(baseGroups);
    renderTable();
};

function updateCounts(groups) {
    const groupIds = groups.map(g => g.id);
    const relevantStatuses = allDefenseStatuses.filter(ds => groupIds.includes(ds.group_id));

    let approvedTotal = 0;
    let rejectedTotal = 0;
    let completedTotal = 0;

    groupIds.forEach(id => {
        const titleRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Title Defense');
        const finalRow = relevantStatuses.find(ds => ds.group_id === id && ds.defense_type === 'Final Defense');

        // Check Titles
        if (titleRow && titleRow.statuses) {
            const tMap = getStatusMap(titleRow);
            Object.values(tMap).forEach(v => {
                if (v.includes('Approved') || v.includes('Revisions')) approvedTotal++;
                if (v === 'Rejected' || v === 'Redefend') rejectedTotal++;
            });
        }

        // Check if Overall Completed (Final Defense)
        if (finalRow && finalRow.statuses) {
            const fMap = getStatusMap(finalRow);
            if (Object.values(fMap).some(v => v === 'Completed')) {
                completedTotal++;
            }
        }
    });

    // Display Counts
    const titleEl = document.getElementById('countTitle');
    const rejectedEl = document.getElementById('countPreOral'); // This is the middle card (Rejected Titles)
    const finalEl = document.getElementById('countFinal');

    if (titleEl) titleEl.innerText = approvedTotal;
    if (rejectedEl) rejectedEl.innerText = rejectedTotal;
    if (finalEl) finalEl.innerText = completedTotal;
}

function countDefenseStatus(allStatuses, defenseType, passValues) { return 0; }

async function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    if (displayRows.length === 0) {
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';

    displayRows.forEach(row => {
        const program = (row.program || '').toUpperCase();
        let progClass = 'prog-unknown';
        if (program.includes('BSIS')) progClass = 'prog-bsis';
        else if (program.includes('BSIT')) progClass = 'prog-bsit';
        else if (program.includes('BSCS')) progClass = 'prog-bscs';

        const members = (row.members || '').split(',').map(m => m.trim()).filter(m => m && m !== '-');
        const membersHtml = members.length > 0
            ? members.map(m => `<span class="chip">${m}</span>`).join('')
            : '<span style="color:#94a3b8;">-</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${row.title || '-'}</td>
            <td>${row.group_name}</td>
            <td>
                <div class="chips-container">
                    ${membersHtml}
                </div>
            </td>
            <td><span class="prog-badge ${progClass}">${program}</span></td>
            <td>${row.year}</td>
            <td>${row.statusHtml}</td>
            <td>
                <button onclick="openFileModal(${row.id})" 
                    style="background: var(--primary-color); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.2); transition: all 0.2s;"
                    onmouseover="this.style.transform='translateY(-1px)'"
                    onmouseout="this.style.transform='translateY(0)'">
                    <span class="material-icons-round" style="font-size: 16px;">folder_open</span>
                    View Files
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// --- FILE MODAL LOGIC (Adviser View) ---
window.openFileModal = async (groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    document.getElementById('modalGroupName').innerText = `${group.group_name} - Submissions`;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // Reset PDF view
    const pdfFrame = document.getElementById('pdfFrame');
    if (pdfFrame) {
        pdfFrame.style.display = 'none';
        pdfFrame.src = "";
    }
    document.getElementById('pdfPlaceholder').style.display = 'flex';

    // Prepare File Categories
    const categories = [
        { title: 'Title Defense', data: group.title_link, icon: 'article', key: 'titles' },
        { title: 'Pre-Oral Defense', data: group.pre_oral_link, icon: 'description', key: 'pre_oral' },
        { title: 'Final Defense', data: group.final_link, icon: 'menu_book', key: 'final' }
    ];

    categories.forEach(cat => {
        let files = {};
        if (cat.data) {
            try { files = typeof cat.data === 'string' ? JSON.parse(cat.data) : cat.data; } catch (e) { }
        }
        if (Object.keys(files).length > 0) {
            createSection(cat.title, files, cat.icon, cat.key, group);
        }
    });

    document.getElementById('fileModal').style.display = 'flex';
};

function createSection(sectionTitle, fileObj, icon, categoryKey, group) {
    const section = document.createElement('div');
    section.style.marginBottom = '20px';

    const header = document.createElement('h4');
    header.innerHTML = `<span class="material-icons-round" style="font-size:16px; vertical-align:middle; margin-right:4px;">${icon}</span> ${sectionTitle}`;
    header.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px;';
    section.appendChild(header);

    const statusesForGroup = allDefenseStatuses.filter(ds => ds.group_id === group.id);
    const statusRow = statusesForGroup.find(s => {
        const type = (s.defense_type || '').toLowerCase();
        if (categoryKey === 'titles' && type.includes('title')) return true;
        if (categoryKey === 'pre_oral' && type.includes('pre-oral')) return true;
        if (categoryKey === 'final' && type.includes('final')) return true;
        return false;
    });

    let overallRemarks = {};
    let overallStatuses = {};
    if (statusRow) {
        try { overallRemarks = typeof statusRow.remarks === 'string' ? JSON.parse(statusRow.remarks) : statusRow.remarks || {}; } catch (e) { }
        try { overallStatuses = typeof statusRow.statuses === 'string' ? JSON.parse(statusRow.statuses) : statusRow.statuses || {}; } catch (e) { }
    }

    Object.entries(fileObj).forEach(([label, url]) => {
        const isRevised = label.endsWith('_revised');
        const cleanUrl = url ? url.toString().trim() : "";
        // Filter out null labels explicitly
        if (!cleanUrl || cleanUrl.toLowerCase() === "null" || isRevised || label.toLowerCase() === 'null') return;

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 8px; overflow: hidden;';

        // 1. MAIN FILE ITEM
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';

        // Display Label logic
        let displayLabel = label.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        if (categoryKey === 'titles' && group.project_title) {
            try {
                const projectTitles = typeof group.project_title === 'string' && group.project_title.startsWith('{')
                    ? JSON.parse(group.project_title)
                    : { title1: group.project_title };
                if (projectTitles[label]) displayLabel = projectTitles[label];
            } catch (e) { }
        }

        item.innerHTML = `
            <span style="font-size: 0.9rem; font-weight: 500; color: #334155;">${displayLabel}</span>
            <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
        `;

        item.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => el.style.background = 'white');
            item.style.background = '#f0f9ff';
            loadPDF(url, displayLabel, label);
        };
        itemContainer.appendChild(item);

        // 2. REVISED VERSION (if exists)
        if (fileObj[label + '_revised']) {
            const revisedUrl = fileObj[label + '_revised'];
            const revItem = document.createElement('div');
            revItem.className = 'file-item';
            revItem.style.cssText = 'padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #fffbeb; border-top: 1px dashed #fcd34d; transition: all 0.2s;';
            revItem.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="material-icons-round" style="font-size: 16px; color: #b45309;">history_edu</span>
                    <span style="font-size: 0.8rem; font-weight: 600; color: #b45309;">Revised Version</span>
                </div>
                <span class="material-icons-round" style="font-size: 16px; color: #b45309;">arrow_forward</span>
            `;
            revItem.onclick = () => {
                document.querySelectorAll('.file-item').forEach(el => el.style.background = 'white');
                revItem.style.background = '#fcd34d';
                loadPDF(revisedUrl, `Revised - ${displayLabel}`, label + '_revised');
            };
            itemContainer.appendChild(revItem);
        }

        // 3. FEEDBACK AREA (Adviser Read-Only)
        const feedbackArea = document.createElement('div');
        feedbackArea.style.cssText = 'padding: 12px; background: #f8fafc; border-top: 1px solid #e2e8f0;';

        const fileStatuses = typeof overallStatuses[label] === 'object' ? overallStatuses[label] : {};
        const fileRemarks = typeof overallRemarks[label] === 'object' ? overallRemarks[label] : {};
        const panelsList = Object.keys(fileStatuses);

        let evaluationsHtml = '';
        if (panelsList.length > 0) {
            evaluationsHtml = panelsList.map(panel => {
                const status = fileStatuses[panel] || 'Pending';
                const rmk = fileRemarks[panel] || '';
                let color = '#64748b';
                if (status.includes('Approved') || status === 'Completed') color = '#059669';
                else if (status.includes('Revisions')) color = '#d97706';
                else if (status === 'Rejected' || status === 'Redefend') color = '#dc2626';

                return `
                    <div style="font-size: 11px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
                            <strong style="color: var(--primary-color);">${panel}</strong>
                            <span style="font-weight:700; color:${color};">${status}</span>
                        </div>
                        <div style="color: #64748b; font-style: italic;">"${rmk || 'No specific remarks'}"</div>
                    </div>
                `;
            }).join('');
        } else {
            evaluationsHtml = '<div style="font-size:11px; color:#94a3b8; text-align:center; padding:5px;">Waiting for panel evaluations...</div>';
        }

        feedbackArea.innerHTML = `
            <div style="padding: 8px; background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 6px; color: #0369a1; font-size: 11px; font-weight: 600; text-align: center; margin-bottom: 12px;">
                <span class="material-icons-round" style="font-size: 14px; vertical-align: middle; margin-right: 4px;">visibility</span>
                ADVISER READ-ONLY VIEW
            </div>
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Panel Evaluations</div>
            ${evaluationsHtml}
        `;

        itemContainer.appendChild(feedbackArea);
        section.appendChild(itemContainer);
    });

    document.getElementById('fileList').appendChild(section);
}

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
};

window.loadPDF = async (url, title, fileKey) => {
    currentViewerFileKey = fileKey;
    document.getElementById('pdfPlaceholder').style.display = 'none';

    const pdfFrame = document.getElementById('pdfFrame');
    if (pdfFrame) {
        pdfFrame.style.display = 'block';

        let finalUrl = url.trim();
        if (!finalUrl.startsWith('http') && !finalUrl.startsWith('//')) finalUrl = 'https://' + finalUrl;

        // Use the local PDF viewer (same as Panel)
        // If it's a PDF, we try to fetch it as a blob to avoid CORS if possible, 
        // OR just pass it to the viewer if cross-origin is allowed.
        // For simplicity and read-only, we can try direct PDF.js viewer link.

        const lowerUrl = finalUrl.toLowerCase();
        if (lowerUrl.endsWith('.pdf') || lowerUrl.includes('supabase.co')) {
            try {
                const response = await fetch(finalUrl);
                if (response.ok) {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const viewerPath = "../../assets/library/web/viewer.html";
                    pdfFrame.src = `${viewerPath}?file=${encodeURIComponent(blobUrl)}`;
                } else {
                    // Fallback to direct link
                    pdfFrame.src = finalUrl;
                }
            } catch (e) {
                // Fallback to direct link or Google Docs viewer
                console.warn("Fetch failed, using direct link", e);
                pdfFrame.src = finalUrl;
            }
        } else if (lowerUrl.includes('drive.google.com')) {
            const fileIdMatch = finalUrl.match(/\/d\/([^\/]+)/) || finalUrl.match(/id=([^\&]+)/);
            const drivePreview = fileIdMatch ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview` : finalUrl;
            pdfFrame.src = drivePreview;
        } else {
            // Generic fallback
            pdfFrame.src = finalUrl;
        }
    }
};

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

window.filterTable = (program) => {
    document.getElementById('programFilter').value = program;
    applyDashboardFilters();
};

document.getElementById('searchInput')?.addEventListener('input', applyDashboardFilters);
