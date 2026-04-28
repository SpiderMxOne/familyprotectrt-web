/**
 * SecurityUtils - Web Implementation
 * Mirrors the Android implementation for AES-256 E2EE.
 * Uses CryptoJS for simplicity and compatibility with Android's default AES mode.
 */

const SecurityUtils = {
    /**
     * Derives a 256-bit key from the family code using SHA-256.
     * @param {string} familyCode
     * @returns {CryptoJS.lib.WordArray}
     */
    deriveKey: function(familyCode) {
        return CryptoJS.SHA256(familyCode);
    },

    /**
     * Encrypts data using AES-256.
     * Android uses AES/ECB/PKCS5Padding by default in the provided code.
     * @param {string} data
     * @param {CryptoJS.lib.WordArray} key
     * @returns {string} Base64 string
     */
    encrypt: function(data, key) {
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        });
        return encrypted.toString();
    },

    /**
     * Decrypts data using AES-256.
     * @param {string} encryptedData Base64 string
     * @param {CryptoJS.lib.WordArray} key
     * @returns {string} Decrypted data
     */
    decrypt: function(encryptedData, key) {
        try {
            const decrypted = CryptoJS.AES.decrypt(encryptedData, key, {
                mode: CryptoJS.mode.ECB,
                padding: CryptoJS.pad.Pkcs7
            });
            return decrypted.toString(CryptoJS.enc.Utf8);
        } catch (e) {
            console.error("Decryption error:", e);
            return "Error al descifrar";
        }
    }
};
