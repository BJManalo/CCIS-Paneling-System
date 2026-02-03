// Initialize Supabase client
// Note: PROJECT_URL, PUBLIC_KEY, and supabaseClient are already defined in ../../assets/js/shared.js
const ADOBE_CLIENT_ID = '5edc19dfde9349e3acb7ecc73bfa4848';
let currentGroupId = null;
let currentBlobUrl = null;
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

    if (!window.currentLinks) window.currentLinks = {};

    try {
        const { data: group, error } = await supabaseClient
            .from('student_groups')
            .select('*, students(id, grades(grade, grade_type))')
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
            const isPreOralScheduled = isScheduled('PreOral');
            const isFinalScheduled = isScheduled('Final');

            const students = group.students || [];
            const totalStudents = students.length;

            const checkGraded = (keyword) => {
                if (totalStudents === 0) return false;
                const gradedCount = students.filter(s =>
                    s.grades && s.grades.some(g => g.grade_type && g.grade_type.includes(keyword))
                ).length;
                return gradedCount === totalStudents;
            };

            const isTitleGraded = checkGraded('Title');
            const isPreOralGraded = checkGraded('Pre');

            const preOralBtn = document.querySelector('button[onclick*="preoral"]');
            const finalBtn = document.querySelector('button[onclick*="final"]');

            window.scheduleStatus = {
                title: isTitleScheduled,
                preoral: isPreOralScheduled,
                final: isFinalScheduled
            };

            if (preOralBtn) {
                if (!isTitleGraded) {
                    preOralBtn.disabled = true;
                    preOralBtn.style.opacity = '0.5';
                    preOralBtn.style.cursor = 'not-allowed';
                    preOralBtn.title = "Locked: Title Defense grades pending.";
                    if (!preOralBtn.innerHTML.includes('lock')) preOralBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
                } else {
                    preOralBtn.disabled = false;
                    preOralBtn.style.opacity = '1';
                    preOralBtn.style.cursor = 'pointer';
                    preOralBtn.title = "";
                    const lockIcon = preOralBtn.querySelector('.material-icons-round');
                    if (lockIcon && lockIcon.innerText === 'lock') lockIcon.remove();
                }
            }

            if (finalBtn) {
                if (!isPreOralGraded) {
                    finalBtn.disabled = true;
                    finalBtn.style.opacity = '0.5';
                    finalBtn.style.cursor = 'not-allowed';
                    finalBtn.title = "Locked: Pre-Oral grades pending.";
                    if (!finalBtn.innerHTML.includes('lock')) finalBtn.innerHTML += ' <span class="material-icons-round" style="font-size:14px; vertical-align:middle;">lock</span>';
                } else {
                    finalBtn.disabled = false;
                    finalBtn.style.opacity = '1';
                    finalBtn.style.cursor = 'pointer';
                    finalBtn.title = "";
                    const lockIcon = finalBtn.querySelector('.material-icons-round');
                    if (lockIcon && lockIcon.innerText === 'lock') lockIcon.remove();
                }
            }

            localStorage.setItem('lastGroupData', JSON.stringify(group));

            const safeParse = (str) => {
                try { return JSON.parse(str || '{}'); } catch (e) { return {}; }
            };

            let tLinks = safeParse(group.title_link);
            if (group.title_link && typeof group.title_link === 'string' && !group.title_link.startsWith('{')) tLinks = { title1: group.title_link };

            let projectTitles = safeParse(group.project_title);
            if (group.project_title && typeof group.project_title === 'string' && !group.project_title.startsWith('{')) projectTitles = { title1: group.project_title };

            ['1', '2', '3'].forEach(num => {
                const title = projectTitles['title' + num];
                if (document.getElementById('projectTitle' + num)) document.getElementById('projectTitle' + num).value = title || '';
                if (title && title.trim() !== "") {
                    const titleTabBtns = document.querySelectorAll('#tab-titles .sub-tab-btn');
                    if (titleTabBtns.length >= num) titleTabBtns[num - 1].innerText = title;
                    const label = document.querySelector(`label[for="projectTitle${num}"]`);
                    if (label) label.innerText = title;
                }
            });

            let pLinks = safeParse(group.pre_oral_link);
            let fLinks = safeParse(group.final_link);

            const [dsRes, cfRes, caRes] = await Promise.all([
                supabaseClient.from('defense_statuses').select('*').eq('group_id', groupId),
                supabaseClient.from('capstone_feedback').select('*').eq('group_id', groupId),
                supabaseClient.from('capstone_annotations').select('*').eq('group_id', groupId)
            ]);

            const defStatuses = dsRes.data || [];
            const capstoneFeedback = cfRes.data || [];
            const capstoneAnnotations = caRes.data || [];

            const getFeedbackMaps = (type) => {
                const norm = type.toLowerCase().replace(/[^a-z0-9]/g, '');
                const statuses = {};
                const remarks = {};
                const annotations = {};

                const legacy = defStatuses.find(ds => ds.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm);
                if (legacy) {
                    Object.entries(legacy.statuses || {}).forEach(([fKey, fVal]) => { statuses[fKey] = fVal; });
                    Object.entries(legacy.remarks || {}).forEach(([fKey, fVal]) => { remarks[fKey] = fVal; });
                }

                capstoneFeedback.filter(cf => cf.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm).forEach(cf => {
                    if (!statuses[cf.file_key] || typeof statuses[cf.file_key] !== 'object') statuses[cf.file_key] = {};
                    if (!remarks[cf.file_key] || typeof remarks[cf.file_key] !== 'object') remarks[cf.file_key] = {};
                    if (!annotations[cf.file_key] || typeof annotations[cf.file_key] !== 'object') annotations[cf.file_key] = {};

                    if (cf.status) statuses[cf.file_key][cf.user_name] = cf.status;
                    if (cf.remarks) remarks[cf.file_key][cf.user_name] = cf.remarks;
                    if (cf.annotated_file_url) annotations[cf.file_key][cf.user_name] = cf.annotated_file_url;
                });

                // Merge with New Annotations Table
                capstoneAnnotations.filter(ca => ca.defense_type.toLowerCase().replace(/[^a-z0-9]/g, '') === norm).forEach(ca => {
                    if (!annotations[ca.file_key] || typeof annotations[ca.file_key] !== 'object') annotations[ca.file_key] = {};
                    if (ca.annotated_file_url) annotations[ca.file_key][ca.user_name] = ca.annotated_file_url;
                });

                return { statuses, remarks, annotations };
            };

            const titleData = getFeedbackMaps('Title Defense');
            const preOralData = getFeedbackMaps('Pre-Oral Defense');
            const finalData = getFeedbackMaps('Final Defense');

            window.feedbackStatus = {
                titles: titleData.statuses,
                preoral: preOralData.statuses,
                final: finalData.statuses
            };

            const renderField = (linkMap, annotationsMap, key, elementId) => {
                const el = document.getElementById(elementId);
                if (!el) return;
                const formGroup = el.closest('.form-group');
                if (!formGroup) return;

                // Remove previous injections
                formGroup.querySelectorAll('.status-badge-container, .remarks-list-container, .view-doc-container').forEach(node => node.remove());

                const hasFile = linkMap[key] && linkMap[key].trim() !== '';
                const rawAnnotations = annotationsMap[key] || {};
                const hasAnnotations = Object.keys(rawAnnotations).length > 0;

                if (hasFile) {
                    const headerHtml = `
                        <div class="view-doc-container" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                            <span style="font-size: 0.85rem; font-weight: 700; color: #475569;">Submission Link</span>
                            <button onclick="window.prepareViewer('${encodeURIComponent(JSON.stringify({ draft: linkMap[key], annotations: annotationsMap[key] || {} }))}', '${key}')" 
                                    style="background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 6px 14px; border-radius: 8px; font-size: 0.75rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s;">
                                <span class="material-icons-round" style="font-size: 16px;">visibility</span> 
                                ${hasAnnotations ? 'View Document & Feedback' : 'View Document'}
                            </button>
                        </div>
                    `;
                    const targetNode = el.closest('.input-with-action') || el;
                    targetNode.insertAdjacentHTML('beforebegin', headerHtml);
                }
                el.value = linkMap[key] || '';
                const revEl = document.getElementById(elementId + '_revised');
                if (revEl) revEl.value = linkMap[key + '_revised'] || '';
            };

            const injectActionButtons = (targetEl, currentValue) => {
                if (!targetEl) return;

                let wrapper = targetEl.parentElement;
                let uploadBtn;
                const isUploaded = currentValue && (currentValue.includes('supabase.co') || currentValue.includes('project-submissions'));
                const isRevised = targetEl.id.includes('_revised');

                if (wrapper && wrapper.classList.contains('input-with-action')) {
                    uploadBtn = wrapper.querySelector('button');
                } else {
                    wrapper = document.createElement('div');
                    wrapper.className = 'input-with-action';
                    wrapper.style.cssText = 'position: relative; display: flex; align-items: center; gap: 8px; width: 100%;';
                    targetEl.parentNode.insertBefore(wrapper, targetEl);
                    wrapper.appendChild(targetEl);
                    targetEl.style.marginBottom = '0';

                    uploadBtn = document.createElement('button');
                    uploadBtn.title = "Upload PDF directly";
                    uploadBtn.onclick = (e) => {
                        e.preventDefault();
                        const fileInput = wrapper.parentElement.querySelector('input[type="file"]');
                        if (fileInput) fileInput.click();
                    };
                    wrapper.appendChild(uploadBtn);
                }

                // Update Button State
                const canUpload = isRevised || !isUploaded;
                const uploadColor = isRevised ? '#d97706' : 'var(--primary-color)';

                uploadBtn.disabled = !canUpload;
                uploadBtn.style.cssText = `background: ${!canUpload ? '#f1f5f9' : uploadColor}; border: 1.5px solid ${!canUpload ? '#e2e8f0' : uploadColor}; border-radius: 8px; color: ${!canUpload ? '#94a3b8' : 'white'}; padding: 10px; cursor: ${!canUpload ? 'default' : 'pointer'}; display: flex; align-items: center; justify-content: center; transition: all 0.2s; box-shadow: ${!canUpload ? 'none' : '0 2px 6px rgba(0,0,0, 0.1)'};`;

                if (isRevised) {
                    uploadBtn.title = isUploaded ? "Update your Revision" : "Upload Revision";
                    uploadBtn.innerHTML = isUploaded ? '<span class="material-icons-round" style="font-size:18px;">sync</span>' : '<span class="material-icons-round" style="font-size:18px;">history_edu</span>';
                } else {
                    uploadBtn.title = isUploaded ? "File uploaded" : "Upload PDF directly";
                    uploadBtn.innerHTML = isUploaded ? '<span class="material-icons-round" style="font-size:18px;">task_alt</span>' : '<span class="material-icons-round" style="font-size:18px;">upload_file</span>';
                }
            };

            renderField(tLinks, titleData.annotations, 'title1', 'titleLink1');
            renderField(tLinks, titleData.annotations, 'title2', 'titleLink2');
            renderField(tLinks, titleData.annotations, 'title3', 'titleLink3');
            renderField(pLinks, preOralData.annotations, 'ch1', 'preOralCh1');
            renderField(pLinks, preOralData.annotations, 'ch2', 'preOralCh2');
            renderField(pLinks, preOralData.annotations, 'ch3', 'preOralCh3');
            renderField(fLinks, finalData.annotations, 'ch4', 'finalCh4');
            renderField(fLinks, finalData.annotations, 'ch5', 'finalCh5');

            injectActionButtons(document.getElementById('titleLink1'), tLinks.title1);
            injectActionButtons(document.getElementById('titleLink1_revised'), tLinks.title1_revised);
            injectActionButtons(document.getElementById('titleLink2'), tLinks.title2);
            injectActionButtons(document.getElementById('titleLink2_revised'), tLinks.title2_revised);
            injectActionButtons(document.getElementById('titleLink3'), tLinks.title3);
            injectActionButtons(document.getElementById('titleLink3_revised'), tLinks.title3_revised);
            injectActionButtons(document.getElementById('preOralCh1'), pLinks.ch1);
            injectActionButtons(document.getElementById('preOralCh1_revised'), pLinks.ch1_revised);
            injectActionButtons(document.getElementById('preOralCh2'), pLinks.ch2);
            injectActionButtons(document.getElementById('preOralCh2_revised'), pLinks.ch2_revised);
            injectActionButtons(document.getElementById('preOralCh3'), pLinks.ch3);
            injectActionButtons(document.getElementById('preOralCh3_revised'), pLinks.ch3_revised);
            injectActionButtons(document.getElementById('finalCh4'), fLinks.ch4);
            injectActionButtons(document.getElementById('finalCh4_revised'), fLinks.ch4_revised);
            injectActionButtons(document.getElementById('finalCh5'), fLinks.ch5);
            injectActionButtons(document.getElementById('finalCh5_revised'), fLinks.ch5_revised);

            window.currentLinks = { titles: tLinks, preoral: pLinks, final: fLinks };
            updateSaveButtonState(document.querySelector('.tab-btn.active')?.innerText.toLowerCase().includes('title') ? 'titles' : document.querySelector('.tab-btn.active')?.innerText.toLowerCase().includes('pre') ? 'preoral' : 'final');
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
            // Hide the revision group
            const revGroup = subContent.querySelector('.revision-group');
            if (revGroup) revGroup.style.display = 'none';

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
            // CHECK IF PANELS HAVE REPLIED (Allow Revision)
            let hasFeedback = false;
            // Requirement: Enable only if there are at least 2 status/comments
            if (window.feedbackStatus && window.feedbackStatus[tabId] && window.feedbackStatus[tabId][fieldKey]) {
                const fStat = window.feedbackStatus[tabId][fieldKey];
                // Check if AT LEAST 2 panels have set a status
                if (fStat && Object.keys(fStat).length >= 2) {
                    hasFeedback = true;
                }
            }

            if (hasFeedback) {
                // Show the revision group
                const revGroup = subContent.querySelector('.revision-group');
                if (revGroup) revGroup.style.display = 'block';

                // PARTIAL LOCK: Original Locked, Revision Open
                if (saveBtn) {
                    // Check if Revision is already submitted? Optional, but for now allow overwriting revision
                    const isRevSubmitted = stageLinks[fieldKey + '_revised'] && stageLinks[fieldKey + '_revised'].trim() !== '';

                    if (isRevSubmitted) {
                        saveBtn.innerHTML = '<span class="material-icons-round">update</span> Update Revision';
                    } else {
                        saveBtn.innerHTML = '<span class="material-icons-round">upload_file</span> Submit Revision';
                    }

                    saveBtn.disabled = false;
                    saveBtn.style.opacity = '1';
                    saveBtn.style.cursor = 'pointer';
                    // Re-bind click to save (it handles both fields, but only revision is editable)
                }

                inputs.forEach(input => {
                    const isLinkField = input.id.toLowerCase().includes('link') || input.id.toLowerCase().includes('ch');
                    if (input.id.includes('_revised')) {
                        // Keep submission field readonly, but visually indicate it's the target
                        input.readOnly = true;
                        input.style.backgroundColor = '#fffbeb'; // Still show amber to indicate focus
                        input.title = "Use the Upload icon to submit your revision";
                    } else if (isLinkField) {
                        // Lock Original
                        input.readOnly = true;
                        input.style.backgroundColor = '#f1f5f9';
                        input.title = "Original submission is locked";
                    } else {
                        // Project Title or other non-link fields
                        input.readOnly = false;
                        input.style.backgroundColor = '#f8fafc';
                    }
                });
            } else {
                // Hide the revision group
                const revGroup = subContent.querySelector('.revision-group');
                if (revGroup) revGroup.style.display = 'none';

                // FULL LOCK: Submitted but no feedback yet
                if (saveBtn) {
                    saveBtn.innerHTML = '<span class="material-icons-round">check_circle</span> Submitted';
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = '0.7';
                    saveBtn.style.cursor = 'default';
                }
                inputs.forEach(input => {
                    input.readOnly = true;
                    input.style.backgroundColor = '#f1f5f9';
                    input.title = "Submitted (Waiting for at least 2 Panels)";

                    // Also disable sibling buttons visually if possible, or just rely on readOnly
                    const wrapper = input.closest('.input-with-action');
                    if (wrapper) {
                        wrapper.querySelectorAll('button').forEach(b => {
                            b.disabled = true;
                            b.style.cursor = 'not-allowed';
                            b.style.opacity = '0.6';
                        });
                    }
                });
            }
        } else {
            // Hide the revision group (no submission yet)
            const revGroup = subContent.querySelector('.revision-group');
            if (revGroup) revGroup.style.display = 'none';

            if (saveBtn) {
                saveBtn.innerHTML = `<span class="material-icons-round">save</span> Save ${fieldKey ? fieldKey.toUpperCase() : 'Submission'}`;
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
            }
            inputs.forEach(input => {
                // IMPORTANT: Link/submission fields should remain readonly to force using the Upload button
                const isLinkField = input.id.toLowerCase().includes('link') || input.id.toLowerCase().includes('ch');
                if (isLinkField) {
                    input.readOnly = true;
                    input.style.backgroundColor = '#f1f5f9';
                } else {
                    input.readOnly = false;
                    input.style.backgroundColor = '#f8fafc';
                }
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
                activeLinks.title1_revised = document.getElementById('titleLink1_revised').value.trim();
            } else if (specificField === 'title2') {
                activeLinks.title2 = document.getElementById('titleLink2').value.trim();
                activeLinks.title2_revised = document.getElementById('titleLink2_revised').value.trim();
            } else if (specificField === 'title3') {
                activeLinks.title3 = document.getElementById('titleLink3').value.trim();
                activeLinks.title3_revised = document.getElementById('titleLink3_revised').value.trim();
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
            if (specificField === 'ch1') {
                activeLinks.ch1 = document.getElementById('preOralCh1').value.trim();
                activeLinks.ch1_revised = document.getElementById('preOralCh1_revised').value.trim();
            }
            if (specificField === 'ch2') {
                activeLinks.ch2 = document.getElementById('preOralCh2').value.trim();
                activeLinks.ch2_revised = document.getElementById('preOralCh2_revised').value.trim();
            }
            if (specificField === 'ch3') {
                activeLinks.ch3 = document.getElementById('preOralCh3').value.trim();
                activeLinks.ch3_revised = document.getElementById('preOralCh3_revised').value.trim();
            }
            updates.pre_oral_link = JSON.stringify(activeLinks);

        } else if (tabId === 'final') {
            if (specificField === 'ch4') {
                activeLinks.ch4 = document.getElementById('finalCh4').value.trim();
                activeLinks.ch4_revised = document.getElementById('finalCh4_revised').value.trim();
            }
            if (specificField === 'ch5') {
                activeLinks.ch5 = document.getElementById('finalCh5').value.trim();
                activeLinks.ch5_revised = document.getElementById('finalCh5_revised').value.trim();
            }
            updates.final_link = JSON.stringify(activeLinks);
        }

        // Validation
        const link = activeLinks[specificField] || "";
        if (link.trim() === '') {
            showToast('Please upload a PDF file before saving.', 'warning');
            if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
            return;
        }

        if (!link.includes('supabase.co') && !link.includes('project-submissions')) {
            showToast('Invalid file source. Please use the Upload button to submit your PDF.', 'error');
            if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
            return;
        }

        const { error } = await supabaseClient
            .from('student_groups')
            .update(updates)
            .eq('id', loginUser.id);

        if (error) throw error;

        // Show a generic but clear success message
        showToast('Successfully submitted', 'success');

        // Immediately update UI labels if it was a title update
        if (tabId === 'titles') {
            const num = specificField.replace('title', '');
            const newTitle = document.getElementById(`projectTitle${num}`)?.value.trim();
            if (newTitle) {
                // Update Sub-tab button
                const titleTabBtns = document.querySelectorAll('#tab-titles .sub-tab-btn');
                if (titleTabBtns.length >= parseInt(num)) {
                    titleTabBtns[parseInt(num) - 1].innerText = newTitle;
                }
                // Update Label
                const label = document.querySelector(`label[for="projectTitle${num}"]`);
                if (label) label.innerText = newTitle;
            }
        }

        // Update local state and lock current sub-tab only
        window.currentLinks[tabId] = activeLinks;
        // Refresh data without full page reload to maintain current tab
        setTimeout(async () => {
            await loadSubmissionData();
            // Re-select the active tab to ensure UI is consistent
            updateSaveButtonState(tabId);
        }, 1500);

    } catch (err) {
        console.error('Submission error:', err);
        if (btn) { btn.innerHTML = originalContent; btn.disabled = false; }
        showToast('Failed to save: ' + err.message, 'error');
    }
}

