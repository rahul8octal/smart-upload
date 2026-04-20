import { google } from 'googleapis';

export const getOAuthClient = (baseUrl) => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  
  // Prioritize dynamic baseUrl for development/multi-tunnel support
  let redirectUri = "";
  if (baseUrl) {
    redirectUri = `${baseUrl}/api/auth/google/callback`;
  } else if (process.env.GOOGLE_REDIRECT_URI) {
    redirectUri = process.env.GOOGLE_REDIRECT_URI;
  } else {
    redirectUri = `${process.env.PUBLIC_HOST}/api/auth/google/callback`;
  }
  
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri);
};

export const getAuthUrl = (baseUrl) => {
  const oauth2Client = getOAuthClient(baseUrl);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'consent',
  });
};

export const getTokensFromCode = async (code, baseUrl) => {
  const oauth2Client = getOAuthClient(baseUrl);
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
};

export const getDriveClient = (tokens) => {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: 'v3', auth: oauth2Client });
};

export const getUserInfo = async (tokens) => {
  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();
  return data;
};

export const listFolders = async (tokens) => {
  try {
    const drive = getDriveClient(tokens);
    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      fields: 'files(id, name)',
      orderBy: 'name',
      pageSize: 100,
    });
    return response.data.files || [];
  } catch (error) {
    console.error("Error listing Google Drive folders:", error);
    return [];
  }
};

export const listFiles = async (tokens, folderId) => {
  const drive = getDriveClient(tokens);
  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id, name, thumbnailLink, webContentLink, size)',
    pageSize: 1000,
  });
  return response.data.files;
};
