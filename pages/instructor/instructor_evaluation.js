// Initialize Supabase client
var PROJECT_URL = PROJECT_URL || 'https://oddzwiddvniejcawzpwi.supabase.co';
var PUBLIC_KEY = PUBLIC_KEY || 'sb_publishable_mILyigCa_gB27xjtNZdVsg_WBDt9cLI';
var supabaseClient = supabaseClient || window.supabase.createClient(PROJECT_URL, PUBLIC_KEY);

// Global State
let allData = [];
let loadedEvaluations = [];
let currentTypeFilter = 'ALL';
let rawGroups = [];
let allDefenseStatuses = [];
let currentPageAdvisory = 1;
const rowsPerPageAdvisory = 15;
let currentPageEval = 1;
const rowsPerPageEval = 15;
document.addEventListener('DOMContentLoaded', () => {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    const rawRole = (loginUser && loginUser.role) ? loginUser.role.toString().toLowerCase() : '';
    const isAdviser = rawRole.includes('adviser') || rawRole.includes('advisor');
    const hasOtherRole = rawRole.includes('instructor') || rawRole.includes('panel') || rawRole.includes('admin');

    if (isAdviser && !hasOtherRole) {
        document.querySelectorAll('.nav-item, a').forEach(nav => {
            const href = (nav.getAttribute('href') || '').toLowerCase();
            const text = (nav.textContent || '').toLowerCase();
            if (href.includes('evaluation') || text.includes('evaluation')) {
                nav.style.setProperty('display', 'none', 'important');
            }
        });
        window.location.href = 'instructor_dashboard';
        return;
    }

    loadEvaluations();
    initTooltip();
});

// Criteria Definitions
// Criteria Definitions with Detailed Rubrics
const individualCriteria = [
    {
        name: 'Clarity & Organization',
        rubrics: {
            4: 'Well-structured, clear transitions between topics, logical flow.',
            3: 'Mostly clear, with minor disorganization or unclear transitions.',
            2: 'Somewhat disorganized or unclear in parts, making it hard to follow.',
            1: 'Poorly organized, hard to follow or understand.'
        }
    },
    {
        name: 'Engagement',
        rubrics: {
            4: 'The presentation is very engaging. Group members keep the audience interested throughout.',
            3: 'The presentation is engaging for the most part, with minor lapses.',
            2: 'The presentation has a few engaging moments but lacks consistency.',
            1: 'The presentation is monotonous or disengaging.'
        }
    },
    {
        name: 'Delivery',
        rubrics: {
            4: 'Confident, natural delivery. Eye contact maintained, good pace, well-practiced.',
            3: 'Good delivery, but a bit hesitant or awkward at times.',
            2: 'Delivery is stiff or disjointed, with awkward pauses or excessive reading.',
            1: 'Unclear, rushed, or overly nervous delivery.'
        }
    },
    {
        name: 'Content Knowledge',
        rubrics: {
            4: 'Highly effective visuals that enhance understanding and support key points.',
            3: 'Visuals are clear and relevant, with some room for improvement.',
            2: 'Visuals are adequate but don\'t strongly support the presentation.',
            1: 'Visuals are unclear or distracting, with little relation to content.'
        }
    },
    {
        name: 'Team Collaboration',
        rubrics: {
            4: 'Excellent team coordination, each member contributes clearly and equally.',
            3: 'Most members contribute equally, with some minor imbalances.',
            2: 'Some members dominate the presentation, while others contribute minimally.',
            1: 'Team lacks cohesion, with unequal contributions or visible disconnects.'
        }
    },
    {
        name: 'Professionalism',
        rubrics: {
            4: 'Well-prepared, professional demeanor, answers questions confidently and competently.',
            3: 'Generally professional, but with minor lapses in preparation or handling questions.',
            2: 'Somewhat unprofessional or unprepared, struggles with questions.',
            1: 'Unprepared, unprofessional behavior or failure to answer questions.'
        }
    },
    {
        name: 'Time Management',
        rubrics: {
            4: 'Presentation adheres strictly to time limits, covering all necessary points concisely.',
            3: 'Minor overrun or rush at the end, but overall time was well-managed.',
            2: 'Presentation exceeds or fails to meet time expectations, lacking detail in some areas.',
            1: 'Presentation is too long or short, missing essential content.'
        }
    }
];

