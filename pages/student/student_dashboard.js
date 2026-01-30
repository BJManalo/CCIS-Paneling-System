// Initialize Supabase client
// Note: PROJECT_URL, PUBLIC_KEY, and supabaseClient are already defined in ../../assets/js/shared.js
const ADOBE_CLIENT_ID = '5edc19dfde9349e3acb7ecc73bfa4848';
let currentGroupId = null;
let adobeDCView = null;

document.addEventListener('DOMContentLoaded', () => {
    loadSubmissionData();
});

async function loadSubmissionData() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    let groupId = loginUser.id;
    currentGroupId = groupId;

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
            // --- Fetch Schedules to check if they are allowed to submit ---
            const { data: schedules, error: schedError } = await supabaseClient
                .from('schedules')
                .select('*')
                .eq('group_id', groupId);

            if (schedError) console.error('Error fetching schedules:', schedError);

            const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            const isScheduled = (type) => {
                if (!schedules) return false;
                return schedules.some(s => normalize(s.schedule_type).includes(normalize(type)));
            };

            const isTitleScheduled = isScheduled('Title');
            const isPreOralScheduled = isScheduled('PreOral'); // checks 'preoral'
            const isFinalScheduled = isScheduled('Final');

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
            const titleBtn = document.querySelector('button[onclick*="titles"]');
            const preOralBtn = document.querySelector('button[onclick*="preoral"]');
            const finalBtn = document.querySelector('button[onclick*="final"]');

            // Global State for Schedule status (to use in updateSaveButtonState)
            window.scheduleStatus = {
                title: isTitleScheduled,
                preoral: isPreOralScheduled,
                final: isFinalScheduled
            };

            // Logic: Title requires Schedule
            if (!isTitleScheduled) {
                // If not scheduled, they can VIEW if they somehow have data, but effectively they shouldn't have data if they followed flow.
                // We'll handled read-only in updateSaveButtonState, but visually we might want to indicate it.
                // OPTIONAL: We can lock the tab entirely if we want, but sticking to "Can't submit" usually means read-only or save disabled.
            }

            // Logic: Pre-Oral requires Title to be graded AND Pre-Oral Schedule
            if (!isTitleGraded) {
                preOralBtn.disabled = true;
                preOralBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed';
                preOralBtn.title = "Locked: Title Defense grades pending.";
                preOralBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            } else if (!isPreOralScheduled) {
                // Unlock tab traversal but maybe warning? 
                // Using the requested logic "students can't submit" -> implies maybe they can enter but not save, OR they can't even enter.
                // Usually preventing entry is safest for specific strict phases.
                // However, user might want to see previous stuff? 
                // Let's rely on updateSaveButtonState to disable saving/editing, but allow tab click if previous stage passed.
            }

            // Logic: Final requires Pre-Oral to be graded AND Final Schedule
            if (!isPreOralGraded) {
                finalBtn.disabled = true;
                finalBtn.style.opacity = '0.5';
                preOralBtn.style.cursor = 'not-allowed'; // Typo fix in logic, but standardizing
                finalBtn.style.cursor = 'not-allowed';
                finalBtn.title = "Locked: Pre-Oral grades pending.";
                finalBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
            }

            // Store data for merging later
            localStorage.setItem('lastGroupData', JSON.stringify(group));

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

            // Fetch Defense Statuses and Feedback from both new and legacy tables
            const [dsRes, cfRes] = await Promise.all([
                supabaseClient.from('defense_statuses').select('*').eq('group_id', groupId),
                supabaseClient.from('capstone_feedback').select('*').eq('group_id', groupId)
            ]);

            const defStatuses = dsRes.data || [];
            const capstoneFeedback = cfRes.data || [];

            // Map Statuses and Remarks
            // Priority 1: New capstone_feedback table (Normalized)
            // Priority 2: Legacy defense_statuses (for older data)

            const getFeedbackMaps = (type) => {
                const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
                const statuses = {};
                const remarks = {};
                const annotations = {};

                // Load from legacy first
                const legacy = defStatuses.find(ds => ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
                if (legacy) {
                    Object.entries(legacy.statuses || {}).forEach(([fKey, fVal]) => { statuses[fKey] = fVal; });
                    Object.entries(legacy.remarks || {}).forEach(([fKey, fVal]) => { remarks[fKey] = fVal; });
                }

                // Override/Collect from new table
                capstoneFeedback.filter(cf => cf.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm).forEach(cf => {
                    if (!statuses[cf.file_key] || typeof statuses[cf.file_key] !== 'object') statuses[cf.file_key] = {};
                    if (!remarks[cf.file_key] || typeof remarks[cf.file_key] !== 'object') remarks[cf.file_key] = {};
                    if (!annotations[cf.file_key] || typeof annotations[cf.file_key] !== 'object') annotations[cf.file_key] = {};

                    if (cf.status) statuses[cf.file_key][cf.user_name] = cf.status;
                    if (cf.remarks) remarks[cf.file_key][cf.user_name] = cf.remarks;
                    if (cf.annotated_file_url) annotations[cf.file_key][cf.user_name] = cf.annotated_file_url;
                });

                return { statuses, remarks, annotations };
            };

            const titleData = getFeedbackMaps('Title Defense');
            const preOralData = getFeedbackMaps('Pre-Oral Defense');
            const finalData = getFeedbackMaps('Final Defense');

            // Map variables for rendering
            let tStatus = titleData.statuses;
            let pStatus = preOralData.statuses;
            let fStatus = finalData.statuses;

            let tRemarks = titleData.remarks;
            let pRemarks = preOralData.remarks;
            let fRemarks = finalData.remarks;

            let tAnnot = titleData.annotations;
            let pAnnot = preOralData.annotations;
            let fAnnot = finalData.annotations;

            // Helper to render status badge and remarks
            const renderField = (linkMap, statusMap, remarksMap, annotationsMap, key, elementId) => {
                const el = document.getElementById(elementId);
                if (!el) return;

                el.value = linkMap[key] || '';

                const rawStatus = statusMap[key] || 'Pending';
                const rawRemarks = remarksMap[key] || {};

                let feedbackData = [];

                if (typeof rawStatus === 'object') {
                    Object.keys(rawStatus).forEach(panel => {
                        feedbackData.push({
                            panel: panel,
                            status: rawStatus[panel],
                            remarks: typeof rawRemarks === 'object' ? (rawRemarks[panel] || '') : ''
                        });
                    });
                } else {
                    feedbackData.push({
                        panel: 'Panel',
                        status: rawStatus,
                        remarks: typeof rawRemarks === 'string' ? rawRemarks : ''
                    });
                }

                const prevEl = el.previousElementSibling;
                if (prevEl && (prevEl.classList.contains('status-badge-container') || prevEl.innerText === 'Link')) {
                    prevEl.remove();
                }

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
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                            ${badgesHtml}
                            <div style="display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; margin-top: 2px;">
                                ${linkMap[key] ? `<button onclick="openFileViewer('${linkMap[key]}', '${key}')" style="background: var(--primary-light); color: var(--primary-color); border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;"><span class="material-icons-round" style="font-size: 14px;">visibility</span> View Draft</button>` : ''}
                                ${Object.entries(annotationsMap[key] || {}).map(([panel, url]) => `
                                    <button onclick="openFileViewer('${url}', '${key}', '${panel}')" style="background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s;" title="Annotated by ${panel}">
                                        <span class="material-icons-round" style="font-size: 14px;">edit_note</span> 
                                        Feedback (${panel})
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                `;
                el.insertAdjacentHTML('beforebegin', headerHtml);

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

                // --- ACTION BUTTON INJECTION ---
                if (!el.parentElement.classList.contains('input-with-action')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'input-with-action';
                    wrapper.style.cssText = 'position: relative; display: flex; align-items: center; gap: 8px; width: 100%;';

                    el.parentNode.insertBefore(wrapper, el);
                    wrapper.appendChild(el);
                    el.style.marginBottom = '0'; // Let the wrapper handle the margin

                    const checkBtn = document.createElement('button');
                    checkBtn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">spellcheck</span>';
                    checkBtn.title = "Check if link is Public";
                    checkBtn.style.cssText = `
                        background: #f1f5f9;
                        border: 1.5px solid #e2e8f0;
                        border-radius: 8px;
                        color: #64748b;
                        padding: 10px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    `;
                    checkBtn.onclick = (e) => {
                        e.preventDefault();
                        window.verifyDriveLink(elementId);
                    };
                    wrapper.appendChild(checkBtn);

                    const uploadBtn = document.createElement('button');
                    uploadBtn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">upload_file</span>';
                    uploadBtn.title = "Upload PDF directly";

                    const isUploaded = linkMap[key] && (linkMap[key].includes('supabase.co') || linkMap[key].includes('project-submissions'));

                    uploadBtn.style.cssText = `
                        background: ${isUploaded ? '#f1f5f9' : 'var(--primary-color)'};
                        border: 1.5px solid ${isUploaded ? '#e2e8f0' : 'var(--primary-color)'};
                        border-radius: 8px;
                        color: ${isUploaded ? '#94a3b8' : 'white'};
                        padding: 10px;
                        cursor: ${isUploaded ? 'default' : 'pointer'};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                        box-shadow: ${isUploaded ? 'none' : '0 2px 6px rgba(26, 86, 219, 0.2)'};
                    `;
                    if (isUploaded) uploadBtn.disabled = true;

                    uploadBtn.onclick = (e) => {
                        e.preventDefault();
                        const fileInput = wrapper.parentElement.querySelector('input[type="file"]');
                        if (fileInput) {
                            fileInput.click();
                        } else {
                            console.error('File input not found in form-group for:', elementId);
                            showToast('Upload feature initialization error', 'error');
                        }
                    };
                    wrapper.appendChild(uploadBtn);
                }
            };

            // Render Titles
            renderField(tLinks, tStatus, tRemarks, tAnnot, 'title1', 'titleLink1');
            renderField(tLinks, tStatus, tRemarks, tAnnot, 'title2', 'titleLink2');
            renderField(tLinks, tStatus, tRemarks, tAnnot, 'title3', 'titleLink3');

            // Render Pre-Oral
            renderField(pLinks, pStatus, pRemarks, pAnnot, 'ch1', 'preOralCh1');
            renderField(pLinks, pStatus, pRemarks, pAnnot, 'ch2', 'preOralCh2');
            renderField(pLinks, pStatus, pRemarks, pAnnot, 'ch3', 'preOralCh3');

            // Render Final
            renderField(fLinks, fStatus, fRemarks, fAnnot, 'ch4', 'finalCh4');
            renderField(fLinks, fStatus, fRemarks, fAnnot, 'ch5', 'finalCh5');

            // Store links in window.currentLinks
            window.currentLinks = {
                titles: tLinks,
                preoral: pLinks,
                final: fLinks
            };

            // Initialize Button State
            updateSaveButtonState('titles');
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
};

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
    // 1. Check Global Schedule for the whole tab
    let isScheduled = true;
    if (window.scheduleStatus) {
        if (tabId === 'titles') isScheduled = window.scheduleStatus.title;
        else if (tabId === 'preoral') isScheduled = window.scheduleStatus.preoral;
        else if (tabId === 'final') isScheduled = window.scheduleStatus.final;
    }

    const tabEl = document.querySelector(`#tab-${tabId}`);
    if (!tabEl) return;

    // Helper to identify the field key from a button or container
    const getFieldKey = (el) => {
        const input = el.querySelector('input[id*="Link"], input[id*="Ch"]');
        if (!input) return null;
        const id = input.id.toLowerCase();
        if (id.includes('titlelink1')) return 'title1';
        if (id.includes('titlelink2')) return 'title2';
        if (id.includes('titlelink3')) return 'title3';
        if (id.includes('preoralch1')) return 'ch1';
        if (id.includes('preoralch2')) return 'ch2';
        if (id.includes('preoralch3')) return 'ch3';
        if (id.includes('finalch4')) return 'ch4';
        if (id.includes('finalch5')) return 'ch5';
        return null;
    };

    // 2. Process each sub-tab content independently
    tabEl.querySelectorAll('.sub-tab-content').forEach(subContent => {
        const saveBtn = subContent.querySelector('.save-btn');
        const inputs = subContent.querySelectorAll('input');
        const fieldKey = getFieldKey(subContent);

        if (!isScheduled) {
            if (saveBtn) {
                saveBtn.innerHTML = '<span class="material-icons-round">event_busy</span> Not Scheduled';
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.7';
            }
            inputs.forEach(input => {
                input.readOnly = true;
                input.style.backgroundColor = '#f1f5f9';
                input.title = "Not Scheduled yet";
            });
            return;
        }

        // Check if THIS specific field is already submitted
        const stageName = tabId === 'titles' ? 'titles' : tabId === 'preoral' ? 'preoral' : 'final';
        const stageLinks = window.currentLinks[stageName] || {};
        const isSubmitted = fieldKey && stageLinks[fieldKey] && stageLinks[fieldKey].trim() !== '';

        if (isSubmitted) {
            if (saveBtn) {
                saveBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.7';
                saveBtn.style.cursor = 'default';
            }
            inputs.forEach(input => {
                input.readOnly = true;
                input.style.backgroundColor = '#f1f5f9';
                input.title = "Submitted (Changes Restricted)";
            });
        } else {
            if (saveBtn) {
                saveBtn.innerHTML = `<span class="material-icons-round">save</span> Save ${fieldKey ? fieldKey.toUpperCase() : 'Submission'}`;
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
            }
            inputs.forEach(input => {
                input.readOnly = false;
                input.style.backgroundColor = '#f8fafc';
                input.title = "";
            });
        }
    });
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

window.saveSubmissions = async function (specificField) {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        showToast('You must be logged in to save.', 'error');
        return;
    }

    const activeTab = document.querySelector('.tab-btn.active');
    const tabId = activeTab.innerText.toLowerCase().includes('title') ? 'titles' :
        activeTab.innerText.toLowerCase().includes('pre') ? 'preoral' : 'final';

    // Find the specific button that was clicked
    const btn = document.getElementById(`save-${specificField}`);
    const originalContent = btn ? btn.innerHTML : 'Save';

    if (btn) {
        btn.innerHTML = '<span class="material-icons-round spin">sync</span> Saving...';
        btn.disabled = true;
    }

    // Collect data - MERGE with existing links to prevent overwriting
    const existingLinks = window.currentLinks[tabId] || {};
    let updates = {};
    let activeLinks = { ...existingLinks };

    try {
        if (tabId === 'titles') {
            if (specificField === 'title1') {
                activeLinks.title1 = document.getElementById('titleLink1').value.trim();
            } else if (specificField === 'title2') {
                activeLinks.title2 = document.getElementById('titleLink2').value.trim();
            } else if (specificField === 'title3') {
                activeLinks.title3 = document.getElementById('titleLink3').value.trim();
            }
            updates.title_link = JSON.stringify(activeLinks);

            // Per-title project title update
            let existingTitles = {};
            try {
                const group = JSON.parse(localStorage.getItem('lastGroupData') || '{}');
                existingTitles = JSON.parse(group.project_title || '{}');
            } catch (e) { }

            const pTitles = { ...existingTitles };
            if (specificField === 'title1') pTitles.title1 = document.getElementById('projectTitle1')?.value.trim();
            if (specificField === 'title2') pTitles.title2 = document.getElementById('projectTitle2')?.value.trim();
            if (specificField === 'title3') pTitles.title3 = document.getElementById('projectTitle3')?.value.trim();
            updates.project_title = JSON.stringify(pTitles);

        } else if (tabId === 'preoral') {
            if (specificField === 'ch1') activeLinks.ch1 = document.getElementById('preOralCh1').value.trim();
            if (specificField === 'ch2') activeLinks.ch2 = document.getElementById('preOralCh2').value.trim();
            if (specificField === 'ch3') activeLinks.ch3 = document.getElementById('preOralCh3').value.trim();
            updates.pre_oral_link = JSON.stringify(activeLinks);

        } else if (tabId === 'final') {
            if (specificField === 'ch4') activeLinks.ch4 = document.getElementById('finalCh4').value.trim();
            if (specificField === 'ch5') activeLinks.ch5 = document.getElementById('finalCh5').value.trim();
            updates.final_link = JSON.stringify(activeLinks);
        }

        // Validation
        if (!activeLinks[specificField] || activeLinks[specificField].trim() === '') {
            showToast('Please provide a link before saving.', 'warning');
            if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
            return;
        }

        const { error } = await supabaseClient
            .from('student_groups')
            .update(updates)
            .eq('id', loginUser.id);

        if (error) throw error;

        showToast(`${specificField.toUpperCase()} saved successfully!`, 'success');

        // Update local state and lock current sub-tab only
        window.currentLinks[tabId] = activeLinks;
        updateSaveButtonState(tabId);

    } catch (err) {
        console.error('Submission error:', err);
        if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
        showToast('Failed to save: ' + err.message, 'error');
    }
}

let currentViewerFileKey = null;

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    const viewer = document.getElementById('fileViewer');
    if (viewer) viewer.src = '';
    currentViewerFileKey = null;
};

