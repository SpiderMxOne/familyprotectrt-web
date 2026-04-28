/**
 * FirebaseManager - Web Implementation
 * Mirrors the logic from the Android FirebaseManager.kt
 */

const FirebaseManager = {
    loginAnonymously: async () => {
        try {
            const result = await auth.signInAnonymously();
            return result.user.uid;
        } catch (e) {
            console.error("Auth Anónima Fallida:", e);
            return null;
        }
    },

    createAdminAccount: async (email, pass) => {
        try {
            const result = await auth.createUserWithEmailAndPassword(email, pass);
            return result.user.uid;
        } catch (e) {
            console.error("Error al crear cuenta:", e);
            return null;
        }
    },

    authenticateAdmin: async (email, pass) => {
        try {
            const result = await auth.signInWithEmailAndPassword(email, pass);
            return result.user.uid;
        } catch (e) {
            console.error("Error al autenticar:", e);
            return null;
        }
    },

    getFamilyCodeByAdmin: async (email) => {
        try {
            const query = await familyCollection.where("adminEmail", "==", email).limit(1).get();
            if (query.empty) return null;
            return query.docs[0].id;
        } catch (e) {
            console.error("Error getFamilyCodeByAdmin:", e);
            return null;
        }
    },

    joinOrCreateFamily: async (familyCode, member, adminEmail = null) => {
        try {
            const uid = auth.currentUser.uid;
            const code = familyCode.trim().toUpperCase();
            const familyDoc = familyCollection.doc(code);

            if (adminEmail) {
                await familyDoc.set({
                    id: code,
                    familyCode: code,
                    adminEmail: adminEmail,
                    safePlaces: []
                });
                await familyDoc.collection("members").doc(uid).set({
                    ...member,
                    id: uid,
                    profileId: uid,
                    isApproved: true,
                    isAdmin: true
                });
                return true;
            } else {
                const snapshot = await familyDoc.get();
                if (snapshot.exists) {
                    await familyDoc.collection("members").doc(uid).set({
                        ...member,
                        id: uid,
                        isApproved: false
                    });
                    return true;
                }
                return false;
            }
        } catch (e) {
            console.error("Error joinOrCreateFamily:", e);
            return false;
        }
    },

    listenForMembers: (familyCode, callback) => {
        const code = familyCode.trim().toUpperCase();
        return familyCollection.doc(code).collection("members").onSnapshot(snapshot => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(members);
        }, err => console.error("Error members listener:", err));
    },

    listenForMessages: (familyCode, callback) => {
        const code = familyCode.trim().toUpperCase();
        return familyCollection.doc(code).collection("messages")
            .orderBy("timestamp", "desc")
            .onSnapshot(snapshot => {
                const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(messages);
            }, err => console.error("Error messages listener:", err));
    },

    listenForAlerts: (familyCode, callback) => {
        const code = familyCode.trim().toUpperCase();
        return familyCollection.doc(code).collection("alerts")
            .orderBy("timestamp", "desc")
            .limit(10)
            .onSnapshot(snapshot => {
                const alerts = snapshot.docs.map(doc => doc.data());
                callback(alerts);
            }, err => console.error("Error alerts listener:", err));
    },

    sendMessage: async (familyCode, message) => {
        const code = familyCode.trim().toUpperCase();
        await familyCollection.doc(code).collection("messages").doc(message.id).set(message);
    },

    updateSOSStatus: async (familyCode, memberId, active) => {
        const code = familyCode.trim().toUpperCase();
        await familyCollection.doc(code).collection("members").doc(memberId).update({ isSOS: active });
    },

    sendAlert: async (familyCode, alert) => {
        const code = familyCode.trim().toUpperCase();
        await familyCollection.doc(code).collection("alerts").add(alert);
    },

    updateMemberStats: async (familyCode, memberId, battery, charging, state, activity) => {
        const code = familyCode.trim().toUpperCase();
        await familyCollection.doc(code).collection("members").doc(memberId).update({
            batteryLevel: battery,
            isCharging: charging,
            connectionState: state,
            currentActivity: activity,
            lastSeen: Date.now()
        });
    },

    addAuditLog: async (familyCode, log) => {
        const code = familyCode.trim().toUpperCase();
        await familyCollection.doc(code).collection("audit_logs").add(log);
    },

    listenForAuditLogs: (familyCode, callback) => {
        const code = familyCode.trim().toUpperCase();
        return familyCollection.doc(code).collection("audit_logs")
            .orderBy("timestamp", "desc")
            .limit(50)
            .onSnapshot(snapshot => {
                const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(logs);
            }, err => console.error("Error audit logs listener:", err));
    },

    listenForFamilyGroup: (familyCode, callback) => {
        const code = familyCode.trim().toUpperCase();
        return familyCollection.doc(code).onSnapshot(snapshot => {
            callback(snapshot.exists ? snapshot.data() : null);
        }, err => console.error("Error family group listener:", err));
    }
};
