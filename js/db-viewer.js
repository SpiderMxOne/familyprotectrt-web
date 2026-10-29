/**
 * DB Viewer SQL Engine for FamilyProtect
 * Translates SQL-like syntax to Firestore commands
 */

const resultContainer = document.getElementById('result-container');
const sqlInput = document.getElementById('sql-input');
const queryStats = document.getElementById('query-stats');
const queryTime = document.getElementById('query-time');

// Handle F5 or Ctrl+Enter to execute
sqlInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') executeSQL();
});

function clearEditor() {
    sqlInput.value = '';
    resultContainer.innerHTML = `
        <div class="h-full flex items-center justify-center text-gray-300 flex-col gap-4">
            <i class="fas fa-table-list text-6xl opacity-10"></i>
            <p class="font-bold uppercase tracking-widest text-sm">Los resultados aparecerán aquí</p>
        </div>
    `;
}

function quickQuery(sql) {
    sqlInput.value = sql;
    executeSQL();
}

async function executeSQL() {
    const rawSql = sqlInput.value.trim();
    if (!rawSql) return;

    const start = performance.now();
    showLoading();

    try {
        const result = await processQuery(rawSql);
        renderResults(result);
        const duration = (performance.now() - start).toFixed(2);
        queryStats.innerText = `Consulta ejecutada con éxito.`;
        queryTime.innerText = `${duration}ms`;
    } catch (e) {
        renderError(e.message);
        queryStats.innerText = `Error en la consulta.`;
        queryTime.innerText = '';
    }
}

async function processQuery(sql) {
    const parts = sql.match(/(\w+)\s+(.+)/i);
    if (!parts) throw new Error("Sintaxis SQL no válida");

    const command = parts[1].toUpperCase();
    const rest = parts[2];

    switch (command) {
        case 'SELECT': return await handleSelect(rest);
        case 'INSERT': return await handleInsert(rest);
        case 'UPDATE': return await handleUpdate(rest);
        case 'DELETE': return await handleDelete(rest);
        default: throw new Error(`Comando ${command} no soportado`);
    }
}

/**
 * SELECT * FROM collection [WHERE key = value]
 */
async function handleSelect(query) {
    const match = query.match(/\*\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+))?/i);
    if (!match) throw new Error("Sintaxis SELECT no válida. Use: SELECT * FROM collection [WHERE key = value]");

    const collectionName = match[1];
    const whereClause = match[2];

    let ref;
    // Soporte para CollectionGroup (members, messages, etc) o Collection Raíz (families)
    if (collectionName === 'families') {
        ref = db.collection('families');
    } else {
        ref = db.collectionGroup(collectionName);
    }

    if (whereClause) {
        const whereMatch = whereClause.match(/(\w+)\s*=\s*(.+)/);
        if (whereMatch) {
            let val = whereMatch[2].trim().replace(/['"]/g, '');
            // Convertir tipos básicos
            if (val === 'true') val = true;
            else if (val === 'false') val = false;
            else if (!isNaN(val)) val = Number(val);

            ref = ref.where(whereMatch[1].trim(), '==', val);
        }
    }

    const snapshot = await ref.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * INSERT INTO collection (k1, k2) VALUES (v1, v2)
 */
async function handleInsert(query) {
    const match = query.match(/INTO\s+(\w+)\s*\((.+)\)\s*VALUES\s*\((.+)\)/i);
    if (!match) throw new Error("Sintaxis INSERT no válida");

    const collection = match[1];
    const keys = match[2].split(',').map(k => k.trim());
    const values = match[3].split(',').map(v => v.trim().replace(/['"]/g, ''));

    const data = {};
    keys.forEach((key, i) => {
        let val = values[i];
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val)) val = Number(val);
        data[key] = val;
    });

    if (collection === 'families' && data.id) {
        const id = data.id;
        delete data.id;
        await db.collection('families').doc(id).set(data);
        return [{ status: 'OK', message: `Familia ${id} creada` }];
    } else {
        throw new Error("Inserción solo permitida en la tabla raíz 'families' con un ID");
    }
}

/**
 * UPDATE collection SET key = val WHERE id = docId
 */
async function handleUpdate(query) {
    const match = query.match(/(\w+)\s+SET\s+(.+)\s+WHERE\s+id\s*=\s*(.+)/i);
    if (!match) throw new Error("Sintaxis UPDATE no válida. Use: UPDATE table SET k=v WHERE id=docId");

    const collection = match[1];
    const setPart = match[2];
    const docId = match[3].trim().replace(/['"]/g, '');

    const updateData = {};
    setPart.split(',').forEach(pair => {
        const [k, v] = pair.split('=').map(s => s.trim().replace(/['"]/g, ''));
        let val = v;
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(val)) val = Number(val);
        updateData[k] = val;
    });

    // Esta es una limitación: para actualizar necesitamos la ruta completa o que sea raíz
    if (collection === 'families') {
        await db.collection('families').doc(docId).update(updateData);
        return [{ status: 'OK', message: `Documento ${docId} actualizado` }];
    } else {
        throw new Error("Por seguridad, el UPDATE vía SQL solo está disponible para la tabla 'families'");
    }
}

/**
 * DELETE FROM collection WHERE id = docId
 */
async function handleDelete(query) {
    const match = query.match(/FROM\s+(\w+)\s+WHERE\s+id\s*=\s*(.+)/i);
    if (!match) throw new Error("Sintaxis DELETE no válida. Use: DELETE FROM table WHERE id = docId");

    const collection = match[1];
    const docId = match[2].trim().replace(/['"]/g, '');

    if (collection === 'families') {
        await db.collection('families').doc(docId).delete();
        return [{ status: 'OK', message: `Documento ${docId} eliminado` }];
    } else {
        throw new Error("DELETE solo permitido en tabla raíz 'families'");
    }
}

function renderResults(data) {
    if (!data || data.length === 0) {
        resultContainer.innerHTML = '<div class="p-8 text-center text-gray-400">Consulta vacía: 0 registros encontrados.</div>';
        return;
    }

    const keys = Object.keys(data[0]);
    let html = `
        <table class="w-full text-left border-collapse bg-white rounded-xl overflow-hidden shadow-sm result-table">
            <thead>
                <tr class="border-b border-gray-100">
                    ${keys.map(k => `<th class="p-4 text-[10px] font-black uppercase text-gray-400 tracking-widest">${k}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.map(row => `
                    <tr class="border-b border-gray-50 hover:bg-blue-50/30 transition-colors">
                        ${keys.map(k => {
                            const val = row[k];
                            const displayVal = typeof val === 'object' ? JSON.stringify(val).substring(0, 50) + '...' : val;
                            return `<td class="p-4 text-xs font-mono text-gray-600 truncate max-w-[200px]" title="${val}">${displayVal}</td>`;
                        }).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    resultContainer.innerHTML = html;
}

function renderError(msg) {
    resultContainer.innerHTML = `
        <div class="p-8 bg-red-50 border border-red-100 rounded-2xl text-red-600 flex items-center gap-4">
            <i class="fas fa-circle-xmark text-2xl"></i>
            <div>
                <p class="font-black uppercase text-[10px] tracking-widest mb-1">SQL Error</p>
                <p class="text-sm font-bold">${msg}</p>
            </div>
        </div>
    `;
}

function showLoading() {
    resultContainer.innerHTML = `
        <div class="h-full flex items-center justify-center">
            <i class="fas fa-circle-notch animate-spin text-4xl text-blue-500"></i>
        </div>
    `;
}
