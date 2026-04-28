/**
 * Inicialización de Firebase para FamilyProtect
 * Este archivo utiliza la configuración definida en js/config.js (FP_CONFIG).
 */

if (typeof window.FP_CONFIG === 'undefined' || !window.FP_CONFIG.firebase) {
    console.error("ERROR: No se encontró la configuración en js/config.js. Por favor, sigue las instrucciones en js/config.template.js");
    alert("Error de configuración: Revisa la consola para más detalles.");
} else {
    // Inicializar Firebase con los valores de FP_CONFIG
    firebase.initializeApp(window.FP_CONFIG.firebase);
}

const db = firebase.firestore();
const auth = firebase.auth();
const familyCollection = db.collection("families");
