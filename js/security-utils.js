/**
 * SecurityUtils - Web Implementation (AES-GCM-256)
 * Mirrors the Android implementation for Zero-Knowledge E2EE.
 * Uses the native Web Crypto API for high performance and military-grade security.
 */

const SecurityUtils = {
    /**
     * Derives a 256-bit key from the family code using SHA-256.
     * @param {string} familyCode
     * @returns {Promise<CryptoKey>}
     */
    deriveKey: async function(familyCode) {
        const encoder = new TextEncoder();
        const data = encoder.encode(familyCode);
        const hash = await crypto.subtle.digest('SHA-256', data);

        return await crypto.subtle.importKey(
            'raw',
            hash,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    },

    /**
     * Encrypts data using AES-GCM.
     * @param {string} data
     * @param {CryptoKey} key
     * @returns {Promise<string>} Format "IV:Ciphertext" (Base64)
     */
    encrypt: async function(data, key) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV for GCM
        const encodedData = encoder.encode(data);

        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encodedData
        );

        const ivBase64 = btoa(String.fromCharCode(...iv));
        const cipherBase64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

        return `${ivBase64}:${cipherBase64}`;
    },

    /**
     * Decrypts data using AES-GCM.
     * @param {string} encryptedData Format "IV:Ciphertext"
     * @param {CryptoKey} key
     * @returns {Promise<string>}
     */
    decrypt: async function(encryptedData, key) {
        try {
            if (!encryptedData || !encryptedData.includes(':')) return "Dato no cifrado o inválido";

            const [ivBase64, cipherBase64] = encryptedData.split(':');
            const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
            const ciphertext = new Uint8Array(atob(cipherBase64).split('').map(c => c.charCodeAt(0)));

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption error:", e);
            return "Error al descifrar (Clave incorrecta o dato corrupto)";
        }
    }
};
