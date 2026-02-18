import { createToken } from '../src/utils/auth';

async function main() {
    console.log('Testing Comment Deletion (Port 3002)...');

    // 1. Generate Token (Admin or User)
    // We'll mimic a user for this test
    const user = { id: 1, username: 'testuser', role: 'user' };
    const token = await createToken(user);
    console.log('Generated Token:', token);

    // 2. We need a comment ID to delete.

    // Create
    const createRes = await fetch('http://localhost:3002/api/comments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            slug: 'delete-test-slug-3002',
            content: 'To be deleted from 3002',
            is_spoiler: false
        })
    });

    const createData = await createRes.json();
    console.log('Create Response:', createRes.status, createData);

    if (!createRes.ok || !createData.comment) {
        console.error('Failed to create test comment');
        return;
    }

    const commentId = createData.comment.id;
    console.log('Created Comment ID:', commentId);

    // 3. Delete
    console.log(`Deleting comment ${commentId}...`);
    const deleteRes = await fetch(`http://localhost:3002/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    console.log('Delete Status:', deleteRes.status);
    const text = await deleteRes.text();
    console.log('Body:', text);

    if (deleteRes.ok) {
        console.log('✅ SUCCESS: Comment deleted.');
    } else {
        console.log('❌ FAILURE: Could not delete comment.');
    }
}

main();