const systemCriteria = [
    {
        name: 'System Functionality',
        rubrics: {
            4: 'System is fully functional with all key features working as intended (at least 70% complete).',
            3: 'System is mostly functional with minor issues or missing features.',
            2: 'System has several non-functional or incomplete features.',
            1: 'System has major functionality issues or is incomplete.'
        }
    },
    {
        name: 'Technical Complexity',
        rubrics: {
            4: 'The system demonstrates a high level of technical skill and complexity (advanced features, integration, etc.).',
            3: 'System demonstrates solid technical skills but lacks advanced features.',
            2: 'Basic system with limited technical complexity or advanced concepts.',
            1: 'System lacks technical depth or fails to implement basic concepts.'
        }
    },
    {
        name: 'Usability',
        rubrics: {
            4: 'System is intuitive and user-friendly, easy to navigate and use.',
            3: 'System is mostly user-friendly, with minor usability issues.',
            2: 'System has some usability issues that make it difficult to use.',
            1: 'System is difficult to use or lacks clear user interface design.'
        }
    },
    {
        name: 'Code Quality & Organization',
        rubrics: {
            4: 'Code is well-structured, well-documented, and follows best practices.',
            3: 'Code is generally well-written but lacks documentation or could be better organized.',
            2: 'Code is functional but has readability or organizational issues.',
            1: 'Code is poorly written, hard to understand, or lacks necessary documentation.'
        }
    },
    {
        name: 'Innovation & Creativity',
        rubrics: {
            4: 'The system showcases innovative ideas or creative solutions to problems.',
            3: 'Some original ideas or creative approaches are evident.',
            2: 'Little innovation, relying mostly on standard solutions.',
            1: 'No creativity or innovation, very basic or copied ideas.'
        }
    },
    {
        name: 'Testing & Debugging',
        rubrics: {
            4: 'System is thoroughly tested with no major bugs or errors.',
            3: 'System has been tested with few minor issues remaining.',
            2: 'Some testing was done, but there are bugs or issues that hinder functionality.',
            1: 'Little to no testing, system is full of bugs or crashes.'
        }
    },
    {
        name: 'Documentation & Reporting',
        rubrics: {
            4: 'Clear, comprehensive documentation that includes detailed explanations of system design, code, and usage.',
            3: 'Good documentation, but may lack detail in some areas.',
            2: 'Documentation is minimal or unclear, with gaps in explanations.',
            1: 'No documentation, or it is incomplete and unhelpful.'
        }
    },
    {
        name: 'System Presentation/Demo',
        rubrics: {
            4: 'The system is demonstrated effectively, with a clear explanation of how it works and what each feature does.',
            3: 'The system is demonstrated well but may have minor gaps in explanation.',
            2: 'System is demonstrated, but the explanation is unclear or incomplete.',
            1: 'System is not demonstrated, or demo fails to work properly.'
        }
    }
];

async function loadEvaluations() {
    const accordionContainer = document.getElementById('accordionContainer');

    try {
        const { data: groups, error } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                students ( id, full_name ),
                schedules (
                    id,
                    schedule_type,
                    panel1, panel2, panel3, panel4, panel5
                )
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        rawGroups = groups || [];

        const { data: statuses } = await supabaseClient
            .from('defense_statuses')
            .select('*');
        allDefenseStatuses = statuses || [];

        const { data: indScores } = await supabaseClient
            .from('individual_evaluations')
            .select('*');

        const { data: sysScores } = await supabaseClient
            .from('system_evaluations')
            .select('*');

        let processedEvaluations = [];

        (groups || []).forEach(group => {
            const schedules = group.schedules || [];
            if (schedules.length === 0) return;

            let groupHasEvaluations = false;
            let groupDefenses = {};

            schedules.forEach(sched => {
                const relevantIndScores = (indScores || []).filter(s => s.schedule_id === sched.id);
                const panelistsWhoRated = [...new Set(relevantIndScores.map(s => s.panelist_name))];

                const relevantSysScores = (sysScores || []).filter(s => s.schedule_id === sched.id);
                const panelistsSys = relevantSysScores.map(s => s.panelist_name);

                const allRaters = [...new Set([...panelistsWhoRated, ...panelistsSys])];

                let dType = sched.schedule_type || 'Defense';
                let normType = '';
                if (dType.toLowerCase().includes('title')) normType = 'titledefense';
                else if (dType.toLowerCase().includes('pre')) normType = 'preoraldefense';
                else if (dType.toLowerCase().includes('final')) normType = 'finaldefense';

                if (allRaters.length > 0 && normType) {
                    groupHasEvaluations = true;
                    groupDefenses[normType] = {
                        schedId: sched.id,
                        defenseType: dType,
                        panelists: allRaters,
                        panelistName: allRaters.join(', '),
                        savedScores: {
                            individual: relevantIndScores,
                            system: relevantSysScores
                        }
                    };
                }
            });

            if (groupHasEvaluations) {
                processedEvaluations.push({
                    id: group.id,
                    groupId: group.id,
                    groupName: group.group_name,
                    program: group.program,
                    members: group.students || [],
                    title: group.title,
                    adviser: group.adviser,
                    createdBy: group.created_by || group.user_id,
                    defenses: groupDefenses
                });
            }
        });

        loadedEvaluations = processedEvaluations;

        if (window.switchMainTab) {
            window.switchMainTab(currentMainTab);
        } else {
            applyFilters();
        }

    } catch (err) {
        console.error('Error loading data:', err);
        if (accordionContainer) accordionContainer.innerHTML = '<p style="text-align: center; color: red;">Error loading data.</p>';
    }
}

