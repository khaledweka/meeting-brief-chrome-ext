import type { RecordingMeta, TranscriptResult } from "./types.js";

const DB_NAME = "meeting-brief-v1";
const DB_VERSION = 1;
const BLOB_STORE = "blobs";
const META_KEY = "recordingMetaList";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
  });
}

export async function saveRecordingBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(BLOB_STORE).put({ id, blob });
  });
  db.close();
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const row = await new Promise<{ id: string; blob: Blob } | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(BLOB_STORE, "readonly");
      const req = tx.objectStore(BLOB_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    },
  );
  db.close();
  return row?.blob ?? null;
}

export async function deleteRecordingBlob(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, "readwrite");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore(BLOB_STORE).delete(id);
  });
  db.close();
}

async function readMetaList(): Promise<RecordingMeta[]> {
  const raw = await chrome.storage.local.get(META_KEY);
  const list = raw[META_KEY];
  return Array.isArray(list) ? (list as RecordingMeta[]) : [];
}

async function writeMetaList(list: RecordingMeta[]): Promise<void> {
  await chrome.storage.local.set({ [META_KEY]: list });
}

export async function listRecordingMeta(): Promise<RecordingMeta[]> {
  const list = await readMetaList();
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

export async function upsertRecordingMeta(meta: RecordingMeta): Promise<void> {
  const list = await readMetaList();
  const idx = list.findIndex((m) => m.id === meta.id);
  if (idx >= 0) list[idx] = meta;
  else list.unshift(meta);
  await writeMetaList(list);
}

export async function updateRecordingTranscript(
  id: string,
  transcript: TranscriptResult,
): Promise<void> {
  const list = await readMetaList();
  const idx = list.findIndex((m) => m.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], transcript };
  await writeMetaList(list);
}

export async function removeRecording(id: string): Promise<void> {
  await deleteRecordingBlob(id);
  const list = (await readMetaList()).filter((m) => m.id !== id);
  await writeMetaList(list);
}
