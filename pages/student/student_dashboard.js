// Initialize Supabase client
// Note: PROJECT_URL, PUBLIC_KEY, and supabaseClient are already defined in ../../assets/js/shared.js
// We use the existing client to avoid "Identifier already declared" errors.

document.addEventListener('DOMContentLoaded', () => {
    loadSubmissionData();
});

async function loadSubmissionData() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../index.html';
        return;
    }

    let groupId = loginUser.id;

    // Global variable linking
    if (!window.currentLinks) window.currentLinks = {};

    try {
        const { data: group, error } = await supabaseClient
            .from('student_groups')
            .select('*, students(id, grades(grade, grade_type))') // Fetch students & grades
            .eq('id', groupId)
            .single();

        if (error) {
            console.error('Error fetching group:', error);
            if (loginUser.role) {
                alert("You are logged in as " + loginUser.role + ". This page is for Student Groups.");
            }
            return;
        }

        if (group) {
            // --- Check Grading Status for Tab Locking ---
            const students = group.students || [];
            const totalStudents = students.length;

            // Helper to check if ALL students have a grade for a specific stage
            const checkGraded = (keyword) => {
                if (totalStudents === 0) return false;
                const gradedCount = students.filter(s =>
                    s.grades && s.grades.some(g => g.grade_type && g.grade_type.includes(keyword))
                ).length;
                return gradedCount === totalStudents;
            };

            const isTitleGraded = checkGraded('Title');
            const isPreOralGraded = checkGraded('Pre'); // Matches "Pre-Oral" or "Pre Oral"

            // Lock/Unlock Tabs
            const preOralBtn = document.querySelector('button[onclick*="preoral"]');
            const finalBtn = document.querySelector('button[onclick*="final"]');

            // Logic: Pre-Oral requires Title to be graded
            if (!isTitleGraded) {
                preOralBtn.disabled = true;
                preOralBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed';
                preOralBtn.title = "Locked: Title Defense grades pending.";
                preOralBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            }

            // Logic: Final requires Pre-Oral to be graded
            if (!isPreOralGraded) {
                finalBtn.disabled = true;
                finalBtn.style.opacity = '0.5';
                finalBtn.style.cursor = 'not-allowed';
                finalBtn.title = "Locked: Pre-Oral grades pending.";
                finalBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            }

            // Function to safely parse JSON
            const safeParse = (str) => {
                try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
            };

            // Parse File Links
            let tLinks = safeParse(group.title_link);
            if (group.title_link && typeof group.title_link === 'string' && !group.title_link.startsWith('{')) tLinks = { title1: group.title_link };

            // Load Project Title(s)
            let projectTitles = {};
            try {
                projectTitles = JSON.parse(group.project_title || '{}');
            } catch (e) {
                // Backward compatibility: if simple string
                projectTitles = { title1: group.project_title || '' };
            }

            // Populate inputs
            if (document.getElementById('projectTitle1')) document.getElementById('projectTitle1').value = projectTitles.title1 || '';
            if (document.getElementById('projectTitle2')) document.getElementById('projectTitle2').value = projectTitles.title2 || '';
            if (document.getElementById('projectTitle3')) document.getElementById('projectTitle3').value = projectTitles.title3 || '';

            let pLinks = safeParse(group.pre_oral_link);
            let fLinks = safeParse(group.final_link);

            // Fetch Defense Statuses from the new table
            const { data: defStatuses, error: dsError } = await supabaseClient
                .from('defense_statuses')
                .select('*')
                .eq('group_id', groupId);

            if (dsError) {
                console.error('Error fetching defense statuses:', dsError);
            }

            // Helper to get status/remarks for a specific type
            const getDS = (type) => {
                const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
                return defStatuses ? defStatuses.find(ds => ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) : null;
            };

            const titleDS = getDS('Title Defense');
            const preOralDS = getDS('Pre-Oral Defense');
            const finalDS = getDS('Final Defense');

            // Map Statuses
            let tStatus = titleDS ? (titleDS.statuses || {}) : {};
            let pStatus = preOralDS ? (preOralDS.statuses || {}) : {};
            let fStatus = finalDS ? (finalDS.statuses || {}) : {};

            // Map Remarks
            let tRemarks = titleDS ? (titleDS.remarks || {}) : {};
            let pRemarks = preOralDS ? (preOralDS.remarks || {}) : {};
            let fRemarks = finalDS ? (finalDS.remarks || {}) : {};

            // Helper to render status badge and remarks
            const renderField = (linkMap, statusMap, remarksMap, key, elementId) => {
                const el = document.getElementById(elementId);
                if (!el) return;

                el.value = linkMap[key] || '';

                const rawStatus = statusMap[key] || 'Pending';
                const rawRemarks = remarksMap[key] || {}; // Now expecting object or string

                // --- Multi-Panel Logic ---
                let feedbackData = []; // Array of { panel, status, remarks }

                if (typeof rawStatus === 'object') {
                    // Modern structure: { "Panel Name": "Approved" }
                    Object.keys(rawStatus).forEach(panel => {
                        feedbackData.push({
                            panel: panel,
                            status: rawStatus[panel],
                            remarks: typeof rawRemarks === 'object' ? (rawRemarks[panel] || '') : ''
                        });
                    });
                } else {
                    // Compatibility with old single-string format
                    feedbackData.push({
                        panel: 'Panel',
                        status: rawStatus,
                        remarks: typeof rawRemarks === 'string' ? rawRemarks : ''
                    });
                }

                // 1. Label & Badge Wrapper
                const prevEl = el.previousElementSibling;
                if (prevEl && (prevEl.classList.contains('status-badge-container') || prevEl.innerText === 'Link')) {
                    prevEl.remove();
                }

                // Prepare Badge HTML (can be multiple)
                const badgesHtml = feedbackData.map(f => {
                    let color = '#64748b'; let icon = 'hourglass_empty'; let bg = '#f1f5f9'; let border = '#e2e8f0';
                    if (f.status.includes('Approved')) {
                        color = '#059669'; icon = 'check_circle'; bg = '#f0fdf4'; border = '#bbf7d0';
                    } else if (f.status.includes('Approve with Revisions')) {
                        color = '#d97706'; icon = 'warning'; bg = '#fffbeb'; border = '#fde68a';
                    } else if (f.status.includes('Rejected') || f.status.includes('Redefense')) {
                        color = '#dc2626'; icon = 'cancel'; bg = '#fef2f2'; border = '#fecaca';
                    }

                    return `
                        <div style="font-size: 0.65rem; font-weight: 700; color: ${color}; background: ${bg}; border: 1px solid ${border}; padding: 2px 6px; border-radius: 6px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;" title="${f.panel}">
                            <span class="material-icons-round" style="font-size: 10px;">${icon}</span>
                            ${f.status} ${feedbackData.length > 1 ? `<span style="opacity:0.6; font-size:9px;">(${f.panel})</span>` : ''}
                        </div>
                    `;
                }).join('');

                const headerHtml = `
                    <div class="status-badge-container" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 6px;">
                        <span style="font-size: 0.85rem; font-weight: 600; color: #475569;">Submission Link</span>
                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                            ${badgesHtml}
                        </div>
                    </div>
                `;
                el.insertAdjacentHTML('beforebegin', headerHtml);

                // 2. Remarks (Clean Design)
                const nextEl = el.nextElementSibling;
                if (nextEl && nextEl.classList.contains('remarks-container')) nextEl.remove();

                const validRemarks = feedbackData.filter(f => f.remarks && f.remarks.trim() !== '');
                if (validRemarks.length > 0) {
                    const remarksHtml = validRemarks.map(f => {
                        let color = '#64748b'; let bg = '#f1f5f9';
                        if (f.status.includes('Approved')) { color = '#059669'; bg = '#f0fdf4'; }
                        else if (f.status.includes('Approve with Revisions')) { color = '#d97706'; bg = '#fffbeb'; }
                        else if (f.status.includes('Rejected') || f.status.includes('Redefense')) { color = '#dc2626'; bg = '#fef2f2'; }

                        let headerText = f.panel;
                        let bodyText = f.remarks;
                        if (f.remarks.includes(':')) {
                            const parts = f.remarks.split(':');
                            headerText = parts[0].trim();
                            bodyText = parts.slice(1).join(':').trim();
                        }

                        return `
                            <div class="remarks-container" style="margin-top: 8px; background: ${bg}; opacity: 0.9; border-left: 3px solid ${color}; border-radius: 0 6px 6px 0; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span class="material-icons-round" style="font-size: 14px; color: ${color};">face</span>
                                    <span style="font-size: 0.75rem; font-weight: 700; color: ${color}; text-transform: uppercase;">${headerText}</span>
                                </div>
                                <div style="font-size: 0.9rem; color: #334155; line-height: 1.5; margin-left: 20px;">
                                    ${bodyText}
                                </div>
                            </div>
                        `;
                    }).join('');
                    el.insertAdjacentHTML('afterend', remarksHtml);
                }
            };

            // Render Titles
            renderField(tLinks, tStatus, tRemarks, 'title1', 'titleLink1');
            renderField(tLinks, tStatus, tRemarks, 'title2', 'titleLink2');
            renderField(tLinks, tStatus, tRemarks, 'title3', 'titleLink3');

            // Render Pre-Oral
            renderField(pLinks, pStatus, pRemarks, 'ch1', 'preOralCh1');
            renderField(pLinks, pStatus, pRemarks, 'ch2', 'preOralCh2');
            renderField(pLinks, pStatus, pRemarks, 'ch3', 'preOralCh3');

            // Render Final
            renderField(fLinks, fStatus, fRemarks, 'ch4', 'finalCh4');
            renderField(fLinks, fStatus, fRemarks, 'ch5', 'finalCh5');

            // Store links in window.currentLinks - Handled globally now
            window.currentLinks = {
                titles: tLinks,
                preoral: pLinks,
                final: fLinks
            };

        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

// Global Tab Switching Logic
window.switchSubTab = (stageId, index, btn) => {
    const parent = document.getElementById('tab-' + stageId);
    if (!parent) return;

    parent.querySelectorAll('.sub-tab-content').forEach(el => el.classList.remove('active'));

    const target = document.getElementById(`${stageId}-content-${index}`);
    if (target) target.classList.add('active');

    parent.querySelectorAll('.sub-tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
};

window.switchSubmissionTab = (tabId, btn) => {
    // 1. Update UI Tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');

    // Reset sub-tabs to the first one when switching main tabs
    const parent = document.getElementById('tab-' + tabId);
    const firstSubBtn = parent.querySelector('.sub-tab-btn');
    if (firstSubBtn && tabId !== 'titles') {
        // For titles, we don't want to auto-switch if they are clicking manually, 
        // but initial load needs it. 
        // Actually, just standard reset is fine.
        const firstIndex = tabId === 'final' ? 4 : 1;
        // logic for titles is 1, preoral 1, final 4? 
        // Titles IDs are 1,2,3. Preoral 1,2,3. Final 4,5.
        // Wait, preoral IDs in HTML are: preoral-content-1, 2, 3.
        // Final IDs: final-content-4, 5.
        // Title IDs: titles-content-1, 2, 3.

        let idx = 1;
        if (tabId === 'final') idx = 4;

        window.switchSubTab(tabId, idx, firstSubBtn);
    }

    // 2. Button/Input Locking Update
    updateSaveButtonState(tabId);
};

function updateSaveButtonState(tabId) {
    const saveBtn = document.querySelector('.save-btn');
    if (!saveBtn) return;

    const hasAnyData = (obj) => Object.values(obj || {}).some(val => val && val.trim() !== '');

    // Ensure globally stored links are available
    if (!window.currentLinks) window.currentLinks = {};

    const stageLinks = window.currentLinks[tabId === 'titles' ? 'titles' : tabId === 'preoral' ? 'preoral' : 'final'];
    const isSubmitted = hasAnyData(stageLinks);

    if (isSubmitted) {
        saveBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.7';
        saveBtn.style.cursor = 'default';

        // Lock inputs
        const tabEl = document.querySelector(`#tab-${tabId}`);
        if (tabEl) {
            tabEl.querySelectorAll('input').forEach(input => {
                input.readOnly = true;
                input.style.backgroundColor = '#f1f5f9';
                input.placeholder = 'Submitted (View Only)';
            });
        }
    } else {
        saveBtn.innerHTML = '<span class="material-icons-round">save</span> Save Submissions';
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';

        // Unlock inputs
        const tabEl = document.querySelector(`#tab-${tabId}`);
        if (tabEl) {
            tabEl.querySelectorAll('input').forEach(input => {
                input.readOnly = false;
                input.style.backgroundColor = '#f8fafc';
                input.placeholder = input.id.includes('title') ? 'Title Link' : 'Chapter Link';
            });
        }
    }
}

const showToast = (message, type = 'info') => {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');

    msg.innerText = message;

    if (type === 'success') {
        toast.style.backgroundColor = '#10b981';
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#ef4444';
        icon.innerText = 'error';
    } else if (type === 'warning') {
        toast.style.backgroundColor = '#f59e0b';
        icon.innerText = 'warning';
    } else {
        toast.style.backgroundColor = '#333';
        icon.innerText = 'info';
    }

    toast.style.visibility = 'visible';
    toast.style.animation = 'fadeIn 0.5s, fadeOut 0.5s 2.5s';

    setTimeout(() => {
        toast.style.visibility = 'hidden';
    }, 3000);
};

// Add CSS for animation
const style = document.createElement('style');
style.innerHTML = `
@keyframes fadeIn { from {opacity: 0;} to {opacity: 1;} }
@keyframes fadeOut { from {opacity: 1;} to {opacity: 0;} }
`;
document.head.appendChild(style);

window.saveSubmissions = async function () {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        showToast('You must be logged in to save.', 'error');
        return;
    }

    const btn = document.querySelector('.save-btn');
    const originalContent = btn.innerHTML; // Save original HTML (icon + text)

    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Saving...';
    btn.disabled = true;

    const activeTab = document.querySelector('.tab-btn.active');
    const tabId = activeTab.innerText.toLowerCase().includes('title') ? 'titles' :
        activeTab.innerText.toLowerCase().includes('pre') ? 'preoral' : 'final';

    // Collect data ONLY for the active tab
    let updates = {};
    let activeLinks = {};

    if (tabId === 'titles') {
        activeLinks = {
            title1: document.getElementById('titleLink1').value.trim(),
            title2: document.getElementById('titleLink2').value.trim(),
            title3: document.getElementById('titleLink3').value.trim()
        };
        updates.title_link = JSON.stringify(activeLinks);

        // Save Project Titles (All 3)
        const pTitles = {
            title1: document.getElementById('projectTitle1') ? document.getElementById('projectTitle1').value.trim() : '',
            title2: document.getElementById('projectTitle2') ? document.getElementById('projectTitle2').value.trim() : '',
            title3: document.getElementById('projectTitle3') ? document.getElementById('projectTitle3').value.trim() : ''
        };
        updates.project_title = JSON.stringify(pTitles);
    } else if (tabId === 'preoral') {
        activeLinks = {
            ch1: document.getElementById('preOralCh1').value.trim(),
            ch2: document.getElementById('preOralCh2').value.trim(),
            ch3: document.getElementById('preOralCh3').value.trim()
        };
        updates.pre_oral_link = JSON.stringify(activeLinks);
    } else if (tabId === 'final') {
        activeLinks = {
            ch4: document.getElementById('finalCh4').value.trim(),
            ch5: document.getElementById('finalCh5').value.trim()
        };
        updates.final_link = JSON.stringify(activeLinks);
    }

    // Basic Validation: Ensure at least one link is provided
    if (!Object.values(activeLinks).some(v => v !== '')) {
        showToast('Please provide at least one link before saving.', 'warning');
        btn.innerHTML = originalContent;
        btn.disabled = false;
        return;
    }

    try {
        const { error } = await supabaseClient
            .from('student_groups')
            .update(updates)
            .eq('id', loginUser.id);

        if (error) throw error;

        showToast('Submissions saved successfully!', 'success');

        // Update local state and lock current tab only
        window.currentLinks[tabId] = activeLinks;
        window.switchSubmissionTab(tabId, activeTab);

    } catch (err) {
        console.error('Submission error:', err);

        // Restore button only if there was an error
        btn.innerHTML = originalContent;
        btn.disabled = false;

        if (err.message && err.message.includes('schema cache')) {
            showToast('System Error: Database schema out of sync. Please contact Administrator.', 'error');
        } else {
            showToast('Failed to save: ' + err.message, 'error');
        }
    }
}