let currentViewerFileKey = null;
let currentViewerData = null; // Stores all URLs for the dropdown

window.prepareViewer = (encodedData, fileKey) => {
    const data = JSON.parse(decodeURIComponent(encodedData));
    currentViewerData = data;
    currentViewerFileKey = fileKey;

    const selector = document.getElementById('feedbackSelector');
    if (selector) {
        selector.innerHTML = "";

        // 1. Add Draft Option if exists
        if (data.draft) {
            const opt = document.createElement('option');
            opt.value = "draft";
            opt.innerText = "Original Draft";
            selector.appendChild(opt);
        }

        // 2. Add Annotation Options
        Object.keys(data.annotations).forEach(panel => {
            const opt = document.createElement('option');
            opt.value = panel;
            opt.innerText = `Feedback (${panel})`;
            selector.appendChild(opt);
        });

        // 3. Selection visibility
        const container = document.getElementById('feedbackSelectorContainer');
        if (container) {
            container.style.display = (selector.options.length > 1) ? "flex" : "none";
        }
    }

    // Default to first option or specific logic
    if (selector && selector.options.length > 0) {
        selector.selectedIndex = 0;
        window.handlePanelSwitch(selector.value);
    }
};

window.handlePanelSwitch = async (value) => {
    if (!currentViewerData || !currentViewerFileKey) return;

    let targetUrl = "";
    let panelName = null;

    if (value === "draft") {
        targetUrl = currentViewerData.draft;
    } else {
        targetUrl = currentViewerData.annotations[value];
        panelName = value;
    }

    window.openFileViewer(targetUrl, currentViewerFileKey, panelName);
};

