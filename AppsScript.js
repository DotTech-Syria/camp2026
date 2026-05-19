// NOTE: You need to deploy this script as a "Web App" on script.google.com
// 1. Go to script.google.com
// 2. Paste this code.
// 3. Create a folder in your Google Drive named "CampMedia" and get its Folder ID from the URL.
// 4. Replace 'YOUR_FOLDER_ID_HERE' with that ID.
// 5. Click Deploy -> New Deployment -> Select "Web app".
// 6. Execute as: "Me"
// 7. Who has access: "Anyone" (so the browser can post to it without login prompts, since we secure it client side)
// 8. Copy the Web App URL and paste it in js/gallery.js

const FOLDER_ID = '17OvQDJCJsxduLcjVXV-MQ1IuG3eXERYI';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const fileData = data.file;
    const fileName = data.name;
    const mimeType = data.mimeType;

    // Decode base64 data
    const base64Data = fileData.split(',')[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const file = folder.createFile(blob);

    // Set file sharing to anyone with the link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileUrl = file.getDownloadUrl(); // Or getUrl() for preview

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      url: fileUrl,
      id: file.getId()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle preflight requests (CORS)
function doOptions(e) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders(headers);
}
