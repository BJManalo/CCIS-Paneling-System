
// Initialize Supabase client
const PROJECT_URL = 'https://oddzwiddvniejcawzpwi.supabase.co';
const PUBLIC_KEY = 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
const supabaseClient = window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Data storage
let allGroups = [];
let allDefenseStatuses = [];
let allStudents = [];
let allSchedules = [];
let allInstructors = [];
let allCapstoneFeedback = [];
let currentCategory = 'ALL'; // Note: Used for status logic if needed
let currentTab = 'ADVISORY'; // 'ADVISORY' or 'ALL'
let instructorName = '';
let displayRows = [];

// PDF Viewer State
let currentAdobeView = null;
let currentViewerFileKey = null;

document.addEventListener('DOMContentLoaded', () => {
    // Check Login
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser || (loginUser.role !== 'Instructor' && loginUser.role !== 'Instructor/Adviser')) {
        window.location.href = '../../';
        return;
    }
    instructorName = loginUser.full_name || '';

    fetchCapstoneData();
});

async function fetchCapstoneData() {
    try {
        const { data: groups, error: gError } = await supabaseClient.from('student_groups').select('*');
        if (gError) throw gError;
        allGroups = groups || [];

        const { data: statuses, error: sError } = await supabaseClient.from('defense_statuses').select('*');
        if (sError) throw sError;
        allDefenseStatuses = statuses || [];

        const { data: students, error: stdError } = await supabaseClient.from('students').select('*');
        if (stdError) throw stdError;
        allStudents = students || [];

        const { data: schedules, error: schError } = await supabaseClient.from('schedules').select('*');
        if (schError) throw schError;
        allSchedules = schedules || [];

        const { data: instructors, error: iError } = await supabaseClient.from('instructors').select('*');
        if (iError) throw iError;
        allInstructors = instructors || [];

        const { data: feedback, error: fError } = await supabaseClient.from('capstone_feedback').select('*');
        if (fError) console.error('Error fetching feedback:', fError);
        allCapstoneFeedback = feedback || [];

        // Initial Render
        applyFilters();

    } catch (err) {
        console.error('Error fetching capstone data:', err);
    }
}

window.switchTab = (tab) => {
    currentTab = tab;
    // Update active button state
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Simple logic to find the button based on text content (robust enough for this use case)
    const buttons = document.querySelectorAll('.tab-btn');
    if (tab === 'ADVISORY') buttons[0].classList.add('active');
    else buttons[1].classList.add('active');

    // Reset filters somewhat if desired, or keep them
    applyFilters();
};