window.openFileViewer = async (url, fileKey, panelName = null) => {
    if (!url) return;

    const modal = document.getElementById('fileModal');
    const placeholder = document.getElementById('viewerPlaceholder');
    const titleEl = document.getElementById('modalFileTitle');
    const iframe = document.getElementById('fileViewer');

    if (modal) modal.style.display = 'flex';
    if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid var(--primary-color); border-radius: 50%; animation: viewer-spin 1s linear infinite;"></div>
                <p style="margin-top: 15px; font-weight: 500; color: #64748b; font-family: inherit;">Loading file...</p>
            </div>
            <style>
                @keyframes viewer-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
    }
    if (iframe) iframe.style.display = 'none';

    // Revoke previous blob if exists
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    let displayTitle = fileKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());

    // Check for actual project titles
    if (fileKey && fileKey.toLowerCase().startsWith('title')) {
        const inputId = 'project' + fileKey.charAt(0).toUpperCase() + fileKey.slice(1);
        const actualTitleInput = document.getElementById(inputId);
        if (actualTitleInput && actualTitleInput.value.trim()) {
            displayTitle = actualTitleInput.value.trim();
        }
    }
    titleEl.innerText = displayTitle;

    let absoluteUrl = url.trim();
    if (!absoluteUrl.startsWith('http') && !absoluteUrl.startsWith('//')) absoluteUrl = 'https://' + absoluteUrl;

    const lowerUrl = absoluteUrl.toLowerCase();
    const isPDF = lowerUrl.includes('supabase.co') || lowerUrl.endsWith('.pdf');
    const isDrive = lowerUrl.includes('drive.google.com');

    try {
        if (isPDF) {
            console.log("Loading PDF via PDF.js...");
            const urlObj = new URL(absoluteUrl);
            urlObj.searchParams.set('v', Date.now());

            const response = await fetch(urlObj.toString());
            if (!response.ok) throw new Error("Fetch failed");
            const blob = await response.blob();
            currentBlobUrl = URL.createObjectURL(blob);

            const viewerPath = "../../assets/library/web/viewer.html";
            iframe.src = `${viewerPath}?file=${encodeURIComponent(currentBlobUrl)}&readonly=true`;
        } else if (isDrive) {
            console.log("Loading Google Drive link...");
            const fileIdMatch = absoluteUrl.match(/\/d\/([^\/]+)/) || absoluteUrl.match(/id=([^\&]+)/);
            iframe.src = fileIdMatch ? `https://drive.google.com/file/d/${fileIdMatch[1]}/preview` : absoluteUrl;
        } else {
            console.log("Loading generic link...");
            iframe.src = absoluteUrl;
        }

        iframe.onload = () => {
            if (placeholder) placeholder.style.display = 'none';
            if (iframe) iframe.style.display = 'block';
        };

    } catch (e) {
        console.warn("Fallback loading:", e);
        if (isDrive) {
            iframe.src = absoluteUrl;
        } else {
            iframe.src = `https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`;
        }
        iframe.onload = () => {
            if (placeholder) placeholder.style.display = 'none';
            if (iframe) iframe.style.display = 'block';
        };
    }
};

