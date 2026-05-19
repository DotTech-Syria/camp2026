import { db } from './firebase-config.js';
import { currentUser } from './auth.js';
import { collection, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// Wait for auth before setting up listeners
window.addEventListener('authReady', () => {
    if (uploadInput) {
        uploadInput.addEventListener('change', handleFileUpload);
    }

    // Modal Listeners
    if (modalClose) {
        modalClose.addEventListener('click', () => {
            imageModal.classList.add('hidden');
        });
    }

    // Close modal when clicking outside the image
    if (imageModal) {
        imageModal.addEventListener('click', (e) => {
            if (e.target === imageModal) {
                imageModal.classList.add('hidden');
            }
        });
    }

    listenToGallery();
});

async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_WEB_APP_URL') {
        alert("يرجى إعداد رابط Google Apps Script أولاً في ملف gallery.js");
        return;
    }

    const file = files[0]; // Process one by one for simplicity

    // Check file size (e.g., limit to 5MB to avoid Apps Script timeout)
    if (file.size > 8 * 1024 * 1024) {
        alert("حجم الصورة كبير جداً. الحد الأقصى 5 ميغابايت.");
        return;
    }

    uploadStatus.innerHTML = `<span style="color: var(--md-sys-color-primary);">جاري الرفع... الرجاء الانتظار</span>`;

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64Data = e.target.result;

        try {
            // 1. Upload to Google Drive via Apps Script
            const response = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify({
                    name: `${Date.now()}_${file.name}`,
                    mimeType: file.type,
                    file: base64Data
                })
            });

            // Note: fetch with Google Apps script often returns a redirect, which fetch API handles,
            // but sometimes reading the JSON response fails due to CORS on the redirect. 
            // Assuming successful configuration here:
            const result = await response.json();

            if (result.status === 'success') {
                // 2. Save reference in Firestore
                await addDoc(collection(db, "gallery"), {
                    url: result.url,
                    driveId: result.id,
                    uploadedBy: currentUser.uid,
                    uploaderName: currentUser.displayName || currentUser.email.split('@')[0],
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

        // Clear input
        uploadInput.value = '';
        setTimeout(() => { uploadStatus.innerHTML = ''; }, 3000);
    };
    reader.readAsDataURL(file);
}

function listenToGallery() {
    if (!galleryGrid) return;

    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        galleryGrid.innerHTML = '';
        if (snapshot.empty) {
            galleryGrid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1; text-align:center;">لا توجد صور بعد. كن أول من يشارك!</div>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const item = document.createElement('div');
            item.className = 'gallery-item';

            // Note: Google recently restricted the 'uc?export=view' endpoint for third-party embeds.
            // Using the thumbnail API is the most reliable way to display Drive images in 2024.
            const previewUrl = `https://drive.google.com/thumbnail?id=${data.driveId}&sz=w800`;
            const fullSizeUrl = `https://drive.google.com/thumbnail?id=${data.driveId}&sz=w2000`; // Better quality for full screen

            item.innerHTML = `
                <img src="${previewUrl}" alt="Camp Photo" loading="lazy" style="cursor: pointer;">
                <div style="position:absolute; bottom:0; left:0; right:0; background:rgba(0,0,0,0.5); color:white; padding:4px; font-size:0.7rem; text-align:center; pointer-events: none;">
                    ${data.uploaderName}
                </div>
            `;

            // Add click listener for modal
            const imgEl = item.querySelector('img');
            imgEl.addEventListener('click', () => {
                modalImage.src = fullSizeUrl;
                // For download, we can use the original view/download link (though it might redirect to a viewer page, so we open in new tab instead of download attribute)
                modalDownload.href = data.url || `https://drive.google.com/uc?export=download&id=${data.driveId}`;
                modalDownload.target = "_blank"; // Ensure it opens a new tab for download
                imageModal.classList.remove('hidden');
            });

            galleryGrid.appendChild(item);
        });
    });
}
