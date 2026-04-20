// Basic Dropbox helper for product photo uploader
export const listDropboxFolders = async (accessToken) => {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: '',
        recursive: false,
        include_media_info: false,
        include_deleted: false,
      }),
    });
    const data = await response.json();
    return (data.entries || [])
      .filter(entry => entry['.tag'] === 'folder')
      .map(entry => ({ id: entry.path_lower, name: entry.name }));
  } catch (error) {
    console.error("Error listing Dropbox folders:", error);
    return [];
  }
};

export const listDropboxFiles = async (accessToken, path) => {
  try {
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: path === 'root' ? '' : path,
        recursive: false,
        include_media_info: true,
      }),
    });
    const data = await response.json();
    
    // Transform Dropbox entries to match Google Drive format for consistency
    return (data.entries || [])
      .filter(entry => entry['.tag'] === 'file' && isImage(entry.name))
      .map(entry => ({
        id: entry.id,
        name: entry.name,
        thumbnailLink: '', // Dropbox needs separate call for thumbnails
        webContentLink: `https://dl.dropboxusercontent.com/scl/fi/${entry.id.split(':')[1]}/${entry.name}?rlkey=TODO&dl=1`, 
        // Note: Dropbox direct links are tricky without a specific shared link
        size: entry.size
      }));
  } catch (error) {
    console.error("Error listing Dropbox files:", error);
    return [];
  }
};

const isImage = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
};