// --- SIDEBAR COMMENT SYSTEM (Student Side) ---
window.openFileViewer = async (url, fileKey, panelName = null) => {
    if (!url) return;
    currentViewerFileKey = fileKey;

    const modal = document.getElementById('fileModal');
    const placeholder = document.getElementById('viewerPlaceholder');
    const titleEl = document.getElementById('modalFileTitle');
    const iframe = document.getElementById('fileViewer');

    if (modal) modal.style.display = 'flex';
    if (placeholder) placeholder.style.display = 'flex';
    if (iframe) iframe.style.display = 'block';

    let displayTitle = fileKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
    if (panelName) {
        titleEl.innerText = `Feedback from ${panelName}: ${displayTitle}`;
    } else {
        titleEl.innerText = 'Draft Submission: ' + displayTitle;
    }

    let absoluteUrl = url.trim();
    if (!absoluteUrl.startsWith('http') && !absoluteUrl.startsWith('//')) absoluteUrl = 'https://' + absoluteUrl;

    // Stable Viewer Logic
    let finalViewerUrl = absoluteUrl;
    const lowerUrl = absoluteUrl.toLowerCase();

    // Use specialized viewer for Supabase/PDF files to show annotations
    if (lowerUrl.includes('supabase.co') || lowerUrl.endsWith('.pdf')) {
        const viewerPath = "../../assets/library/web/viewer.html";
        finalViewerUrl = `${viewerPath}?file=${encodeURIComponent(absoluteUrl)}`;
    } else if (lowerUrl.includes('drive.google.com') && absoluteUrl.match(/\/d\/([^\/]+)/)) {
        finalViewerUrl = `https://drive.google.com/file/d/${absoluteUrl.match(/\/d\/([^\/]+)/)[1]}/preview`;
    } else {
        finalViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
    }

    if (iframe) {
        iframe.src = finalViewerUrl;
        iframe.onload = () => { if (placeholder) placeholder.style.display = 'none'; };
    }

    // Load Sidebar Discussion
    loadComments(currentGroupId, fileKey);
};

