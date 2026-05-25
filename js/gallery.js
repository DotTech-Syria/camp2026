import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: Replace with your Google Apps Script Web App URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMuuvP6uQdATv-uLp0nxS1OEvwJZV5RuSUIUWWuu1iN7t-VkE3xHV_CaXACiL-oB4D_w/exec';

const uploadInput = document.getElementById('photo-upload');
const uploadStatus = document.getElementById('upload-status');
const galleryGrid = document.getElementById('gallery-grid');

// Modal Elements
const imageModal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const modalClose = document.getElementById('modal-close');
const modalDownload = document.getElementById('modal-download');
const modalUploaderName = document.getElementById('modal-uploader-name');
const modalUploaderPic = document.getElementById('modal-uploader-pic');
const modalUploadDate = document.getElementById('modal-upload-date');
const modalLikeBtn = document.getElementById('modal-like-btn');
const modalLikeIcon = document.getElementById('modal-like-icon');
const modalLikeCount = document.getElementById('modal-like-count');
const modalCommentsList = document.getElementById('modal-comments-list');
const modalCommentForm = document.getElementById('modal-comment-form');
const modalCommentInput = document.getElementById('modal-comment-input');

let currentGalleryUnsubscribe = null;
let currentCommentsUnsubscribe = null;
let currentActiveCategory = 'الكل';
let currentViewedPhotoId = null;

// Wait for auth before setting up listeners
window.addEventListener('authReady', () => {
    if (uploadInput) {
        uploadInput.addEventListener('change', handleFileUpload);
    }



    // Modal Listeners
    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    // Close modal when clicking outside the image container
    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal || e.target.classList.contains('modal-content-wrapper')) {
                closeModal();
            }
        });
    }

    if (modalLikeBtn) {
        modalLikeBtn.addEventListener('click', toggleLike);
    }

    if (modalCommentForm) {
        modalCommentForm.addEventListener('submit', handleAddComment);
    }

    listenToGallery();
});

function closeModal() {
    imageModal.classList.add('hidden');
    currentViewedPhotoId = null;
    if (currentCommentsUnsubscribe) {
        currentCommentsUnsubscribe();
        currentCommentsUnsubscribe = null;
    }
}

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
        alert("يرجى إعداد رابط Google Apps Script أولاً في ملف gallery.js");
        return;
    }

    const file = files[0];

    uploadStatus.innerHTML = `<span style="color: var(--md-sys-color-primary);">جاري الضغط والرفع...</span>`;

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.onload = async function () {
            // Compress Image using Canvas
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Get compressed Base64
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

            try {
                // Upload to Apps Script
                const response = await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        name: `${Date.now()}_compressed.jpg`,
                        mimeType: 'image/jpeg',
                        file: compressedBase64
                    })
                });

                const result = await response.json();

                if (result.status === 'success') {
                    // Save reference in Firestore
                    await addDoc(collection(db, "gallery"), {
                        url: result.url,
                        driveId: result.id,
                        uploadedBy: currentUser.uid,
                        uploaderName: currentUser.name || 'عضو المخيم',
                        uploaderPic: `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.name || 'عضو'}&backgroundColor=005048&textColor=ffffff`,
                        likes: [],
                        createdAt: new Date().toISOString()
                    });
                    uploadStatus.innerHTML = `<span style="color: green;">تم الرفع بنجاح!</span>`;
                } else {
                    throw new Error(result.message);
                }
            } catch (error) {
                console.error("Upload error:", error);
                uploadStatus.innerHTML = `<span style="color: var(--md-sys-color-error);">فشل الرفع: ${error.message}</span>`;
            }

            uploadInput.value = '';
            setTimeout(() => { uploadStatus.innerHTML = ''; }, 3000);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function listenToGallery() {
    if (!galleryGrid) return;
    if (currentGalleryUnsubscribe) currentGalleryUnsubscribe();

    let q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));

    currentGalleryUnsubscribe = onSnapshot(q, (snapshot) => {
        galleryGrid.innerHTML = '';
        
        let hasItems = false;
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            hasItems = true;

            const item = document.createElement('div');
            item.className = 'gallery-item';

            const previewUrl = `https://drive.google.com/thumbnail?id=${data.driveId}&sz=w800`;
            const fullSizeUrl = `https://drive.google.com/thumbnail?id=${data.driveId}&sz=w2000`;
            const likesCount = data.likes ? data.likes.length : 0;

            item.innerHTML = `
                <img src="${previewUrl}" alt="Camp Photo" loading="lazy" style="cursor: pointer;">
                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.6); color:white; padding:6px; font-size:0.75rem; display:flex; justify-content:space-between; align-items:center; pointer-events: none;">
                    <span>${data.uploaderName}</span>
                    <span style="display:flex; align-items:center; gap:2px;"><span class="material-symbols-rounded" style="font-size:1rem; ${likesCount > 0 ? 'color:#ff4b4b;' : ''}">favorite</span> ${likesCount}</span>
                </div>
            `;

            const imgEl = item.querySelector('img');
            imgEl.addEventListener('click', () => openImageModal(docSnap.id, data, fullSizeUrl));

            galleryGrid.appendChild(item);
        });

        if (!hasItems) {
            galleryGrid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; text-align:center;">لا توجد صور لعرضها حالياً.</div>';
        }
    });
}

