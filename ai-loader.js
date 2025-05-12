/**
 * AI Chat Sync Loader Script
 * Automatically syncs Claude and ChatGPT logs
 * Splits large files, tags conversations, logs entries to Sheet
 */

function syncChatsFromDrive() {
  const rootFolderId = "10RTo4qKz9cpxtqnuoBVGzzTU70S5qEAc";
  const claude = getSubfolderByName(rootFolderId, "claudeai");
  const chatgpt = getSubfolderByName(rootFolderId, "chatgpt");
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("ChatLogs") || SpreadsheetApp.getActiveSpreadsheet().insertSheet("ChatLogs");

  const sources = [
    { name: "Claude", folder: claude },
    { name: "ChatGPT", folder: chatgpt }
  ];

  for (const src of sources) {
    const files = src.folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      const ext = name.split('.').pop().toLowerCase();
      const sizeLimit = 1024 * 1024 * 5; // 5MB soft limit

      if (file.getSize() > sizeLimit) {
        splitLargeFile(file, src.name);
        continue;
      }

      try {
        const content = file.getBlob().getDataAsString();
        if (ext === "json") {
          const parsed = JSON.parse(content);
          const messages = parsed.messages || parsed;
          for (const m of messages) {
            const time = m.timestamp || new Date().toISOString();
            const role = m.role || "unknown";
            const text = m.text || m.content || "(empty)";
            const summary = text.substring(0, 40).replace(/\n/g, ' ') + "...";
            const id = Utilities.getUuid().split("-")[0];
            sheet.appendRow([id, time, src.name, role, summary, name]);
          }
        } else if (ext === "txt" || ext === "html") {
          const cleaned = content.replace(/<[^>]+>/g, '').trim();
          const lines = cleaned.split(/\n{2,}/);
          lines.forEach(line => {
            if (line.length < 10) return;
            const id = Utilities.getUuid().split("-")[0];
            const preview = line.substring(0, 40);
            sheet.appendRow([id, new Date().toISOString(), src.name, "raw", preview + "...", name]);
          });
        }
      } catch (e) {
        Logger.log("Skipped file due to error: " + name);
      }
    }
  }
}

function splitLargeFile(file, label) {
  const folder = DriveApp.getFolderById(file.getParents().next().getId());
  const blob = file.getBlob();
  const name = file.getName();
  const raw = blob.getDataAsString();
  const parts = raw.split(/(?=<h1>|"timestamp"|<div class="chat">)/i);

  for (let i = 0; i < parts.length; i++) {
    const partBlob = Utilities.newBlob(parts[i], MimeType.PLAIN_TEXT, `${name}_part${i + 1}.txt`);
    folder.createFile(partBlob);
  }
  Logger.log("Split large file: " + name);
}

function getSubfolderByName(parentId, name) {
  const parent = DriveApp.getFolderById(parentId);
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : null;
}