window.closeFileModal = () => {
    document.getElementById('fileModal').style.display = 'none';
    const viewer = document.getElementById('fileViewer');
    if (viewer) viewer.src = '';

    // Revoke blob if exists
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }

    currentViewerFileKey = null;
};

// --- SIDEBAR COMMENT SYSTEM (Student Side) ---
window.handleFileUpload = async (input, targetId) => {
    const file = input.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
        showToast('Only PDF files are allowed', 'warning');
        return;
    }

    const targetInput = document.getElementById(targetId);
    // Be very specific: find the button within the same form-group
    const formGroup = input.parentElement;
    const btn = formGroup.querySelector('.input-with-action button');

    if (!btn) {
        console.error('Upload button not found for', targetId);
        return;
    }

    const originalContent = btn.innerHTML;
    const isRevised = targetId.includes('_revised');

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
            // Success State
            if (isRevised) {
                btn.disabled = false; // Never lock revisions
                btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">sync</span>';
                btn.title = "Update your Revision";
                // Reset style to orange for revision
                btn.style.background = '#d97706';
                btn.style.borderColor = '#d97706';
                btn.style.color = 'white';
                btn.style.cursor = 'pointer';
            } else {
                btn.innerHTML = '<span class="material-icons-round" style="font-size:18px;">task_alt</span>';
                btn.title = "File uploaded";
            }
        }
    }
}

// verifyDriveLink removed to restrict submissions to file uploads only.
