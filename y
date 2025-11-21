rules_version = '2';service cloud.firestore {match /databases/{database}/documents {// --- PUBLIC DATA ---
// This single rule allows anyone to read all public documents (products, slides, etc.)
// The recursive wildcard {document=**} ensures all paths under public/data are covered.
match /artifacts/{appId}/public/data/{document=**} {
  allow read: if true;
  // Write access can be refined later, for now allow authenticated users
  allow write: if request.auth != null; 
}

// --- USER-SPECIFIC DATA ---
// This single rule allows a logged-in user to read and write to all of their own documents
// and subcollections (like their personal cart and orders). This is the key fix.
match /artifacts/{appId}/users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
}}