window.applyFilters = () => {
    const program = document.getElementById('programFilter').value;
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // 1. Base Filter (Tab Logic)
    let filtered = allGroups;
    if (currentTab === 'ADVISORY') {
        filtered = filtered.filter(g => {
            const dbAdviser = (g.adviser || '').toLowerCase().trim();
            const me = instructorName.toLowerCase().trim();
            return dbAdviser.includes(me) || me.includes(dbAdviser);
        });
    }

    // 2. Additional Filters (Program, Search)
    filtered = filtered.filter(g => {
        const progMatch = program === 'ALL' || (g.program && g.program.toUpperCase() === program);
        const searchMatch = !searchTerm ||
            (g.group_name && g.group_name.toLowerCase().includes(searchTerm)) ||
            (g.program && g.program.toLowerCase().includes(searchTerm));
        return progMatch && searchMatch;
    });

    displayRows = [];

    // Helper to get panel names
    const getPanelNames = (panelIds) => {
        if (!panelIds) return [];
        let ids = [];
        try { ids = typeof panelIds === 'string' ? JSON.parse(panelIds) : panelIds; } catch (e) { ids = [panelIds]; }
        if (!Array.isArray(ids)) ids = [ids]; // fallback

        return ids.map(id => {
            const stringId = String(id).trim(); // Ensure string comparison
            const inst = allInstructors.find(i => String(i.id) === stringId);
            return inst ? inst.name : stringId; // Fallback to ID if name not found
        });
    };

    // Helper to format date
    const formatDate = (dateStr, timeStr) => {
        if (!dateStr) return '-';
        const date = new Date(dateStr).toLocaleDateString();
        const time = timeStr ? timeStr : '';
        return `${date}<br><span style="font-size:0.75rem; color:#64748b;">${time}</span>`;
    };

    filtered.forEach(g => {
        // We need to determine the "current" or "most relevant" defense stage to show properties for.
        // Logic: Show Title if pending/recent, then Pre-Oral, then Final. 
        // OR: Show entries for EACH scheduled defense? 
        // prompt says: "all file submissions of group will be show".
        // It implies a list of submissions. A group might have Title, Pre-Oral, and Final submissions.
        // The screenshot shows one row per defense type. "TITLE DEFENSE - Debugger".
        // SO we should explode groups into defense rows?

        // Let's create rows for each defense type that exists (has schedule or files)
        // OR simply list the group and show its status.
        // The screenshot shows "TYPE" column: "TITLE DEFENSE". This strongly suggests one row per defense type.

        const stages = ['Title Defense', 'Pre-Oral Defense', 'Final Defense'];

        stages.forEach(stage => {
            // Check if this stage is relevant (has schedule OR has files uploaded)
            const schedule = allSchedules.find(s => s.group_id === g.id && s.defense_type === stage);

            // Allow row if schedule exists OR files exist for this stage
            let hasFiles = false;
            if (stage === 'Title Defense' && g.title_link) hasFiles = true;
            if (stage === 'Pre-Oral Defense' && g.pre_oral_link) hasFiles = true;
            if (stage === 'Final Defense' && g.final_link) hasFiles = true;

            // If "All Submissions" tab, maybe we only show if there are actual items? 
            // Let's show if there is a SCHEDULE or FILES.
            if (!schedule && !hasFiles) return;

            const panelNames = schedule ? getPanelNames(schedule.panel_members) : [];
            const venue = schedule ? schedule.venue : '-';
            const dateDisplay = schedule ? formatDate(schedule.date, schedule.time) : '<span style="color:#cbd5e1; font-style:italic;">Not Scheduled</span>';

            // Panels HTML
            const panelsHtml = panelNames.length > 0
                ? `<div class="panel-tags">${panelNames.map(p => `<span class="panel-tag">${p}</span>`).join('')}</div>`
                : '<span style="color:#94a3b8;">-</span>';

            // Badge Color
            let badgeClass = 'bg-blue-100 text-blue-700'; // Default Title
            if (stage === 'Pre-Oral Defense') badgeClass = 'bg-purple-100 text-purple-700';
            if (stage === 'Final Defense') badgeClass = 'bg-green-100 text-green-700';
            // Custom simplified badge styles inline for now to match strict existing CSS or just standard styles
            let badgeStyle = "background:#dbeafe; color:#1e40af;";
            if (stage === 'Pre-Oral Defense') badgeStyle = "background:#f3e8ff; color:#6b21a8;";
            if (stage === 'Final Defense') badgeStyle = "background:#dcfce7; color:#166534;";

            displayRows.push({
                type: stage,
                typeStyle: badgeStyle,
                groupName: g.group_name,
                program: g.program || '-',
                dateTime: dateDisplay,
                venue: venue,
                panels: panelsHtml,
                id: g.id,
                obj: g
            });
        });
    });

    renderTable();
};

