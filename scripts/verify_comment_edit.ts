import { createToken } from '../src/utils/auth';

async function main() {
    console.log('Testing Comment Edit & Delete (Port 3002)...');

    // 1. Generate Token
    const user = { id: 1, username: 'testuser', role: 'user' };
    const token = await createToken(user);
    console.log('Generated Token');

    // 2. Create Comment
    console.log('Creating comment...');
    const createRes = await fetch('http://localhost:3002/api/comments', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            slug: 'edit-test-slug',
            content: 'Original Content',
            is_spoiler: false
        })
    });

    const createData = await createRes.json();
    if (!createData.comment) {
        console.error('Failed to create:', createData);
        return;
    }
    const commentId = createData.comment.id;
    console.log('Created Comment ID:', commentId, 'Content:', createData.comment.content);

    // 3. Edit Comment
    console.log('Editing comment...');
    const editRes = await fetch(`http://localhost:3002/api/comments/${commentId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
            content: 'Updated Content',
            is_spoiler: true,
            media_url: 'http://example.com/image.png'
        })
    });

    console.log('Edit Response Status:', editRes.status);
    const editText = await editRes.text();
    console.log('Edit Response Body:', editText);

    try {
        const editData = JSON.parse(editText);
        console.log('Updated Content:', editData.comment?.content);
        console.log('Updated Spoiler:', editData.comment?.is_spoiler);

        if (editData.comment?.content === 'Updated Content') {
            console.log('✅ Edit Verified');
        } else {
            console.log('❌ Edit Failed');
        }
    } catch (e) {
        console.error('Failed to parse edit response JSON', e);
    }

    // 4. Delete Comment
    console.log('Deleting comment...');
    const deleteRes = await fetch(`http://localhost:3002/api/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (deleteRes.ok) {
        console.log('✅ Delete Verified');
    } else {
        console.log('❌ Delete Failed', await deleteRes.text());
    }
}

main();
