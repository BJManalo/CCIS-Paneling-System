
// Note: Supabase client is initialized in script.js

document.addEventListener('DOMContentLoaded', () => {
    loadPayments();
});

let currentGroupData = null; // Store fetched data for the modal

async function loadPayments() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../';
        return;
    }

    try {
        // 1. Fetch Payments
        const { data: payments, error: paymentsError } = await supabaseClient
            .from('payments')
            .select('*')
            .eq('group_id', loginUser.id)
            .order('created_at', { ascending: false });

        if (paymentsError) throw paymentsError;

        renderPayments(payments);

        // 2. Fetch Group Details (for Grades & Modal info)
        // Wrap in try-catch so unrelated errors don't hide the payment list
        try {
            await fetchGroupDetails(loginUser.id, payments);
        } catch (bgError) {
            console.warn('Background fetch for group details failed:', bgError);
            // We don't alert here to avoid scaring the user, as the main list is loaded.
        }

    } catch (err) {
        console.error('Error loading payments:', err);
        document.getElementById('payments-container').innerHTML = `<p style="text-align: center; color: #ef4444;">Error loading data: ${err.message}</p>`;
    }
}

function renderPayments(payments) {
    const container = document.getElementById('payments-container');

    if (!payments || payments.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
                <span class="material-icons-round" style="font-size: 48px; opacity: 0.5;">receipt_long</span>
                <p>No payment submissions yet. Click + to add one.</p>
            </div>
        `;
        return;
    }

    const rows = payments.map(p => {
        let statusColor = '#64748b'; // Pending
        let statusBg = '#f1f5f9';

        if (p.status === 'Verified') {
            statusColor = '#059669'; statusBg = '#f0fdf4';
        } else if (p.status === 'Rejected') {
            statusColor = '#dc2626'; statusBg = '#fef2f2';
        }

        const date = new Date(p.created_at).toLocaleDateString();
        const defenseType = p.defense_type || 'N/A';
        const datePaid = p.payment_date ? new Date(p.payment_date).toLocaleDateString() : date;

        return `
            <tr class="main-row" onclick="togglePaymentRow('${p.id}')" id="row-${p.id}">
                <td>
                     <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="material-icons-round expand-icon" id="icon-${p.id}">expand_more</span>
                        ${datePaid}
                     </div>
                </td>
                <td style="font-weight: 500; color: var(--primary-dark);">${defenseType}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 5px; color: var(--primary-color); font-weight: 500;">
                        <span class="material-icons-round" style="font-size: 16px;">image</span>
                        <span>Click row to view details</span>
                    </div>
                </td>
            </tr>
            <tr class="details-row" id="details-${p.id}">
                <td colspan="3" style="padding: 0;">
                    <div class="details-content">
                        <!-- Column 1: Members -->
                        <div class="details-column">
                            <h4>Group Members</h4>
                            <ul class="members-list">
                                ${p.members ? p.members.split(',').map(m => `<li>${m.trim()}</li>`).join('') : '<li>No members listed</li>'}
                            </ul>
                        </div>

                        <!-- Column 2: Academic Details -->
                        <div class="details-column">
                            <h4>Academic Details</h4>
                            <p><strong style="font-size: 0.8em; color: #64748b;">PROGRAM / YEAR / SECTION</strong><br>
                            ${p.program || '-'} ${p.year_level || ''} - ${p.section || '-'}</p>
                            
                            <p style="margin-top: 15px;"><strong style="font-size: 0.8em; color: #64748b;">ADVISER</strong><br>
                            ${p.adviser || '-'}</p>

                            <p style="margin-top: 15px;"><strong style="font-size: 0.8em; color: #64748b;">PANELS</strong><br>
                            ${p.panels || '-'}</p>
                        </div>

                        <!-- Column 3: Receipt -->
                        <div class="details-column receipt-column">
                            <h4>Receipt</h4>
                            <img src="${p.receipt_url}" 
                                 style="width: 100%; max-width: 250px; height: auto; border-radius: 8px; border: 1px solid #e2e8f0; cursor: zoom-in; box-shadow: 0 2px 8px rgba(0,0,0,0.05);"
                                 onclick="event.stopPropagation(); window.openLightbox(this.src);"
                                 title="Click to Enlarge">
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="payments-table">
            <thead>
                <tr>
                    <th>Date Paid</th>
                    <th>Defense Type</th>
                    <th>Details</th>
                </tr>
            </thead>
            <tbody>
                ${rows}
            </tbody>
        </table>
    `;
}

// Toggle Row Function
window.togglePaymentRow = function (id) {
    const detailsRow = document.getElementById(`details-${id}`);
    const mainRow = document.getElementById(`row-${id}`);

    if (detailsRow) {
        detailsRow.classList.toggle('active');
        if (mainRow) mainRow.classList.toggle('expanded');
    }
}

async function fetchGroupDetails(groupId, payments = []) {
    try {
        // Fetch Group + Students (with Grades) + Schedule
        const { data, error } = await supabaseClient
            .from('student_groups')
            .select(`
                *,
                students (
                    full_name,
                    grades (grade, grade_type)
                ),
                schedules (panel1, panel2, panel3, panel4)
            `)
            .eq('id', groupId)
            .single();

        if (error) throw error;
        currentGroupData = data;

        // Check FAB Visibility
        checkFabVisibility(payments, currentGroupData);

    } catch (err) {
        console.error('Error fetching group details:', err);
    }
}

function checkFabVisibility(payments, groupData) {
    const fabBtn = document.querySelector('.fab-btn');
    if (!fabBtn) return;

    // Helper: Normalize string (lowercase, remove hyphens)
    const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    // Helper: Check if a specific defense type is Paid and Graded using normalized comparison
    const getStatus = (type) => {
        const normType = normalize(type);

        // Find payment (flexible match)
        const payment = payments.find(p => normalize(p.defense_type) === normType);

        let isGraded = false;

        // Check grade if payment exists
        if (payment && groupData && groupData.students && groupData.students.length > 0) {
            // If ANY student has a grade for this type, consider it graded (group grade)
            isGraded = groupData.students.some(student =>
                student.grades && student.grades.some(g => normalize(g.grade_type) === normType && g.grade !== null)
            );
        }
        return { paid: !!payment, graded: isGraded };
    };

    const title = getStatus('Title Defense');
    const preOral = getStatus('Pre-Oral Defense'); // will match "Pre Oral Defense" too
    const final = getStatus('Final Defense');

    console.log('Payment Status (Normalized Check):', { title, preOral, final });

    // Sequential Logic:

    // 1. Title Defense Stage
    if (!title.paid) {
        fabBtn.style.display = 'flex';
        return;
    }
    if (title.paid && !title.graded) {
        fabBtn.style.display = 'none';
        return;
    }

    // 2. Pre-Oral Defense Stage
    if (!preOral.paid) {
        fabBtn.style.display = 'flex';
        return;
    }
    if (preOral.paid && !preOral.graded) {
        fabBtn.style.display = 'none';
        return;
    }

    // 3. Final Defense Stage
    if (!final.paid) {
        fabBtn.style.display = 'flex';
        return;
    }
    if (final.paid && !final.graded) {
        fabBtn.style.display = 'none';
        return;
    }

    fabBtn.style.display = 'none';
}



async function openAddPaymentModal() {
    const modal = document.getElementById('paymentModal');
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));

    if (!currentGroupData) {
        showToast('Loading group details... please wait.', 'info');
        // Fetch again if missing
        fetchGroupDetails(loginUser.id).then(() => {
            if (currentGroupData) openAddPaymentModal(); // Retry
        });
        return;
    }

    // Auto-fill fields
    document.getElementById('payGroupName').value = currentGroupData.group_name || '';
    document.getElementById('payProgram').value = currentGroupData.program || '';
    document.getElementById('payYear').value = currentGroupData.year_level || '';
    document.getElementById('paySection').value = currentGroupData.section || '';
    document.getElementById('payAdviser').value = currentGroupData.adviser || '';

    // Set Date Paid to Today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('payDatePaid').value = today;

    // Members
    const memberNames = currentGroupData.students ? currentGroupData.students.map(s => s.full_name).join(', ') : '';
    document.getElementById('payMembers').value = memberNames;

    // Filter Defense Types Logic
    try {
        const typeSelect = document.getElementById('payDefenseType');

        // Fetch existing payments for this group to filter options
        const { data: existingPayments, error } = await supabaseClient
            .from('payments')
            .select('defense_type')
            .eq('group_id', loginUser.id);

        if (!error && existingPayments) {
            // Normalize helper
            const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
            const paidTypes = existingPayments.map(p => normalize(p.defense_type));

            // Reset options
            typeSelect.innerHTML = '';
            const allTypes = ["Title Defense", "Pre-Oral Defense", "Final Defense"];

            allTypes.forEach(type => {
                if (!paidTypes.includes(normalize(type))) {
                    const opt = document.createElement('option');
                    opt.value = type;
                    opt.textContent = type;
                    typeSelect.appendChild(opt);
                }
            });

            if (typeSelect.options.length === 0) {
                typeSelect.innerHTML = '<option value="">All phases paid</option>';
                typeSelect.disabled = true;
                document.getElementById('submitBtn').disabled = true;
                showToast("You have already submitted payments for all defense phases.", "success");
            } else {
                typeSelect.disabled = false;
                document.getElementById('submitBtn').disabled = false;
            }
        }
    } catch (err) {
        console.error("Error filtering defense types:", err);
    }

    // Reset File
    document.getElementById('receiptFile').value = '';
    const uploadBox = document.getElementById('uploadBox');
    const preview = document.getElementById('imagePreview');

    // Check if elements exist to avoid null errors if DOM isn't ready
    if (uploadBox && preview) {
        uploadBox.classList.remove('has-image');
        preview.src = '';
    }

    modal.classList.add('active');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
}

function previewImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = document.getElementById('imagePreview');
            const box = document.getElementById('uploadBox');

            if (img && box) {
                img.src = e.target.result;
                box.classList.add('has-image');
            }
        }
        reader.readAsDataURL(input.files[0]);
    }
}

async function submitPayment(e) {
    e.preventDefault();

    const fileInput = document.getElementById('receiptFile');
    if (fileInput.files.length === 0) {
        showToast('Please upload a receipt image.', 'error');
        return;
    }

    const btn = document.getElementById('submitBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="material-icons-round spin">sync</span> Submitting...';
    btn.disabled = true;

    try {
        const file = fileInput.files[0];
        const loginUser = JSON.parse(localStorage.getItem('loginUser'));

        // Upload Image
        // We'll try to upload to a 'receipts' bucket.
        // Filename: groupID_timestamp_filename
        const fileName = `${loginUser.id}_${Date.now()}_${file.name.replace(/\s/g, '_')}`;

        // Check if bucket exists? We can't easily. Just try upload.
        // If it fails with "bucket not found", we might need to fallback or alert user.
        // For this environment, if we assume no bucket exists, we might fail.

        const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('receipts')
            .upload(fileName, file);

        let publicUrl = '';

        if (uploadError) {
            // Fallback: If bucket doesn't exist, we can't upload.
            // ASK: User didn't specify bucket creation login.
            // For now, let's assume we can't upload if error.
            console.error('Upload error:', uploadError);
            throw new Error('Failed to upload receipt. Please contact admin to set up "receipts" storage bucket.');
        } else {
            const { data: urlData } = supabaseClient
                .storage
                .from('receipts')
                .getPublicUrl(fileName);
            publicUrl = urlData.publicUrl;
        }

        // Insert Record
        const { error: insertError } = await supabaseClient
            .from('payments')
            .insert({
                group_id: loginUser.id,
                group_name: document.getElementById('payGroupName').value,
                members: document.getElementById('payMembers').value,
                program: document.getElementById('payProgram').value,
                year_level: document.getElementById('payYear').value,
                section: document.getElementById('paySection').value,
                adviser: document.getElementById('payAdviser').value,
                adviser: document.getElementById('payAdviser').value,
                // panels: document.getElementById('payPanels').value, // Removed
                defense_type: document.getElementById('payDefenseType') ? document.getElementById('payDefenseType').value : 'Title Defense',
                payment_date: document.getElementById('payDatePaid').value,
                receipt_url: publicUrl
            });

        if (insertError) throw insertError;

        showToast('Payment submitted successfully!', 'success');
        closePaymentModal();
        loadPayments(); // Reload list

    } catch (err) {
        console.error('Submission error:', err);

        let msg = err.message;

        // Friendly error messages
        if (msg.includes('defense_type') && msg.includes('column')) {
            msg = "Missing 'defense_type' column! Please run the 'ADD_DEFENSE_TYPE_TO_PAYMENTS.sql' script in Supabase.";
        } else if (msg.includes('relation "payments" does not exist')) {
            msg = "Missing 'payments' table! Please run the 'CREATE_PAYMENTS_TABLE.sql' script.";
        } else if (msg.includes('receipts')) {
            msg = "Storage bucket error. Please run 'SETUP_STORAGE.sql' script.";
        }

        showToast(msg, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Reuse toast logic
const showToast = (message, type = 'info') => {
    let toast = document.getElementById('toast');
    if (!toast) return;

    const msg = document.getElementById('toastMessage');
    const icon = document.getElementById('toastIcon');

    msg.innerText = message;

    if (type === 'success') {
        toast.style.backgroundColor = '#10b981';
        icon.innerText = 'check_circle';
    } else if (type === 'error') {
        toast.style.backgroundColor = '#ef4444';
        icon.innerText = 'error';
    } else {
        toast.style.backgroundColor = '#333';
        icon.innerText = 'info';
    }

    toast.style.visibility = 'visible';
    setTimeout(() => {
        toast.style.visibility = 'hidden';
    }, 3000);
};

// Lightbox Logic
window.openLightbox = function (imageUrl) {
    const modal = document.getElementById('lightboxModal');
    const img = document.getElementById('lightboxImage');
    if (modal && img) {
        img.src = imageUrl;
        modal.classList.add('active');
    }
}

window.closeLightbox = function () {
    const modal = document.getElementById('lightboxModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

