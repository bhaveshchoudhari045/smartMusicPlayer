class FolderDB {
  static async saveHandle(handle) {
    const db = await this._getDB();
    const tx = db.transaction("handles", "readwrite");
    const store = tx.objectStore("handles");

    store.put(handle, "musicFolder");

    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
  }

  static async getHandle() {
    const db = await this._getDB();
    const tx = db.transaction("handles", "readonly");
    const store = tx.objectStore("handles");

    return new Promise((resolve, reject) => {
      const req = store.get("musicFolder");
      req.onsuccess = () => resolve(req.result);
      req.onerror = reject;
    });
  }

  static _getDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("nova-player-db", 1);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains("handles")) {
          db.createObjectStore("handles");
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}