function openImageModal(photoId, data, fullSizeUrl) {
    currentViewedPhotoId = photoId;
    modalImage.src = fullSizeUrl;
    modalDownload.href = data.url || `https://drive.google.com/uc?export=download&id=${data.driveId}`;
    
    if (modalUploaderPic) {
        modalUploaderPic.src = data.uploaderPic || 'https://via.placeholder.com/40';
    }
    modalUploaderName.textContent = data.uploaderName;
    modalUploadDate.textContent = new Date(data.createdAt).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
    
    updateLikeUI(data.likes || []);
    
    listenToComments(photoId);
    
    imageModal.classList.remove('hidden');
}

function updateLikeUI(likesArray) {
    const isLiked = currentUser && likesArray.includes(currentUser.uid);
    modalLikeCount.textContent = likesArray.length;
    if (isLiked) {
        modalLikeIcon.style.color = '#ff4b4b';
        modalLikeIcon.style.fontVariationSettings = "'FILL' 1";
    } else {
        modalLikeIcon.style.color = 'var(--md-sys-color-secondary)';
        modalLikeIcon.style.fontVariationSettings = "'FILL' 0";
    }
}

async function toggleLike() {
    if (!currentUser || !currentViewedPhotoId) return;
    
    const photoRef = doc(db, "gallery", currentViewedPhotoId);
    const isLiked = modalLikeIcon.style.color === 'rgb(255, 75, 75)' || modalLikeIcon.style.color === '#ff4b4b';
    
    try {
        if (isLiked) {
            await updateDoc(photoRef, {
                likes: arrayRemove(currentUser.uid)
            });
            // Update UI optimistically
            modalLikeCount.textContent = Math.max(0, parseInt(modalLikeCount.textContent) - 1);
            modalLikeIcon.style.color = 'var(--md-sys-color-secondary)';
            modalLikeIcon.style.fontVariationSettings = "'FILL' 0";
        } else {
            await updateDoc(photoRef, {
                likes: arrayUnion(currentUser.uid)
            });
            // Update UI optimistically
            modalLikeCount.textContent = parseInt(modalLikeCount.textContent) + 1;
            modalLikeIcon.style.color = '#ff4b4b';
            modalLikeIcon.style.fontVariationSettings = "'FILL' 1";
        }
    } catch (error) {
        console.error("Error toggling like:", error);
    }
}

function listenToComments(photoId) {
    if (currentCommentsUnsubscribe) currentCommentsUnsubscribe();
    
    const q = query(collection(db, `gallery/${photoId}/comments`), orderBy("createdAt", "asc"));
    
    currentCommentsUnsubscribe = onSnapshot(q, (snapshot) => {
        modalCommentsList.innerHTML = '';
        
        if (snapshot.empty) {
            modalCommentsList.innerHTML = '<div style="text-align:center; opacity:0.6; font-size:0.8rem; margin-top:20px;">لا توجد تعليقات بعد.</div>';
            return;
        }
        
        snapshot.forEach((docSnap) => {
            const comment = docSnap.data();
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.style.display = 'flex';
            div.style.gap = '8px';
            div.style.alignItems = 'flex-start';
            div.innerHTML = `
                <img src="${comment.userPic || 'https://via.placeholder.com/40'}" style="width:28px; height:28px; border-radius:50%; object-fit:cover; margin-top: 2px;">
                <div style="flex:1;">
                    <div class="comment-header">
                        <strong>${comment.userName}</strong>
                        <span>${new Date(comment.createdAt).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div>${comment.text}</div>
                </div>
            `;
            modalCommentsList.appendChild(div);
        });
        
        // Auto scroll to bottom
        modalCommentsList.scrollTop = modalCommentsList.scrollHeight;
    });
}

async function handleAddComment(e) {
    e.preventDefault();
    if (!currentUser || !currentViewedPhotoId) return;
    
    const text = modalCommentInput.value.trim();
    if (!text) return;
    
    modalCommentInput.value = '';
    
    try {
        await addDoc(collection(db, `gallery/${currentViewedPhotoId}/comments`), {
            text: text,
            userId: currentUser.uid,
            userName: currentUser.name || 'عضو المخيم',
            userPic: `https://api.dicebear.com/7.x/initials/svg?seed=${currentUser.name || 'عضو'}&backgroundColor=005048&textColor=ffffff`,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error adding comment:", error);
        alert("حدث خطأ أثناء إضافة التعليق.");
    }
}

