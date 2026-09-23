(() => {
  const config = window.SITGES_FIREBASE_CONFIG || {};
  const configured = ["apiKey", "authDomain", "projectId", "appId"].every((key) => typeof config[key] === "string" && config[key].trim());
  const available = configured && ["https:", "http:"].includes(window.location.protocol);
  let connection;
  const connect = () => connection ||= (async () => {
    if (!available) throw new Error("Abre la web publicada para entrar en tu cuenta.");
    const [appSDK, authSDK, dbSDK] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js"),
    ]);
    const app = appSDK.initializeApp(config);
    const auth = authSDK.getAuth(app);
    auth.languageCode = "es";
    const db = dbSDK.getFirestore(app);
    const ref = (uid) => dbSDK.doc(db, "agendas", uid);
    const value = (snapshot) => snapshot.exists()
      ? { revision: snapshot.data().revision, data: window.SitgesData.normalize(snapshot.data().data) }
      : { revision: 0, data: window.SitgesData.empty() };
    return {
      observeAuth: (callback) => authSDK.onAuthStateChanged(auth, callback),
      login: (email, password) => authSDK.signInWithEmailAndPassword(auth, email, password),
      signup: (email, password) => authSDK.createUserWithEmailAndPassword(auth, email, password),
      reset: (email) => authSDK.sendPasswordResetEmail(auth, email),
      logout: () => authSDK.signOut(auth),
      watch: (uid, callback, error) => dbSDK.onSnapshot(ref(uid), { includeMetadataChanges: true }, (snapshot) => {
        // Only confirmed server revisions can be used for cross-device comparison.
        if (!snapshot.metadata.hasPendingWrites && !snapshot.metadata.fromCache) callback(value(snapshot));
      }, error),
      save: (uid, revision, data) => dbSDK.runTransaction(db, async (transaction) => {
        if (auth.currentUser?.uid !== uid) throw new Error("La sesión ha cambiado.");
        const remote = value(await transaction.get(ref(uid)));
        if (remote.revision !== revision) {
          const error = new Error("Esta agenda ha cambiado en otro dispositivo.");
          error.code = "agenda/conflict";
          error.remote = remote;
          throw error;
        }
        transaction.set(ref(uid), { revision: revision + 1, data: window.SitgesData.normalize(data), updatedAt: dbSDK.serverTimestamp() });
        return revision + 1;
      }),
    };
  })().catch((error) => { connection = null; throw error; });
  window.SitgesCloud = { configured, available, connect };
})();