// --- Main Tab Logic ---
let currentMainTab = 'Instructor';

window.switchMainTab = (tab) => {
    const filterContainer = document.querySelector('.filter-container');
    const accordion = document.getElementById('accordionContainer');

    // Always show filters
    if (filterContainer) filterContainer.style.display = 'flex';
    if (accordion) accordion.style.display = 'block';

    applyFilters();
}

function renderAdvisoryTable() {
    const tbody = document.getElementById('advisoryTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // Get User
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = (user ? (user.name || user.full_name || '') : '').toLowerCase();

    // Filter Groups where I am Adviser
    const myAdviseeGroups = rawGroups.filter(g => {
        const adv = (g.adviser || '').toLowerCase();
        return adv.includes(userName) || (userName && userName.includes(adv));
    });

    if (myAdviseeGroups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No groups assigned to you as Adviser.</td></tr>';
        return;
    }

    let filteredGroups = [];

    myAdviseeGroups.forEach(group => {
        const schedules = group.schedules || [];

        let targetSched = null;
        let displayType = '';

        // Determine which schedule to show based on filter
        if (currentTypeFilter !== 'ALL') {
            if (currentTypeFilter === 'title') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Title'));
            if (currentTypeFilter === 'pre') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Pre'));
            // The filter uses 'final' but schedule_type matches 'Final'
            if (currentTypeFilter === 'final') targetSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Final'));

            if (!targetSched) return; // Skip group if no match
            displayType = targetSched.schedule_type;
        } else {
            // Default Priority: Final > Pre > Title
            const titleSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Title'));
            const preSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Pre'));
            const finalSched = schedules.find(s => s.schedule_type && s.schedule_type.includes('Final'));

            if (finalSched) { targetSched = finalSched; displayType = 'Final Defense'; }
            else if (preSched) { targetSched = preSched; displayType = 'Pre-Oral Defense'; }
            else if (titleSched) { targetSched = titleSched; displayType = 'Title Defense'; }
            else {
                // No schedule found implies "Not Scheduled"
                displayType = 'Title Defense';
            }
        }

        let displayStatus = 'Not Scheduled';
        if (targetSched) {
            const statusRecord = allDefenseStatuses.find(ds => ds.schedule_id === targetSched.id);
            if (statusRecord) {
                // Check if actually finished or ongoing?
                // For now, if record exists, it's "Scheduled" or "Under Evaluation" ??
                // Panel says "Scheduled" in image.
                displayStatus = 'Scheduled';

                // Refine if needed: if (statusRecord.verdict) ...
            } else {
                displayStatus = 'Scheduled'; // If explicit schedule exists in 'schedules' table, it is scheduled.
            }
        } else {
            // No schedule object found
            if (displayType) displayStatus = 'Not Scheduled';
        }

        // Get Title safely
        let title = group.title;
        if (typeof title === 'object' && title !== null) {
            title = title.title1 || title.title2 || Object.values(title)[0] || '';
        } else if (typeof title === 'string' && title.startsWith('{')) {
            try { const t = JSON.parse(title); title = t.title1 || Object.values(t)[0] || title; } catch (e) { }
        }

        // Truncate title if clean
        if (title && title.length > 50) title = title.substring(0, 50) + '...';

        filteredGroups.push({
            title: title || 'Untitled',
            group_name: group.group_name,
            students: group.students || [],
            displayType: displayType || 'N/A',
            displayStatus: displayStatus
        });
    });

    // --- Pagination Logic ---
    const totalPages = Math.ceil(filteredGroups.length / rowsPerPageAdvisory);
    if (currentPageAdvisory > totalPages && totalPages > 0) currentPageAdvisory = totalPages;
    if (currentPageAdvisory < 1) currentPageAdvisory = 1;

    const startIndex = (currentPageAdvisory - 1) * rowsPerPageAdvisory;
    const paginatedGroups = filteredGroups.slice(startIndex, startIndex + rowsPerPageAdvisory);

    if (paginatedGroups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No records found for this filter.</td></tr>';
        updatePaginationUIAdvisory(totalPages);
        return;
    }

    paginatedGroups.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span style="font-weight:600; color:var(--primary-color);">${item.title}</span></td>
            <td>${item.group_name}</td>
            <td>
                <div class="chips-container">
                    ${item.students.map(m => `<span class="chip">${m.full_name}</span>`).join('')}
                </div>
            </td>
            <td><span class="type-badge ${getTypeClass(item.displayType)}">${item.displayType}</span></td>
            <td><span class="status-badge ${item.displayStatus === 'Not Scheduled' ? 'rejected' : 'pending'}">${item.displayStatus}</span></td>
        `;
        tbody.appendChild(row);
    });

    updatePaginationUIAdvisory(totalPages);
}

function updatePaginationUIAdvisory(totalPages) {
    let paginationContainer = document.getElementById('advisoryPagination');
    if (!paginationContainer) {
        const tableContainer = document.querySelector('#advisoryTableBody').closest('.table-container') || document.querySelector('#advisoryTableBody').parentElement;
        if (tableContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'advisoryPagination';
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
        <button class="page-btn prev" ${currentPageAdvisory === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePageAdvisory(${currentPageAdvisory - 1})"`}>Previous</button>
        <span class="page-number active">${currentPageAdvisory}</span>
        <button class="page-btn next" ${currentPageAdvisory === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePageAdvisory(${currentPageAdvisory + 1})"`}>Next</button>
    `;
}

window.changePageAdvisory = (newPage) => {
    currentPageAdvisory = newPage;
    renderAdvisoryTable();
};

function getTypeClass(type) {
    type = type.toLowerCase();
    if (type.includes('title')) return 'type-title';
    if (type.includes('pre')) return 'type-pre-oral';
    if (type.includes('final')) return 'type-final';
    return 'type-unknown';
}

// Search Filter
// Search Filter
document.getElementById('searchInput')?.addEventListener('input', () => {
    applyFilters();
});

window.setFilter = (type, btn) => {
    currentTypeFilter = type;

    // Visual Update
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    currentPageEval = 1;
    applyFilters();
};

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    // Get User Info for Tab Filtering
    const userJson = localStorage.getItem('loginUser');
    const user = userJson ? JSON.parse(userJson) : null;
    const userName = user ? (user.name || user.full_name || '').toLowerCase() : '';

    const filtered = loadedEvaluations.filter(group => {
        const adviser = (group.adviser || '').toLowerCase().replace(/\s*\(creator:[^)]+\)/gi, '');
        const isAdviser = adviser.includes(userName) || (userName && userName.includes(adviser));

        // Advisers must not view panel evaluations of groups where they are the adviser
        if (isAdviser) {
            return false;
        }

        let creatorEmail = '';
        const match = (group.adviser || '').match(/\(creator:([^)]+)\)/);
        if (match) {
            creatorEmail = match[1].trim().toLowerCase();
        }

        let matchesCreator = false;
        if (creatorEmail && user && user.email) {
            matchesCreator = (creatorEmail === user.email.toLowerCase());
        }

        if (userName === 'christian rae salvacion' &&
            (group.groupName.toLowerCase() === 'aetheris' || group.groupName.toLowerCase() === 'faith in motion')) {
            matchesCreator = true;
        }

        if (!matchesCreator) return false;

        const matchesText = group.groupName.toLowerCase().includes(searchTerm) ||
            group.program.toLowerCase().includes(searchTerm);

        let matchesType = false;
        if (currentTypeFilter === 'ALL') {
            matchesType = Object.keys(group.defenses).length > 0;
        } else if (currentTypeFilter === 'title' && group.defenses['titledefense']) {
            matchesType = true;
        } else if (currentTypeFilter === 'pre' && group.defenses['preoraldefense']) {
            matchesType = true;
        } else if (currentTypeFilter === 'final' && group.defenses['finaldefense']) {
            matchesType = true;
        }

        return matchesText && matchesType;
    });

    renderAccordions(filtered);
}

// Keep track of which inner tab is active per accordion
let activeInnerTabs = {};

window.switchEvalInnerTab = (groupId, tabKey, event) => {
    if (event) event.stopPropagation();

    activeInnerTabs[groupId] = tabKey;

    const cardBody = document.getElementById(`body-${groupId}`);
    if (!cardBody) return;

    const tabs = cardBody.querySelectorAll('.inner-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabKey) {
            tab.classList.add('active');
            tab.style.borderBottom = '2px solid var(--primary-color)';
            tab.style.color = 'var(--primary-color)';
        } else {
            tab.classList.remove('active');
            tab.style.borderBottom = 'none';
            tab.style.color = '#64748b';
        }
    });

    const contents = cardBody.querySelectorAll('.inner-tab-content');
    contents.forEach(content => {
        if (content.dataset.content === tabKey) {
            content.style.display = 'block';
        } else {
            content.style.display = 'none';
        }
    });
};

function renderAccordions(evaluations) {
    const container = document.getElementById('accordionContainer');
    container.innerHTML = '';

    const totalPages = Math.ceil(evaluations.length / rowsPerPageEval);
    if (currentPageEval > totalPages && totalPages > 0) currentPageEval = totalPages;
    if (currentPageEval < 1) currentPageEval = 1;

    const startIndex = (currentPageEval - 1) * rowsPerPageEval;
    const paginatedEvaluations = evaluations.slice(startIndex, startIndex + rowsPerPageEval);

    if (paginatedEvaluations.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 20px; color:#64748b;">No evaluations match your search.</p>';
        updatePaginationUIEval(totalPages, evaluations);
        return;
    }

    paginatedEvaluations.forEach(group => {
        const card = document.createElement('div');
        card.className = 'evaluation-card';
        card.style.background = 'white';
        card.style.borderRadius = '16px';
        card.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
        card.style.border = '1px solid #f0f0f0';
        card.style.overflow = 'hidden';
        card.style.marginBottom = '15px';

        const program = (group.program || '').toUpperCase();
        let progColor = '#64748b'; let progBg = '#f1f5f9';
        if (program.includes('BSIS')) { progColor = '#0284c7'; progBg = '#e0f2fe'; }
        else if (program.includes('BSIT')) { progColor = '#16a34a'; progBg = '#dcfce7'; }
        else if (program.includes('BSCS')) { progColor = '#dc2626'; progBg = '#fee2e2'; }

        let adviserClean = group.adviser ? group.adviser.replace(/\s*\(creator:[^)]+\)/gi, '') : 'None Array';

        card.innerHTML = `
             <div class="card-header" onclick="toggleAccordion('${group.id}')" style="cursor: pointer; padding: 20px; display: flex; justify-content: space-between; align-items: center; background: white; transition: background 0.2s;">
                 <div style="flex: 1; display: grid; grid-template-columns: 2fr 1fr 2fr; gap: 20px; align-items: center;">
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Group Name</span>
                        <span style="font-size: 1.1rem; font-weight: 700; color: #1e293b;">${group.groupName}</span>
                    </div>
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Program</span>
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; color: ${progColor}; background: ${progBg};">${program}</span>
                    </div>
                    <div>
                        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Group Adviser</span>
                        <div style="display: flex; align-items: center; gap: 6px; color: #475569; font-size: 13px; font-weight: 500;">
                            <span class="material-icons-round" style="font-size: 16px; color: #94a3b8;">school</span>
                            ${adviserClean}
                        </div>
                    </div>
                 </div>
                 <span class="material-icons-round expand-icon" id="icon-${group.id}" style="color: #cbd5e1; transition: transform 0.3s; font-size: 24px; margin-left: 15px;">expand_more</span>
             </div>
             <div class="card-body" id="body-${group.id}" style="display: none; border-top: 1px solid #f1f5f9;">
                 <div style="display: flex; gap: 0; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0 15px; margin-top: 5px;">
                     <button class="inner-tab" data-tab="titledefense" onclick="switchEvalInnerTab('${group.id}', 'titledefense', event)" style="padding: 12px 20px; font-size: 13px; font-weight: 600; color: #64748b; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">Title Defense</button>
                     <button class="inner-tab" data-tab="preoraldefense" onclick="switchEvalInnerTab('${group.id}', 'preoraldefense', event)" style="padding: 12px 20px; font-size: 13px; font-weight: 600; color: #64748b; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">Pre-Oral Defense</button>
                     <button class="inner-tab" data-tab="finaldefense" onclick="switchEvalInnerTab('${group.id}', 'finaldefense', event)" style="padding: 12px 20px; font-size: 13px; font-weight: 600; color: #64748b; background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">Final Defense</button>
                 </div>
                 <div class="card-content" style="padding: 20px;">
                     ${getCardContentGrouped(group)}
                 </div>
             </div>
         `;
        container.appendChild(card);

        let initialTab = currentTypeFilter === 'title' ? 'titledefense'
            : currentTypeFilter === 'pre' ? 'preoraldefense'
                : currentTypeFilter === 'final' ? 'finaldefense'
                    : 'titledefense';

        setTimeout(() => switchEvalInnerTab(group.id, initialTab, null), 10);
    });

    updatePaginationUIEval(totalPages, evaluations);
}

let currentFilteredEvaluations = [];

function updatePaginationUIEval(totalPages, evaluations) {
    currentFilteredEvaluations = evaluations;
    let paginationContainer = document.getElementById('evalPagination');
    if (!paginationContainer) {
        const accordionContainer = document.getElementById('accordionContainer');
        if (accordionContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'evalPagination';
            paginationContainer.className = 'pagination';
            paginationContainer.style.justifyContent = 'flex-end';
            paginationContainer.style.marginTop = '20px';
            accordionContainer.after(paginationContainer);
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
        <button class="page-btn prev" ${currentPageEval === 1 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePageEval(${currentPageEval - 1})"`}>Previous</button>
        <span class="page-number active">${currentPageEval}</span>
        <button class="page-btn next" ${currentPageEval === totalPages ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : `onclick="changePageEval(${currentPageEval + 1})"`}>Next</button>
    `;
}

window.changePageEval = (newPage) => {
    currentPageEval = newPage;
    renderAccordions(currentFilteredEvaluations);
};

function getCardContentGrouped(group) {
    const renderDefense = (dKey) => {
        const defense = group.defenses[dKey];
        if (!defense) {
            return `
                <div style="padding: 40px; text-align: center; color: #94a3b8; background: #fafafa; border-radius: 12px; border: 1px dashed #e2e8f0;">
                    <span class="material-icons-round" style="font-size: 32px; color: #cbd5e1; margin-bottom: 10px; display: block;">assignment_late</span>
                    No evaluation data available for ${dKey.replace('defense', ' defense')}.
                </div>
            `;
        }

        const isMultiPage = dKey.includes('pre') || dKey.includes('final');
        let html = '';

        if (isMultiPage) {
            html += `
                <div class="switcher-tabs">
                    <button class="switcher-btn active" id="btn-p1-${group.id}-${dKey}" onclick="switchPageGrouped('${group.id}-${dKey}', 1)">
                        <span class="material-icons-round">person</span> Individual Ratings
                    </button>
                    <button class="switcher-btn" id="btn-p2-${group.id}-${dKey}" onclick="switchPageGrouped('${group.id}-${dKey}', 2)">
                        <span class="material-icons-round">dvr</span> System Ratings
                    </button>
                </div>
            `;
        }

        html += `<div class="eval-step active" id="step1-${group.id}-${dKey}">`;
        html += renderIndividualTable(group, defense);

        if (isMultiPage) {
            html += `
                <div style="margin-top: 25px; text-align: right; border-top: 1px solid #f1f5f9; padding-top: 20px;">
                    <button class="btn-save" onclick="switchPageGrouped('${group.id}-${dKey}', 2)" 
                            style="padding: 10px 20px; border-radius: 10px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.2); border: none; background: var(--primary-color); color: white; cursor: pointer; transition: all 0.2s;">
                        View System Project 
                        <span class="material-icons-round" style="font-size: 20px;">arrow_forward</span>
                    </button>
                </div>
            `;
        }
        html += `</div>`;

        if (isMultiPage) {
            html += `<div class="eval-step" id="step2-${group.id}-${dKey}">`;
            html += renderSystemTable(group, defense);
            html += `
                <div style="margin-top: 30px; display: flex; justify-content: flex-start; align-items: center; border-top: 1px solid #f1f5f9; padding-top: 25px;">
                    <button class="btn-cancel" onclick="switchPageGrouped('${group.id}-${dKey}', 1)" 
                            style="padding: 10px 20px; border-radius: 10px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid #e2e8f0; background: white; color: #64748b; cursor: pointer; transition: all 0.2s;">
                        <span class="material-icons-round" style="font-size: 20px;">arrow_back</span>
                        Back to Individual
                    </button>
                </div>
            </div>`;
        }

        return html;
    };

    return `
        <div class="inner-tab-content active" data-content="titledefense">${renderDefense('titledefense')}</div>
        <div class="inner-tab-content" data-content="preoraldefense" style="display:none;">${renderDefense('preoraldefense')}</div>
        <div class="inner-tab-content" data-content="finaldefense" style="display:none;">${renderDefense('finaldefense')}</div>
    `;
}

window.switchPageGrouped = (tabId, stepIdx) => {
    document.getElementById(`step1-${tabId}`).classList.remove('active');
    document.getElementById(`step2-${tabId}`).classList.remove('active');
    document.getElementById(`btn-p1-${tabId}`).classList.remove('active');
    document.getElementById(`btn-p2-${tabId}`).classList.remove('active');

    document.getElementById(`step${stepIdx}-${tabId}`).classList.add('active');
    document.getElementById(`btn-p${stepIdx}-${tabId}`).classList.add('active');
};

function renderIndividualTable(group, defense) {
    let headerCols = '';
    defense.panelists.forEach((pName, idx) => {
        headerCols += `<th style="padding: 12px; border-bottom: 2px solid #e2e8f0;">${pName}<br><span style="font-size: 10px; color: #9ca3af; font-weight: 400; text-transform: none;">Panel ${idx + 1}</span></th>`;
    });

    let rows = '';
    group.members.forEach((student) => {
        let inputs = '';
        defense.panelists.forEach(pName => {
            const savedScoreObj = defense.savedScores.individual.find(s => s.student_id === student.id && s.panelist_name === pName);
            const scoreVal = savedScoreObj ? savedScoreObj.total_score : '-';
            inputs += `<td style="font-weight: 800; color: var(--primary-color); text-align: center; font-size: 1.1rem; padding: 12px; border-bottom: 1px solid #f1f5f9;">${scoreVal}</td>`;
        });
        rows += `
            <tr style="transition: background 0.2s;">
                <td style="text-align: left; padding: 12px; border-bottom: 1px solid #f1f5f9; font-weight: 700; color: #1e293b; background: white;">${student.full_name}</td>
                ${inputs}
            </tr>
        `;
    });

    return `
        <div style="margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span class="material-icons-round" style="color: var(--primary-color); font-size: 20px;">person_outline</span>
                <h4 style="color: #334155; font-size: 1rem; font-weight: 700; margin: 0;">Individual Rating of Presenters (Total Scores)</h4>
            </div>
        </div>
        <div class="table-responsive" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: white;">
            <table class="eval-table" style="min-width: unset; width: 100%; margin: 0; border: none;">
                <thead>
                    <tr style="background: #f8fafc;">
                        <th style="text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase;">Student Name</th>
                        ${headerCols}
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function renderSystemTable(group, defense) {
    let rows = '';
    defense.panelists.forEach((pName, idx) => {
        const savedScoreObj = defense.savedScores.system.find(s => s.panelist_name === pName);
        const scoreVal = savedScoreObj ? savedScoreObj.total_score : '-';
        rows += `
            <tr style="transition: background 0.2s;">
                <td style="text-align: left; padding: 12px; border-bottom: 1px solid #f1f5f9; background: white;">
                    <div style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">${pName}</div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Panel ${idx + 1}</div>
                </td>
                <td style="font-weight: 800; color: var(--primary-color); text-align: center; font-size: 1.15rem; padding: 12px; border-bottom: 1px solid #f1f5f9; background: #fdfdfd;">
                    ${scoreVal}
                </td>
            </tr>
        `;
    });

    return `
        <div style="margin-bottom: 15px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                <span class="material-icons-round" style="color: var(--primary-color); font-size: 20px;">dvr</span>
                <h4 style="color: #334155; font-size: 1rem; font-weight: 700; margin: 0;">System Project Evaluation (Total Scores per Panelist)</h4>
            </div>
        </div>
        <div class="table-responsive" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background: white; max-width: 600px;">
            <table class="eval-table" style="min-width: unset; width: 100%; margin: 0; border: none;">
                <thead>
                    <tr style="background: #f8fafc;">
                        <th style="min-width: 200px; text-align: left; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase;">Panelist</th>
                        <th style="width: 120px; text-align: center; padding: 12px; border-bottom: 2px solid #e2e8f0; color: #64748b; font-size: 12px; text-transform: uppercase;">Total Score</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

// Helpers
window.toggleAccordion = (id) => {
    const body = document.getElementById(`body-${id}`);
    const icon = document.getElementById(`icon-${id}`);

    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.textContent = 'expand_less';
        icon.style.color = 'var(--primary-color)';
    } else {
        body.style.display = 'none';
        icon.textContent = 'expand_more';
        icon.style.color = '#888';
    }
};

window.switchPage = (id, page) => {
    const step1 = document.getElementById(`step1-${id}`);
    const step2 = document.getElementById(`step2-${id}`);
    const btn1 = document.getElementById(`btn-p1-${id}`);
    const btn2 = document.getElementById(`btn-p2-${id}`);

    if (page === 1) {
        step1.classList.add('active');
        step2?.classList.remove('active'); // Optional chaining if single page
        btn1?.classList.add('active');
        btn2?.classList.remove('active');
    } else {
        step1.classList.remove('active');
        step2.classList.add('active');
        btn1.classList.remove('active');
        btn2.classList.add('active');
    }
};

// --- Custom Rubric Tooltip Logic ---
function initTooltip() {
    if (!document.getElementById('rubricTooltip')) {
        const tip = document.createElement('div');
        tip.id = 'rubricTooltip';
        tip.style.cssText = `
            position: fixed;
            background: rgba(15, 23, 42, 0.98);
            color: white;
            padding: 16px 20px;
            border-radius: 12px;
            font-size: 13px;
            max-width: 90vw;
            width: 380px;
            z-index: 100000;
            display: none;
            box-shadow: 0 10px 40px rgba(0,0,0,0.4);
            line-height: 1.5;
            transition: opacity 0.2s, transform 0.2s;
            border-left: 5px solid #ffcc00;
            max-height: 80vh;
            overflow-y: auto;
        `;
        document.body.appendChild(tip);

        // Add overlay for mobile
        const overlay = document.createElement('div');
        overlay.id = 'rubricOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 99999;
            display: none;
            backdrop-filter: blur(2px);
        `;
        overlay.onclick = hideRubricTip;
        document.body.appendChild(overlay);
    }
}