async function loadComments(groupId, fileKey) {
    const list = document.getElementById('commentsList');
    if (!list) return;

    list.innerHTML = `<div style="text-align:center; padding: 20px; color:#94a3b8;"><div class="viewer-loader" style="width:20px; height:20px; border:2px solid #e2e8f0; border-top-color:var(--primary-color); border-radius:50%; animation:spin 1s linear infinite; display:inline-block;"></div></div>`;

    try {
        const { data: comments, error } = await supabaseClient
            .from('file_comments')
            .select('*')
            .eq('group_id', groupId)
            .eq('file_key', fileKey)
            .order('created_at', { ascending: true });

        if (error) throw error;
        renderComments(comments || []);
    } catch (e) {
        console.error('Comments Load Error:', e);
        list.innerHTML = `<div style="text-align:center; color:#ef4444; padding:20px; font-size:0.8rem;">Error loading comments.</div>`;
    }
}

function renderComments(comments) {
    const list = document.getElementById('commentsList');
    if (comments.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #94a3b8; margin-top: 50px;">
            <span class="material-icons-round" style="font-size: 40px; opacity: 0.3;">forum</span>
            <p style="font-size: 0.85rem; margin-top: 10px;">No feedback found yet.</p>
        </div>`;
        return;
    }

    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const myName = user.group_name || user.name || 'Student';

    list.innerHTML = comments.map(c => {
        const isMe = c.user_name === myName;
        const time = new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Highlight correction references (Matching Panelist UI)
        let formattedText = c.comment_text;
        if (formattedText.startsWith('RE Page')) {
            const parts = formattedText.split('\n— ');
            if (parts.length > 1) {
                formattedText = `<div style="background: rgba(0,0,0,0.05); padding: 8px 12px; border-radius: 8px; border-left: 3px solid ${isMe ? '#fff' : 'var(--primary-color)'}; font-size: 0.8rem; margin-bottom: 8px; font-style: italic; opacity: 0.9;">${parts[0]}</div>` + parts.slice(1).join('\n— ');
            }
        }

        return `
            <div style="display: flex; flex-direction: column; align-items: ${isMe ? 'flex-end' : 'flex-start'}; margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: ${c.user_role === 'Panelist' ? 'var(--primary-color)' : '#475569'};">
                        ${isMe ? 'You' : c.user_name}
                    </span>
                    <span style="font-size: 0.65rem; color: #94a3b8;">${time}</span>
                </div>
                <div style="background: ${isMe ? 'var(--primary-color)' : '#f1f5f9'}; 
                            color: ${isMe ? 'white' : '#1e293b'}; 
                            padding: 12px 16px; 
                            border-radius: ${isMe ? '18px 18px 2px 18px' : '2px 18px 18px 18px'}; 
                            font-size: 0.9rem; 
                            line-height: 1.5; 
                            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                            max-width: 95%;
                            border: ${isMe ? 'none' : '1px solid #eef2f6'};">
                    ${formattedText}
                </div>
            </div>
        `;
    }).join('');

    setTimeout(() => { list.scrollTop = list.scrollHeight; }, 100);
}

window.postComment = async () => {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text || !currentGroupId || !currentViewerFileKey) return;

    const user = JSON.parse(localStorage.getItem('loginUser') || '{}');
    const userName = user.group_name || user.name || 'Student';

    input.disabled = true;

    try {
        const { error } = await supabaseClient.from('file_comments').insert({
            group_id: currentGroupId,
            file_key: currentViewerFileKey,
            user_name: userName,
            user_role: 'Student',
            comment_text: text
        });

        if (error) throw error;
        input.value = '';
        loadComments(currentGroupId, currentViewerFileKey);
    } catch (e) {
        alert('Could not send reply: ' + e.message);
    } finally {
        input.disabled = false;
        input.focus();
    }
};

window.handleFileUpload = async (input, targetId) => {
    const file = input.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('Only PDF files are allowed', 'warning');
        return;
    }

    const targetInput = document.getElementById(targetId);
    const btn = input.nextElementSibling || input.parentElement.querySelector('button[title="Upload PDF directly"]');
    const originalContent = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round" style="font-size:18px; animation: spin 1s linear infinite;">sync</span>';

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentGroupId}/${targetId}_${Date.now()}.${fileExt}`;
        const filePath = `submissions/${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from('project-submissions')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true
            });

        if (error) throw error;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('project-submissions')
            .getPublicUrl(filePath);

        targetInput.value = publicUrl;
        showToast('File uploaded successfully!', 'success');

        // Update button to gray and disabled
        btn.style.background = '#f1f5f9';
        btn.style.borderColor = '#e2e8f0';
        btn.style.color = '#94a3b8';
        btn.style.cursor = 'default';
        btn.style.boxShadow = 'none';
        btn.disabled = true;
        btn.dataset.uploaded = 'true';

        // Visual indicator on the input
        targetInput.style.borderColor = '#10b981';
        targetInput.style.background = '#f0fdf4';

    } catch (e) {
        console.error('Upload error:', e);
        showToast('Upload failed: ' + (e.message || 'Check storage permissions'), 'error');
    } finally {
        if (!btn.dataset.uploaded) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        } else {
            btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">task_alt</span>';
        }
    }
}

window.verifyDriveLink = async (inputId) => {
    const input = document.getElementById(inputId);
    const url = input.value.trim();
    const btn = input.nextElementSibling;

    if (!url) {
        showToast('Enter a link first', 'info');
        return;
    }

    if (!url.includes('drive.google.com')) {
        showToast('Only for GDrive links', 'info');
        return;
    }

    const fileIdMatch = url.match(/\/d\/([^\/]+)/) || url.match(/id=([^\&]+)/);
    if (!fileIdMatch) {
        showToast('Invalid Drive link', 'info');
        return;
    }

    const fileId = fileIdMatch[1];
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons-round" style="font-size:18px; animation: spin 1s linear infinite;">sync</span>';

    try {
        const checkUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`;
        const isPublic = await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = checkUrl;
        });

        if (isPublic) {
            showToast('Link is PUBLIC (Correct)', 'success');
            btn.style.borderColor = '#10b981';
            btn.style.color = '#10b981';
            btn.style.background = '#f0fdf4';
        } else {
            showToast('RESTRICTED: Change to "Anyone with link"', 'info');
            btn.style.borderColor = '#ef4444';
            btn.style.color = '#ef4444';
            btn.style.background = '#fef2f2';
        }
    } catch (e) {
        showToast('Verification failed', 'info');
    } finally {
        btn.disabled = false;
        setTimeout(() => {
            btn.innerHTML = originalContent;
        }, 2000);
    }
}