function renderTable() {
    const tableBody = document.getElementById('tableBody');
    const emptyState = document.getElementById('emptyState');
    tableBody.innerHTML = '';

    if (displayRows.length === 0) {
        emptyState.style.display = 'block';
        return;
    }
    emptyState.style.display = 'none';

    displayRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="type-badge" style="${row.typeStyle}">${row.type}</span></td>
            <td>
                <div style="font-weight: 600; color: var(--primary-dark);">${row.groupName}</div>
                <div style="font-size: 0.75rem; color: #64748b;">Panel View</div> 
            </td>
            <td><span class="prog-badge ${getProgClass(row.program)}">${row.program}</span></td>
            <td>${row.dateTime}</td>
            <td>
                <div style="display:flex; align-items:center; gap:5px; font-size: 0.9rem;">
                    <span class="material-icons-round" style="font-size:16px; color:#64748b;">place</span> ${row.venue}
                </div>
            </td>
            <td>${row.panels}</td>
            <td style="text-align: center;">
                <button onclick="openFileModal(${row.id})" 
                    style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; font-size: 0.85rem; font-weight: 600; transition: all 0.2s;">
                    <span class="material-icons-round" style="font-size: 18px;">folder_open</span>
                    View Files
                </button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

function getProgClass(program) {
    if (!program) return 'prog-unknown';
    const p = program.toUpperCase();
    if (p.includes('BSIS')) return 'prog-bsis';
    if (p.includes('BSIT')) return 'prog-bsit';
    if (p.includes('BSCS')) return 'prog-bscs';
    return 'prog-unknown';
}

// --- FILE MODAL LOGIC (Reused from Advisory/Inspector View) ---
window.openFileModal = async (groupId) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    document.getElementById('modalGroupName').innerText = `${group.group_name} - Submissions`;
    const fileList = document.getElementById('fileList');
    fileList.innerHTML = '';

    // Reset PDF view
    document.getElementById('adobe-dc-view').style.display = 'none';
    document.getElementById('pdfPlaceholder').style.display = 'flex';
    if (currentAdobeView) {
        document.getElementById('adobe-dc-view').innerHTML = '';
        currentAdobeView = null;
    }

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
    header.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 10px; font-weight: 700;';
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
        if (!cleanUrl || cleanUrl.toLowerCase() === "null" || isRevised) return;

        const itemContainer = document.createElement('div');
        itemContainer.style.cssText = 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; overflow: hidden; transition: all 0.2s;';

        // 1. MAIN FILE ITEM
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.cssText = 'padding: 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.2s;';

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
            <span style="font-size: 0.95rem; font-weight: 600; color: #334155;">${displayLabel}</span>
            <span class="material-icons-round" style="font-size: 18px; color: var(--primary-color);">arrow_forward_ios</span>
        `;

        item.onclick = () => {
            document.querySelectorAll('.file-item').forEach(el => {
                el.style.background = 'white';
                if (el.parentElement) el.parentElement.style.borderColor = '#e2e8f0';
            });
            item.style.background = '#f0f9ff';
            itemContainer.style.borderColor = 'var(--primary-color)';
            itemContainer.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.1)';
            loadPDF(url, displayLabel, label);
        };
        itemContainer.appendChild(item);

        // 2. REVISED VERSION
        if (fileObj[label + '_revised']) {
            const revisedUrl = fileObj[label + '_revised'];
            const revItem = document.createElement('div');
            revItem.className = 'file-item';
            revItem.style.cssText = 'padding: 10px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; background: #fffbeb; border-top: 1px dashed #fcd34d; transition: all 0.2s;';
            revItem.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="material-icons-round" style="font-size: 16px; color: #b45309;">history_edu</span>
                    <span style="font-size: 0.85rem; font-weight: 600; color: #b45309;">Revised Version</span>
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

        // 3. FEEDBACK AREA (Read Only - Card Style)
        const fileStatuses = typeof overallStatuses[label] === 'object' ? overallStatuses[label] : {};
        const fileRemarks = typeof overallRemarks[label] === 'object' ? overallRemarks[label] : {};
        const panelsList = Object.keys(fileStatuses);

        const feedbackArea = document.createElement('div');
        feedbackArea.style.cssText = 'padding: 15px; background: #f8fafc; border-top: 1px solid #e2e8f0;';

        const readOnlyBanner = `
            <div style="padding: 10px; background: #f0f9ff; border: 1px dashed #bae6fd; border-radius: 8px; color: #0369a1; font-size: 0.8rem; font-weight: 600; text-align: center; margin-bottom: 16px; display: flex; align-items: center; justify-content: center; gap: 6px;">
                <span class="material-icons-round" style="font-size: 16px;">visibility</span>
                Adviser Read-Only View
            </div>
        `;

        let evaluationsHtml = '';
        if (panelsList.length > 0) {
            evaluationsHtml = panelsList.map(panel => {
                const status = fileStatuses[panel] || 'Pending';
                const remark = fileRemarks[panel] || '';

                // Style Logic
                let sColor = '#64748b'; let sBg = '#f1f5f9'; let iText = 'hourglass_empty';
                if (status.includes('Approved') || status === 'Completed') {
                    sColor = '#059669'; sBg = '#dcfce7'; iText = 'check_circle';
                } else if (status.includes('Revisions')) {
                    sColor = '#d97706'; sBg = '#fef3c7'; iText = 'warning';
                } else if (status.includes('Rejected') || status.includes('Redefend')) {
                    sColor = '#dc2626'; sBg = '#fee2e2'; iText = 'cancel';
                }

                return `
                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 10px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px;">${panel}</span>
                        <div style="font-size: 11px; font-weight: 700; color: ${sColor}; background: ${sBg}; padding: 4px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px;">
                            <span class="material-icons-round" style="font-size: 14px;">${iText}</span>
                            ${status}
                        </div>
                    </div>
                    <div style="font-size: 0.85rem; color: #334155; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #f1f5f9; white-space: pre-wrap; line-height: 1.5;">${remark ? remark.replace(new RegExp('^' + panel + ':\\s*'), '') : '<em style="color:#cbd5e1;">No remarks provided.</em>'}</div>
                </div>
                `;
            }).join('');
        } else {
            evaluationsHtml = `
                <div style="text-align: center; padding: 20px; color: #94a3b8;">
                    <span class="material-icons-round" style="font-size: 24px; opacity: 0.5;">hourglass_empty</span>
                    <p style="font-size: 0.85rem; margin-top: 5px;">Waiting for panel evaluations...</p>
                </div>
            `;
        }

        feedbackArea.innerHTML = `
            ${readOnlyBanner}
            <div style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px;">Panel Evaluations</div>
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

window.loadPDF = (url, title, fileKey) => {
    currentViewerFileKey = fileKey;
    document.getElementById('pdfPlaceholder').style.display = 'none';
    const viewerDiv = document.getElementById('adobe-dc-view');
    viewerDiv.style.display = 'block';
    viewerDiv.innerHTML = '';

    if (window.AdobeDC) {
        currentAdobeView = new AdobeDC.View({
            clientId: "8ebcb61f76d649989f2ae52da7014605",
            divId: "adobe-dc-view"
        });
        currentAdobeView.previewFile({
            content: { location: { url: url } },
            metaData: { fileName: title }
        }, {
            embedMode: "FULL_WINDOW",
            showAnnotationTools: false, // Cleaner for Adviser
            showLeftHandPanel: true,
            showDownloadPDF: true,
            showPrintPDF: true
        });
    } else {
        viewerDiv.innerHTML = `<iframe src="${url}" style="width:100%; height:100%; border:none;"></iframe>`;
    }

    document.querySelectorAll('.file-item').forEach(it => it.style.boxShadow = 'none');
};

const script = document.createElement('script');
script.src = "https://documentservices.adobe.com/view-sdk/viewer.js";
document.head.appendChild(script);

function logout() {
    localStorage.removeItem('loginUser');
    window.location.href = '../../';
}

document.getElementById('searchInput')?.addEventListener('input', applyFilters);