window.showRubricTip = (event, criteriaName, isSystem = false) => {
    initTooltip();
    const criteria = isSystem
        ? systemCriteria.find(c => c.name === criteriaName)
        : individualCriteria.find(c => c.name === criteriaName);

    if (!criteria) return;

    const tip = document.getElementById('rubricTooltip');
    const overlay = document.getElementById('rubricOverlay');
    const isMobile = window.innerWidth <= 768;

    tip.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
            <div style="font-weight: 700; color: #ffcc00; font-size: 14px;">
                ${criteriaName} Rubric
            </div>
            ${isMobile ? '<span class="material-icons-round" onclick="hideRubricTip()" style="cursor:pointer; font-size: 18px; color: #94a3b8;">close</span>' : ''}
        </div>
        <div style="display: grid; gap: 12px;">
            <div style="font-size: 12px; background: rgba(74, 222, 128, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #4ade80;">4 - Excellent:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[4]}</span></div>
            <div style="font-size: 12px; background: rgba(251, 191, 36, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #fbbf24;">3 - Good:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[3]}</span></div>
            <div style="font-size: 12px; background: rgba(248, 113, 113, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #f87171;">2 - Fair:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[2]}</span></div>
            <div style="font-size: 12px; background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 6px;"><strong style="color: #ef4444;">1 - Needs Improvement:</strong><br> <span style="opacity: 0.95;">${criteria.rubrics[1]}</span></div>
        </div>
    `;

    tip.style.display = 'block';

    if (isMobile) {
        overlay.style.display = 'block';
        tip.style.left = '50%';
        tip.style.top = '50%';
        tip.style.transform = 'translate(-50%, -50%)';
        tip.style.width = '90vw';
        tip.style.pointerEvents = 'auto';
    } else {
        tip.style.pointerEvents = 'none';
        tip.style.transform = 'none';
        tip.style.width = '380px';
        const rect = event.currentTarget.getBoundingClientRect();
        const tipWidth = 380;

        let x = rect.right + 20;
        let y = event.clientY - 50;

        if (x + tipWidth > window.innerWidth) {
            x = rect.left - tipWidth - 20;
        }

        const tipHeight = tip.offsetHeight || 300;
        if (y + tipHeight > window.innerHeight) {
            y = window.innerHeight - tipHeight - 20;
        }
        if (y < 20) y = 20;

        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }
};

window.hideRubricTip = () => {
    const tip = document.getElementById('rubricTooltip');
    const overlay = document.getElementById('rubricOverlay');
    if (tip) tip.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
};
