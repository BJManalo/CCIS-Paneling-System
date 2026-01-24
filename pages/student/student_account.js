// student_account.js

document.addEventListener('DOMContentLoaded', () => {
    loadAccountDetails();
});

async function loadAccountDetails() {
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) {
        window.location.href = '../../index.html';
        return;
    }

    try {
        // Fetch Group Details
        const { data: group, error: groupError } = await supabaseClient
            .from('student_groups')
            .select('*')
            .eq('id', loginUser.id)
            .single();

        if (groupError) throw groupError;

        // Fetch Members
        const { data: members, error: membersError } = await supabaseClient
            .from('students')
            .select('*')
            .eq('group_id', loginUser.id);

        if (membersError) throw membersError;

        // Populate Form
        document.getElementById('accGroupName').value = group.group_name || '';
        document.getElementById('accEmail').value = group.email || '';
        document.getElementById('accPassword').value = group.password || '';

        // Populate Members
        for (let i = 1; i <= 5; i++) {
            const input = document.getElementById(`member${i}`);
            const member = members[i - 1];
            if (member) {
                input.value = member.full_name;
                input.setAttribute('data-student-id', member.id);
            } else {
                input.value = '';
                input.removeAttribute('data-student-id');
            }
        }

    } catch (err) {
        console.error('Error loading account:', err);
        alert('Error loading account details.');
    }
}

async function saveAccountDetails(e) {
    e.preventDefault();
    const loginUser = JSON.parse(localStorage.getItem('loginUser'));
    if (!loginUser) return;

    const groupName = document.getElementById('accGroupName').value;
    const email = document.getElementById('accEmail').value;
    const password = document.getElementById('accPassword').value;

    const submitBtn = document.querySelector('.save-btn');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="material-icons-round spin">sync</span> Saving...';
    submitBtn.disabled = true;

    try {
        // 1. Update Group Details
        const { error: groupError } = await supabaseClient
            .from('student_groups')
            .update({
                group_name: groupName,
                email: email,
                password: password
            })
            .eq('id', loginUser.id);

        if (groupError) throw groupError;

        // 2. Update Members
        for (let i = 1; i <= 5; i++) {
            const input = document.getElementById(`member${i}`);
            const name = input.value.trim();
            const studentId = input.getAttribute('data-student-id');

            if (name) {
                if (studentId) {
                    // Update existing member
                    await supabaseClient.from('students').update({ full_name: name }).eq('id', studentId);
                } else {
                    // Insert new member
                    const { data: newMember } = await supabaseClient
                        .from('students')
                        .insert([{ full_name: name, group_id: loginUser.id }])
                        .select()
                        .single();
                    // Update attribute to avoid duplicate inserts on next save
                    if (newMember) input.setAttribute('data-student-id', newMember.id);
                }
            } else if (studentId) {
                // Name cleared -> Delete member
                await supabaseClient.from('students').delete().eq('id', studentId);
                input.removeAttribute('data-student-id');
            }
        }

        // 3. Update localStorage (Session)
        const updatedUser = { ...loginUser, group_name: groupName };
        localStorage.setItem('loginUser', JSON.stringify(updatedUser)); // Keep ID for fetches, update name for display if needed

        showToast('Account details updated successfully!');

    } catch (err) {
        console.error('Error saving account:', err);
        alert('Error saving changes: ' + err.message);
    } finally {
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toastMessage');
    if (toast && msg) {
        msg.textContent = message;
        toast.style.visibility = 'visible';
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.style.visibility = 'hidden', 300);
        }, 3000);
    }
}

