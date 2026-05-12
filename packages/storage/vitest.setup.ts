import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

// Attach fake-indexeddb to global scope for Dexie
globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
