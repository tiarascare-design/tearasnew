import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInAnonymously, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithRedirect, getRedirectResult, linkWithRedirect, signInWithCredential, connectAuthEmulator, RecaptchaVerifier, signInWithPhoneNumber, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp, query, where, getDocs, getDoc, writeBatch, increment, runTransaction, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";
import { GSTIN_REGEX, getStateCodeFromGstin, computeGstForItems, attachGstinValidation, GST_STATE_CODES } from '../../src/gst.js';

// Debug marker to verify browser loads the latest script build
try { console.info('TIARAS_APP_JS_UPDATED_v1'); } catch (_) {}

// --- CONFIG & INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAYLMFFAzJhiNZbtwXxmeGRMzuar6Af7fE",
    authDomain: "tiaras-website.firebaseapp.com",
    projectId: "tiaras-website",
    storageBucket: "tiaras-website.appspot.com",
    messagingSenderId: "689602737235",
    appId: "1:689602737235:web:2659f1cb292de42cce82a6",
    measurementId: "G-1GCV051MCM"
};

// Deterministic app id used for Firestore paths. Prefers a window-provided `__app_id`.
const appId = (typeof window !== 'undefined' && window.__app_id) ? window.__app_id : 'tiaras-website';

// Admin UID (used by admin-only checks)
const ADMIN_UID = "5FA4SZNeMicQz0MC1waRTSUh0lB2";

// Allow an override of the firebase config via a global `__firebase_config` (stringified JSON).
const finalFirebaseConfig = (typeof __firebase_config !== 'undefined') ? JSON.parse(__firebase_config) : firebaseConfig;

// Initialize Firebase SDKs
const app = initializeApp(finalFirebaseConfig);
const auth = getAuth ? getAuth(app) : undefined;
const db = getFirestore ? getFirestore(app) : undefined;
const functionsSvc = getFunctions ? getFunctions(app, 'us-central1') : undefined;

// Module-scoped credit edit modal functions (ensure available to event handlers)
function openCreditEditModal(entityType, docId, name, currentDays, currentLimit) {
    try {
        let modal = document.getElementById('creditEditModal');
        if (!modal) {
            const tpl = `
            <div id="creditEditModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                <div class="bg-white p-6 rounded-md w-full max-w-md">
                    <h3 id="creditEditModalTitle" class="text-lg font-semibold mb-2">Edit Credit Settings</h3>
                    <form id="creditEditForm" class="space-y-3" aria-labelledby="creditEditModalTitle">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Name</label>
                            <div id="creditEditName" class="mt-1 text-sm text-gray-700"></div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Credit Days (Net)</label>
                                <input id="creditEditDays" type="number" min="0" step="1" class="w-full px-3 py-2 border rounded" />
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Credit Limit (₹)</label>
                                <input id="creditEditLimit" type="number" min="0" step="0.01" class="w-full px-3 py-2 border rounded" />
                            </div>
                        </div>
                        <div class="flex justify-end gap-2">
                            <button type="button" id="creditEditCancelBtn" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                            <button type="submit" id="creditEditSaveBtn" class="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
                        </div>
                    </form>
                </div>
            </div>`;
            const wrap = document.createElement('div'); wrap.innerHTML = tpl.trim(); document.body.appendChild(wrap.firstElementChild);
            modal = document.getElementById('creditEditModal');

            document.getElementById('creditEditCancelBtn')?.addEventListener('click', () => { closeCreditEditModal(); });

            document.getElementById('creditEditForm')?.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const saveBtn = document.getElementById('creditEditSaveBtn');
                const originalText = saveBtn ? saveBtn.textContent : '';
                try {
                    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
                    const daysRaw = (document.getElementById('creditEditDays')?.value || '').toString().trim();
                    const days = daysRaw === '' ? null : (parseInt(daysRaw, 10) || 0);
                    const limRaw = (document.getElementById('creditEditLimit')?.value || '').toString().trim();
                    const limit = limRaw === '' ? null : (parseFloat(limRaw.replace(/,/g, '')) || 0);
                    const colPath = (entityType === 'customers') ? customersColPath : suppliersColPath;
                    if (!docId) { showMessage('Unable to identify document to update.'); return; }
                    const payload = {};
                    if (days !== null) payload.creditDays = days;
                    if (limit !== null) payload.creditLimit = limit;
                    const clean = Object.fromEntries(Object.entries(payload).filter(([k,v]) => v !== undefined));
                    await updateDoc(doc(db, colPath, docId), clean);
                    try {
                        const arr = (entityType === 'customers') ? state.allCustomers : state.allSuppliers;
                        if (Array.isArray(arr)) {
                            const idx = arr.findIndex(x => x.id === docId);
                            if (idx >= 0) arr[idx] = { ...arr[idx], ...clean };
                        }
                    } catch (_) {}
                    showMessage('Credit settings saved.');
                    closeCreditEditModal();
                    try {
                        if (typeof renderAdminBillingSettings === 'function') renderAdminBillingSettings();
                        else if (typeof window !== 'undefined' && typeof window.renderAdminBillingSettings === 'function') window.renderAdminBillingSettings();
                        else renderAdminPage();
                    } catch (e) {
                        try { if (typeof window !== 'undefined' && typeof window.renderAdminBillingSettings === 'function') window.renderAdminBillingSettings(); } catch(_){}
                    }
                } catch (err) {
                    console.error('Failed to save credit settings', err);
                    showMessage('Failed to save credit settings.');
                } finally { try { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalText || 'Save'; } } catch(_){} }
            });
        }
        try { document.getElementById('creditEditName').textContent = name || ''; } catch(_) {}
        try { document.getElementById('creditEditDays').value = (currentDays || '') } catch(_) {}
        try { document.getElementById('creditEditLimit').value = (currentLimit || '') } catch(_) {}
        modal.classList.remove('hidden');
    } catch (err) { console.error('openCreditEditModal error', err); }
}

function renderAuditPage() {
    const container = document.getElementById('adminAuditContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-6">
            <h3 class="text-2xl font-bold mb-4">Invoice Reuse Audit</h3>
            <p class="text-sm text-gray-600 mb-4">Recent reused invoice events are listed below.</p>
            <div id="auditListContainer">Loading...</div>
        </div>
    `;

    (async () => {
        try {
            const col = collection(db, invoiceReusesColPath);
            const q = query(col, orderBy('createdAt', 'desc'), limit(50));
            const snap = await getDocs(q);
            const rows = [];
            snap.forEach(d => {
                const data = d.data() || {};
                rows.push({ id: d.id, ...data });
                        if (!modal) {
                            const tpl = `
                            <div id="creditEditModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                                <div class="bg-white p-6 rounded-md w-full max-w-md">
                                    <h3 id="creditEditModalTitle" class="text-lg font-semibold mb-2">Edit Credit Settings</h3>
                                    <form id="creditEditForm" class="space-y-3" aria-labelledby="creditEditModalTitle">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Name</label>
                                            <div id="creditEditName" class="mt-1 text-sm text-gray-700"></div>
                                        </div>
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700">Credit Days (Net)</label>
                                                <input id="creditEditDays" type="number" min="0" step="1" class="w-full px-3 py-2 border rounded" />
                                            </div>
                                            <div>
                                                <label class="block text-sm font-medium text-gray-700">Credit Limit (₹)</label>
                                                <input id="creditEditLimit" type="number" min="0" step="0.01" class="w-full px-3 py-2 border rounded" />
                                            </div>
                                        </div>
                                        <div class="flex justify-end gap-2">
                                            <button type="button" id="creditEditCancelBtn" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                                            <button type="submit" id="creditEditSaveBtn" class="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
                                        </div>
                                    </form>
                                </div>
                            </div>`;
                            const wrap = document.createElement('div'); wrap.innerHTML = tpl.trim(); document.body.appendChild(wrap.firstElementChild);
                            modal = document.getElementById('creditEditModal');
try { window.__recaptcha_site_key = window.__recaptcha_site_key || '6Le2VQosAAAAAE0SwHQdNBXHjaV8vKt1GScvokd0'; } catch(_){}

// If running on localhost, connect the client SDKs to the local emulator suite so
// the browser reads/writes the emulator data (siteSettings seeded in emulator).
// To force using production Firebase when serving locally, add ?useProd=1 to the URL
// or set `window.__use_production = true` before the app script runs.
let __tiaras_forceProd = false;
try {
    const host = window && window.location && (window.location.hostname || '');
    const urlParams = new URLSearchParams(window.location.search || '');
    // Allow forcing production via URL (?useProd) or a global/window override.
    // Also support a localStorage toggle so developers can persist the choice in their browser:
    //   localStorage.setItem('tiaras_useProd','1')  -> force production
    //   localStorage.removeItem('tiaras_useProd')  -> use emulator when on localhost
    const localForce = (typeof localStorage !== 'undefined' && localStorage.getItem('tiaras_useProd') === '1');
    __tiaras_forceProd = urlParams.has('useProd') || (typeof window.__use_production !== 'undefined' && window.__use_production === true) || localForce;
    if ((host === 'localhost' || host === '127.0.0.1') && !__tiaras_forceProd) {
        // If serving from localhost and developer has NOT forced production, connect to emulators.
        try { connectAuthEmulator(auth, 'http://127.0.0.1:9099'); } catch (e) { /* ignore if not available */ }
        try {
            if (typeof auth !== 'undefined') {
                try {
                    if (!auth.settings) auth.settings = {};
                    auth.settings.appVerificationDisabledForTesting = true;
                } catch (_e) {
                    try { auth.appVerificationDisabledForTesting = true; } catch (_) {}
                }
            }
        } catch(_) {}
        // Firestore emulator
        try { connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) { /* ignore */ }
        // Functions emulator
        try { connectFunctionsEmulator(functionsSvc, '127.0.0.1', 5001); } catch (e) { /* ignore */ }
        try { console && console.info && console.info('Connected SDKs to local emulators (localhost)'); } catch (_) {}
    } else {
        // Use production Firebase services when either not localhost or when the developer forces production
        try { console && console.info && console.info('Using production Firebase services'); } catch (e) {}
    }

    // Modal for editing credit days / credit limit
    function openCreditEditModal(entityType, docId, name, currentDays, currentLimit) {
        try {
            let modal = document.getElementById('creditEditModal');
            if (!modal) {
                const tpl = `
                <div id="creditEditModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                    <div class="bg-white p-6 rounded-md w-full max-w-md">
                        <h3 id="creditEditModalTitle" class="text-lg font-semibold mb-2">Edit Credit Settings</h3>
                        <form id="creditEditForm" class="space-y-3" aria-labelledby="creditEditModalTitle">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Name</label>
                                <div id="creditEditName" class="mt-1 text-sm text-gray-700"></div>
                            </div>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Credit Days (Net)</label>
                                    <input id="creditEditDays" type="number" min="0" step="1" class="w-full px-3 py-2 border rounded" />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Credit Limit (₹)</label>
                                    <input id="creditEditLimit" type="number" min="0" step="0.01" class="w-full px-3 py-2 border rounded" />
                                </div>
                            </div>
                            <div class="flex justify-end gap-2">
                                <button type="button" id="creditEditCancelBtn" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                                <button type="submit" id="creditEditSaveBtn" class="px-3 py-2 bg-blue-600 text-white rounded">Save</button>
                            </div>
                        </form>
                    </div>
                </div>`;
                const wrap = document.createElement('div'); wrap.innerHTML = tpl.trim(); document.body.appendChild(wrap.firstElementChild);
                modal = document.getElementById('creditEditModal');

                document.getElementById('creditEditCancelBtn')?.addEventListener('click', () => { closeCreditEditModal(); });

                document.getElementById('creditEditForm')?.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const saveBtn = document.getElementById('creditEditSaveBtn');
                    const originalText = saveBtn ? saveBtn.textContent : '';
                    try {
                        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
                        const daysRaw = (document.getElementById('creditEditDays')?.value || '').toString().trim();
                        const days = daysRaw === '' ? null : (parseInt(daysRaw, 10) || 0);
                        const limRaw = (document.getElementById('creditEditLimit')?.value || '').toString().trim();
                        const limit = limRaw === '' ? null : (parseFloat(limRaw.replace(/,/g, '')) || 0);
                        const colPath = (entityType === 'customers') ? customersColPath : suppliersColPath;
                        if (!docId) {
                            showMessage('Unable to identify document to update.');
                            return;
                        }
                        const payload = {};
                        if (days !== null) payload.creditDays = days;
                        else payload.creditDays = deleteFieldIfEmpty();
                        if (limit !== null) payload.creditLimit = limit;
                        else payload.creditLimit = deleteFieldIfEmpty();
                        // Clean undefined
                        const clean = Object.fromEntries(Object.entries(payload).filter(([k,v]) => v !== undefined));
                        await updateDoc(doc(db, colPath, docId), clean);
                        // Update local state copy
                        try {
                            const arr = (entityType === 'customers') ? state.allCustomers : state.allSuppliers;
                            if (Array.isArray(arr)) {
                                state = state || {};
                                const idx = arr.findIndex(x => x.id === docId);
                                if (idx >= 0) {
                                    arr[idx] = { ...arr[idx], ...clean };
                                }
                            }
                        } catch (_) {}
                        showMessage('Credit settings saved.');
                        closeCreditEditModal();
                        try {
                            if (typeof renderAdminBillingSettings === 'function') renderAdminBillingSettings();
                            else if (typeof window !== 'undefined' && typeof window.renderAdminBillingSettings === 'function') window.renderAdminBillingSettings();
                            else renderAdminPage();
                        } catch (e) {
                            try { if (typeof window !== 'undefined' && typeof window.renderAdminBillingSettings === 'function') window.renderAdminBillingSettings(); } catch(_){}
                        }
                    } catch (err) {
                        console.error('Failed to save credit settings', err);
                        showMessage('Failed to save credit settings.');
                    } finally {
                        try { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = originalText || 'Save'; } } catch(_){}
                    }
                });
            }
            // populate and show
            try { document.getElementById('creditEditName').textContent = name || ''; } catch(_) {}
            try { document.getElementById('creditEditDays').value = (currentDays || '') } catch(_) {}
            try { document.getElementById('creditEditLimit').value = (currentLimit || '') } catch(_) {}
            modal.classList.remove('hidden');
        } catch (err) { console.error('openCreditEditModal error', err); }
    }

    function closeCreditEditModal() { try { const m = document.getElementById('creditEditModal'); if (!m) return; m.classList.add('hidden'); } catch(_) {} }
} catch (e) { /* ignore in environments without window */ }

// --- DOM ELEMENTS ---
const pageContent = document.getElementById('pageContent');
const mainHeader = document.getElementById('main-header');
const mainFooter = document.getElementById('main-footer');
const topBarsContainer = document.getElementById('top-bars-container');

// --- APP STATE ---
// Compute financial year start (assumes FY starts on April 1st)
function getFinancialYearStart(d) {
    try {
        const dt = d ? new Date(d) : new Date();
        const year = dt.getFullYear();
        // If month >= April (3), FY started this calendar year on Apr 1
        // months are 0-indexed: Apr is 3
        const fyStartYear = (dt.getMonth() >= 3) ? year : (year - 1);
        const start = new Date(fyStartYear, 3, 1); // Apr 1
        return start.toISOString().split('T')[0];
    } catch (e) { return new Date().toISOString().split('T')[0]; }
}

const _defaultLedgerStart = getFinancialYearStart(new Date());

let state = {
    currentPage: 'home',
    currentProductId: null,
    currentOrderId: null,
    currentGroup: null,
    products: [],
    productGroups: [],
    heroSlides: [],
    galleryImages: [],
    testimonials: [],
    allTestimonials: [],
    allPurchases: [],
    allLocalSales: [],
    allSalesReturns: [],
    allPurchaseReturns: [],
    allCreditorsLedger: [],
    allDebtorsLedger: [],
    siteSettings: {
        isScrollingBarVisible: true,
        scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
        isGstEnabled: true,
        merchantGstin: '29ABCDE1234F1Z5',
        merchantStateCode: '29',
        businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542',
        visibilityEpochs: {},
    },
    cart: { items: {} },
    userProfile: null,
    orders: [],
    allOrders: [],
    adminCurrentTab: 'orders',
    localSaleData: null,
    registerFilter: 'all',
    registerStartDate: new Date().toISOString().split('T')[0],
    registerEndDate: new Date().toISOString().split('T')[0],
    billingStartDate: new Date().toISOString().split('T')[0],
    billingEndDate: new Date().toISOString().split('T')[0],
    billingSearchText: '',
    ledgerStartDate: _defaultLedgerStart,
    ledgerStartUseToday: false,
    ledgerEndDate: new Date().toISOString().split('T')[0],
    bankAccountFilter: 'All',
    bankEditingId: null,
    ledgerPageSize: 25,
    cashPage: 1,
    bankPage: 1,
    creditorsPage: 1,
    debtorsPage: 1,
    cashPageSize: 10,
    bankPageSize: 10,
    creditorsPageSize: 10,
    debtorsPageSize: 10,
    registerPage: 1,
    registerPageSize: 25,
    inventoryPage: 1,
    inventoryPageSize: 10,
    billingPage: 1,
    billingPageSize: 25,
    currentUser: null,
    adminOrderFilter: 'All',
    ordersStartDate: new Date().toISOString().split('T')[0],
    ordersEndDate: new Date().toISOString().split('T')[0],
    ordersUseToday: true,
    ordersPage: 1,
    ordersPageSize: 10,
    reportsIncludeArchived: false,
    reportData: { orders: [], purchases: [], localSales: [], salesReturns: [], purchaseReturns: [], lastRange: null },
    listeners: {
        cart: null,
        products: null,
        productGroups: null,
        heroSlides: null,
        orders: null,
        allOrders: null,
        galleryImages: null,
        siteSettings: null,
        testimonials: null,
        allTestimonials: null,
        allPurchases: null,
        allLocalSales: null,
        allSalesReturns: null,
        allPurchaseReturns: null,
        allCreditorsLedger: null,
        allDebtorsLedger: null,
        allCashLedger: null,
        allBankLedger: null,
        allBanks: null,
        allSuppliers: null,
        allCustomers: null,
        profile: null,
    },
    userOrderPublicUnsubs: {},
    isAdmin: false,
    adminListenersActive: false
};
// Whether time pickers are unlocked (always enabled now)
state.timePickerUnlocked = true;
// Sorting state for ledger tables (default: newest first)
state.cashSort = { key: 'date', dir: 'desc' };
state.bankSort = { key: 'date', dir: 'desc' };

// Pending retry hook: when a purchase save is blocked because supplier is missing data,
// we open the supplier edit modal and set `pendingPurchaseRetryFn` so that after the
// supplier is saved the original purchase save is retried automatically.
let pendingPurchaseRetryFn = null;

// Load persisted per-pane page-size preferences (scoped by appId)
try {
    const _ls = window.localStorage;
    const loadSize = (key, fallback) => {
        try { const v = parseInt(_ls.getItem(`tiaras.ledger.${key}PageSize_${appId}`), 10); return (v && [10,25,50].includes(v)) ? v : fallback; } catch (e) { return fallback; }
    };
    state.cashPageSize = loadSize('cash', state.cashPageSize || state.ledgerPageSize || 10);
    state.bankPageSize = loadSize('bank', state.bankPageSize || state.ledgerPageSize || 10);
    state.creditorsPageSize = loadSize('creditors', state.creditorsPageSize || state.ledgerPageSize || 10);
    state.debtorsPageSize = loadSize('debtors', state.debtorsPageSize || state.ledgerPageSize || 10);
} catch (e) { /* ignore localStorage failures */ }

// DEV-ONLY: quick preview mode — allow opening the admin UI without auth by adding `?admin` to the URL.
// This is intended for local development/testing only and should be removed before production.
try {
    const _params = new URLSearchParams(window.location.search || '');
    if (_params.has('admin')) {
        state.isAdmin = true;
        state.currentPage = 'admin';
        // Use the visible tab key so preview shows the Transactions tab
        state.adminCurrentTab = 'transactions';
    }
} catch (e) { /* ignore */ }
// --- ADMIN HELPERS ---
function normalizeList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
        return input
            .map(v => (typeof v === 'string' ? v.trim() : String(v || '').trim()))
            .filter(Boolean);
    }
    if (typeof input === 'string') {
        return input
            .split(/[\s,;]+/)
            .map(v => v.trim())
            .filter(Boolean);
    }
    return [];
}

// Attach mobile number validation to an input element.
// Behavior:
// - Strip non-digit characters while typing.
// - While length < 10: neutral (no border color).
// - When length == 10 and all digits: green border, aria-invalid=false.
// - When length > 10 or not digits: red border, aria-invalid=true and show feedback (if provided).
function attachMobileValidation(el, feedbackEl) {
    if (!el) return;
    const run = () => {
        try {
            let v = (el.value || '').toString();
            // Keep only digits
            const digits = v.replace(/\D/g, '');
            if (digits !== v) {
                // Update value preserving cursor would be more complex; simple replace is acceptable here.
                el.value = digits;
            }
            const len = digits.length;
            if (!digits) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.remove('tiaras-invalid'); el.removeAttribute && el.removeAttribute('aria-invalid'); } catch(_) {}
                return;
            }
            if (len < 10) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.remove('tiaras-invalid'); el.removeAttribute && el.removeAttribute('aria-invalid'); } catch(_) {}
                return;
            }
            // len >= 10
            if (len === 10) {
                // valid
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-invalid'); el.classList.add('tiaras-valid'); el.setAttribute && el.setAttribute('aria-invalid', 'false'); } catch(_) {}
            } else {
                // too long
                if (feedbackEl) { try { feedbackEl.classList.remove('hidden'); feedbackEl.textContent = 'Mobile number must be exactly 10 digits.'; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.add('tiaras-invalid'); el.setAttribute && el.setAttribute('aria-invalid', 'true'); } catch(_) {}
            }
        } catch (_) {}
    };
    const handler = () => { try { run(); } catch(_) {} };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', handler);
    // initialize
    try { run(); } catch(_) {}
}

// Attach PIN input behavior: allow digits only, enforce maxlength 6, show red while typing (<6), green when exactly 6
function attachPinBehavior(el, feedbackEl) {
    if (!el) return;
    const run = () => {
        try {
            let v = (el.value || '').toString();
            // keep only digits
            let digits = v.replace(/\D/g, '');
            // trim to max 6
            if (digits.length > 6) digits = digits.substring(0,6);
            if (digits !== v) el.value = digits;
            const len = digits.length;
            if (!digits) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.remove('tiaras-invalid'); el.removeAttribute && el.removeAttribute('aria-invalid'); } catch(_) {}
                return;
            }
            // while typing (<6) show invalid (red)
            if (len > 0 && len < 6) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.add('tiaras-invalid'); el.setAttribute && el.setAttribute('aria-invalid','true'); } catch(_) {}
                return;
            }
            if (len === 6) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-invalid'); el.classList.add('tiaras-valid'); el.setAttribute && el.setAttribute('aria-invalid','false'); } catch(_) {}
            }
        } catch (_) {}
    };
    const onInput = (e) => { try { run(); } catch(_) {} };
    const onKeyDown = (e) => {
        // allow control keys
        const allowed = ['Backspace','ArrowLeft','ArrowRight','Delete','Tab'];
        if (allowed.includes(e.key)) return;
        // allow digits only
        if (!/^[0-9]$/.test(e.key)) {
            e.preventDefault();
        }
    };
    const onPaste = (e) => {
        try {
            const text = (e.clipboardData && e.clipboardData.getData) ? e.clipboardData.getData('text') : (window.clipboardData ? window.clipboardData.getData('Text') : '');
            const digits = (text || '').replace(/\D/g, '').substring(0,6);
            if (digits) {
                e.preventDefault();
                const cur = el.value || '';
                // insert digits at cursor position would be complex; replace whole value
                el.value = digits;
                try { run(); } catch(_) {}
            }
        } catch(_) {}
    };
    el.addEventListener('input', onInput);
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('paste', onPaste);
    el.addEventListener('blur', onInput);
    // initialize
    try { run(); } catch(_) {}
}

// Simple email validation helper: toggles classes and feedback
function attachEmailValidation(el, feedbackEl) {
    if (!el) return;
    const isEmail = (v) => {
        if (!v) return false;
        // simple but practical email check
        return /^\S+@\S+\.\S+$/.test(v.trim());
    };
    const run = () => {
        try {
            const v = (el.value || '').toString().trim();
            if (!v) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.remove('tiaras-invalid'); el.removeAttribute && el.removeAttribute('aria-invalid'); } catch(_) {}
                return;
            }
            if (isEmail(v)) {
                if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                try { el.classList.remove('tiaras-invalid'); el.classList.add('tiaras-valid'); el.setAttribute && el.setAttribute('aria-invalid','false'); } catch(_) {}
            } else {
                if (feedbackEl) { try { feedbackEl.classList.remove('hidden'); feedbackEl.textContent = 'Enter a valid email address.'; } catch(_) {} }
                try { el.classList.remove('tiaras-valid'); el.classList.add('tiaras-invalid'); el.setAttribute && el.setAttribute('aria-invalid','true'); } catch(_) {}
            }
        } catch(_) {}
    };
    const handler = () => { try { run(); } catch(_) {} };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
    el.addEventListener('blur', handler);
    try { run(); } catch(_) {}
}

// Capitalize first letter of a name input while preserving the rest
function attachNameCapitalization(el) {
    if (!el) return;
    const toTitle = (s) => {
        s = (s || '').toString().trim().replace(/\s+/g, ' ');
        if (!s) return '';
        return s.split(' ').map(w => {
            if (!w) return '';
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    };
    const normalize = () => {
        try { el.value = toTitle(el.value); } catch(_) {}
    };
    el.addEventListener('blur', normalize);
    el.addEventListener('change', normalize);
    // On input, capitalize letters at start and after spaces as user types
    el.addEventListener('input', () => {
        try {
            const v = (el.value || '').toString();
            if (!v) return;
            // Uppercase first char and any char after whitespace
            const updated = v.replace(/(^|\s)([a-z])/g, (m, p, c) => p + c.toUpperCase());
            // Do not aggressively collapse spaces on input; keep user's spacing until blur
            if (updated !== v) el.value = updated;
        } catch(_) {}
    });
}

function getAllowedAdminUids() {
    const settings = state.siteSettings || {};
    const configured = [
        ...normalizeList(settings.adminUid),
        ...normalizeList(settings.adminUids)
    ];
    const unique = new Set([ADMIN_UID, ...configured]);
    return Array.from(unique).filter(Boolean);
}

function getAllowedAdminEmails() {
    const settings = state.siteSettings || {};
    const configured = [
        ...normalizeList(settings.adminEmail),
        ...normalizeList(settings.adminEmails)
    ];
    return configured.map(e => e.toLowerCase());
}

function computeIsCurrentUserAdmin() {
    const uid = state.currentUser && state.currentUser.uid;
    if (!uid) return false;
    if (getAllowedAdminUids().includes(uid)) return true;

    const email = (state.currentUser.email || '').toLowerCase();
    if (!email) return false;
    const allowedEmails = getAllowedAdminEmails();
    return allowedEmails.includes(email);
}

function detachAdminListeners() {
    const adminKeys = [
        'allOrders',
        'allTestimonials',
        'allPurchases',
        'allLocalSales',
        'allSalesReturns',
        'allPurchaseReturns',
        'allCreditorsLedger',
        'allDebtorsLedger',
        'allCashLedger',
        'allBankLedger'
    ];
    adminKeys.forEach(key => {
        if (state.listeners[key]) {
            try { state.listeners[key](); } catch {}
            state.listeners[key] = null;
        }
    });
    state.adminListenersActive = false;
    state.allOrders = [];
    state.allTestimonials = [];
    state.allPurchases = [];
    state.allLocalSales = [];
    state.allSalesReturns = [];
    state.allPurchaseReturns = [];
    state.allCreditorsLedger = [];
    state.allDebtorsLedger = [];
    state.allCashLedger = [];
    state.allBankLedger = [];
}

function ensureAdminListenersAttached() {
    const canAttach = state.currentUser && !state.currentUser.isAnonymous && state.isAdmin;
    if (!canAttach) {
        if (state.adminListenersActive) detachAdminListeners();
        return;
    }
    // Attach admin listeners once when admin privileges are present
    if (state.adminListenersActive) return;
    try {
        document.body.addEventListener('click', async (ev) => {
            // Edit handler
            const editBtn = ev.target && ev.target.closest ? ev.target.closest('.edit-bank-btn') : ev.target;
            if (editBtn && editBtn.classList && editBtn.classList.contains('edit-bank-btn')) {
                ev.preventDefault();
                const id = editBtn.dataset && editBtn.dataset.id;
                if (!id) return;
                // populate form with bank data and switch to edit mode
                const bank = (state.allBanks || []).find(b => b.id === id);
                if (!bank) return;
                try {
                    document.getElementById('bankName').value = bank.name || '';
                    document.getElementById('bankAccountNumber').value = bank.accountNumber || '';
                    document.getElementById('bankIfsc').value = bank.ifsc || '';
                    document.getElementById('bankAddress').value = bank.address || '';
                    document.getElementById('bankNotes').value = bank.notes || '';
                    state.bankEditingId = id;
                    const submitBtn = document.getElementById('bankMasterSubmitBtn');
                    if (submitBtn) submitBtn.textContent = 'Save Changes';
                    try { document.getElementById('bankMasterCancelBtn').style.display = 'inline-block'; } catch(_){ }
                    // focus account number for quick editing
                    try { document.getElementById('bankAccountNumber').focus(); } catch(_){ }
                } catch (err) { console.error('Failed to start editing bank', err); }
                return;
            }

            const btn = ev.target && ev.target.closest ? ev.target.closest('.delete-bank-btn') : ev.target;
            if (!btn) return;
            const id = btn.dataset && btn.dataset.id;
            if (!id) return;
            if (!confirm('Delete this bank account? This cannot be undone.')) return;
            try {
                // Require master password before allowing a destructive delete
                const allowed = await verifyMasterPassword('delete this bank account');
                if (!allowed) return;
                btn.disabled = true;
                await deleteDoc(doc(db, banksColPath, id));
                // optimistic UI: remove from state immediately
                state.allBanks = (state.allBanks || []).filter(b => b.id !== id);
                // re-render admin area so Billing Settings updates
                renderAdminPage();
                showMessage('Bank account deleted.');
            } catch (err) {
                console.error('Failed to delete bank account', err);
                showMessage('Failed to delete bank account.');
            } finally {
                try { btn.disabled = false; } catch(_){ }
            }
        });
        state.adminListenersActive = true;
        // Attach admin-level data listeners so admin tabs (Orders, Purchases, Testimonials, Local Sales, Ledgers) are populated
        try {
            // These are idempotent: each listener implementation will unsubscribe any existing one before reattaching where appropriate
            if (typeof listenToAllOrders === 'function') listenToAllOrders();
            if (typeof listenToAllTestimonials === 'function') listenToAllTestimonials();
            if (typeof listenToAllPurchases === 'function') listenToAllPurchases();
            if (typeof listenToAllLocalSales === 'function') listenToAllLocalSales();
            if (typeof listenToAllSalesReturns === 'function') listenToAllSalesReturns();
            if (typeof listenToAllPurchaseReturns === 'function') listenToAllPurchaseReturns();
            if (typeof listenToAllCreditorsLedger === 'function') listenToAllCreditorsLedger();
            if (typeof listenToAllDebtorsLedger === 'function') listenToAllDebtorsLedger();
            if (typeof listenToAllCashLedger === 'function') listenToAllCashLedger();
            if (typeof listenToAllBankLedger === 'function') listenToAllBankLedger();
        } catch (e) {
            console.warn('Failed to attach some admin listeners:', e?.message || e);
        }
    } catch (_) {}
}

// Recompute and apply admin state: attach/detach listeners as needed
function refreshAdminState() {
    const previous = !!state.isAdmin;
    // Compute real admin status, but allow a local preview override via ?admin in the URL
    let next = computeIsCurrentUserAdmin();
    try {
        const _p = new URLSearchParams(window.location.search || '');
        if (_p.has('admin')) next = true;
    } catch (e) { /* ignore */ }
    state.isAdmin = next;
    if (!next && previous) {
        detachAdminListeners();
    }
    if (next) {
        ensureAdminListenersAttached();
    }
    // Re-render header so admin icon appears/disappears
    try { renderHeader(); } catch (_) {}
    return next;
}
// Expose for legacy callers / console debugging
try { window.refreshAdminState = refreshAdminState; } catch (_) {}

// --- DATE HELPERS ---
function _toDate(input) {
    if (!input) return null;
    if (input instanceof Date) return input;
    if (typeof input === 'object' && typeof input.seconds === 'number') {
        return new Date(input.seconds * 1000);
    }
    // Fallback: try to construct
    const d = new Date(input);
    return isNaN(d) ? null : d;
}

function formatDate(input) {
    const d = _toDate(input);
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatDateTime(input) {
    const d = _toDate(input);
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function parseDateTimeFromInputs(dateId, timeId) {
    try {
        const dateVal = (document.getElementById(dateId)?.value || '').toString().trim();
        const timeVal = (timeId && document.getElementById(timeId)) ? (document.getElementById(timeId).value || '').toString().trim() : '';
        if (dateVal && timeVal) {
            // Construct ISO datetime string
            const iso = `${dateVal}T${timeVal}:00`;
            const d = new Date(iso);
            if (!isNaN(d)) return d;
        }
        if (dateVal) {
            const d = new Date(dateVal);
            if (!isNaN(d)) return d;
        }
    } catch (e) { /* ignore */ }
    return new Date();
}

// Combine a date input (YYYY-MM-DD) with the current local time and return a Date
function parseDateWithNow(dateId) {
    try {
        const dateVal = (document.getElementById(dateId)?.value || '').toString().trim();
        if (!dateVal) return new Date();
        const now = new Date();
        // Use the date part from dateVal and the current time from now (include seconds)
        const iso = `${dateVal}T${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        const d = new Date(iso);
        if (!isNaN(d)) return d;
        return new Date(dateVal);
    } catch (_) { return new Date(); }
}

// Start a minute-ticker that refreshes posting time displays on the page.
function startPostingTimeTicker() {
    try {
        // Clear existing ticker if any to avoid duplicates on re-render
        try { if (state._postingTimeTickerId) { clearInterval(state._postingTimeTickerId); state._postingTimeTickerId = null; } } catch(_) {}
        const update = () => {
            try {
                const hhmmss = getLocalTimeHHMMSS();
                ['spTimeDisplay','crTimeDisplay','tTimeDisplay','ledgerEntryTimeDisplay'].forEach(id => {
                    try { const el = document.getElementById(id); if (el) el.textContent = `Posting time: ${hhmmss}`; } catch(_) {}
                });
            } catch(_) {}
        };
        // Run immediately
        update();
        // Align the first tick to the next second boundary, then run every 1s to reflect system time
        try {
            const now = new Date();
            const msToNextSecond = 1000 - now.getMilliseconds();
            setTimeout(() => {
                try { update(); state._postingTimeTickerId = setInterval(update, 1000); } catch(_) {}
            }, msToNextSecond);
        } catch (_) {
            state._postingTimeTickerId = setInterval(update, 1000);
        }
    } catch (_) {}
}

function getLocalTimeHHMM() {
    try {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    } catch (_) { return '00:00'; }
}

// Return local time with seconds (HH:MM:SS)
function getLocalTimeHHMMSS() {
    try {
        const d = new Date();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    } catch (_) { return '00:00:00'; }
}

// Show one quick-posting form and hide the others. Scroll it into view.
function showQuickPostingForm(formId) {
    try {
        ['supplierPaymentForm','customerReceiptForm','cashBankTransferForm'].forEach(id => {
            try {
                const el = document.getElementById(id);
                if (!el) return;
                if (id === formId) el.classList.remove('hidden'); else el.classList.add('hidden');
            } catch(_) {}
        });
        const target = document.getElementById(formId);
        if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
            // focus first input inside the shown form
            const t = document.getElementById(formId);
            if (t) {
                const focusEl = t.querySelector('input:not([type="hidden"]), select, textarea, button');
                try { if (focusEl && typeof focusEl.focus === 'function') focusEl.focus(); } catch(_){}
            }
            // update aria-pressed state on buttons
            try {
                const btnMap = { supplierPaymentForm: 'quickPostingBtnSp', customerReceiptForm: 'quickPostingBtnCr', cashBankTransferForm: 'quickPostingBtnT' };
                Object.keys(btnMap).forEach(fid => {
                    try { const b = document.getElementById(btnMap[fid]); if (!b) return; b.setAttribute('aria-pressed', fid === formId ? 'true' : 'false'); } catch(_){}
                });
            } catch(_){}
        } catch(_) {}
    } catch (_) {}
}

// Open modal by id with focus trapping and restore on close
function openModalById(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        // set ARIA visible
        try { modal.setAttribute('aria-hidden', 'false'); } catch(_){}
        // remember previous active element
        try { modal._previousActive = document.activeElement; } catch(_){}
        // show
        modal.classList.remove('hidden');
        // find focusable elements
        const focusable = Array.from(modal.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled])'));
        const first = focusable[0] || modal;
        try { first.focus(); } catch(_){}
        // trap keyboard inside modal
        const trap = (e) => {
            try {
                if (e.key === 'Escape') { e.preventDefault(); closeModalById(modalId); return; }
                if (e.key === 'Tab') {
                    const f = focusable.length ? focusable : Array.from(modal.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled])'));
                    if (!f.length) return;
                    const firstEl = f[0];
                    const lastEl = f[f.length - 1];
                    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
                    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
                }
            } catch(_){}
        };
        modal._trapHandler = trap;
        document.addEventListener('keydown', trap);
    } catch (_) {}
}

// Close modal by id and cleanup trap + restore focus
function closeModalById(modalId) {
    try {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        modal.classList.add('hidden');
        try { modal.setAttribute('aria-hidden', 'true'); } catch(_){}
        try { if (modal._trapHandler) document.removeEventListener('keydown', modal._trapHandler); } catch(_){}
        try { if (modal._previousActive && typeof modal._previousActive.focus === 'function') modal._previousActive.focus(); } catch(_){}
    } catch(_){}
}
try { window.openModalById = openModalById; window.closeModalById = closeModalById; } catch(_){}
// Expose to global scope so inline `onclick` handlers can call it when this file is loaded as a module
try { window.showQuickPostingForm = showQuickPostingForm; } catch (_) {}

function enableTimePickers(enabled) {
    try {
        state.timePickerUnlocked = !!enabled;
        const ids = ['ledgerEntryTimeDisplay','cashObTime','bankObTime','spTime','crTime','tTime'];
        ids.forEach(id => {
            try {
                const el = document.getElementById(id);
                if (!el) return;
                el.disabled = !enabled;
            } catch (_) {}
        });
        // Update toggle button text if present
        const btn = document.getElementById('toggleTimeEntryBtn');
        if (btn) btn.textContent = enabled ? 'Disable Time Entry' : 'Enable Time Entry';
    } catch (_) {}
}

// GST helpers are imported from src/gst.js (computeGstForItems, getStateCodeFromGstin, GSTIN_REGEX, attachGstinValidation)

// Ensure text inputs intended for GSTIN are forced to uppercase while preserving caret position
function enforceUppercaseInput(el) {
    try {
        if (!el) return;
        const handler = (e) => {
            try {
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const val = (el.value || '').toUpperCase();
                if (el.value !== val) el.value = val;
                // restore selection where possible
                if (typeof start === 'number' && typeof end === 'number') {
                    try { el.setSelectionRange(start, end); } catch (_) {}
                }
            } catch (_) {}
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        el.addEventListener('paste', () => setTimeout(handler, 0));
    } catch (_) {}
}

// Ensure text inputs intended for emails are forced to lowercase while preserving caret position
function enforceLowercaseInput(el) {
    try {
        if (!el) return;
        const handler = (e) => {
            try {
                const start = el.selectionStart;
                const end = el.selectionEnd;
                const val = (el.value || '').toLowerCase();
                if (el.value !== val) el.value = val;
                if (typeof start === 'number' && typeof end === 'number') {
                    try { el.setSelectionRange(start, end); } catch (_) {}
                }
            } catch (_) {}
        };
        el.addEventListener('input', handler);
        el.addEventListener('change', handler);
        el.addEventListener('paste', () => setTimeout(handler, 0));
    } catch (_) {}
}

// --- ROUTING & NAVIGATION ---
function navigateTo(page, id = null, category = null, group = null) {
    state.currentPage = page;
    state.currentProductId = page === 'product_detail' ? id : null;
    state.currentOrderId = (page === 'order_success' || page === 'invoice' || page === 'purchase_invoice' || page === 'local_sale_invoice') ? id : null;
    state.currentCategory = page === 'products' ? category : null;
    state.currentGroup = page === 'products' ? group : null;
    window.scrollTo(0, 0);
    // Safety: ensure product detail renderer exists before attempting to render
    if (page === 'product_detail' && typeof renderProductDetailPage !== 'function') {
        try {
            if (typeof window !== 'undefined' && typeof window.renderProductDetailPage === 'function') {
                renderProductDetailPage = window.renderProductDetailPage.bind(window);
            }
        } catch (e) { /* ignore */ }
        if (typeof renderProductDetailPage !== 'function') {
            // provide a minimal fallback to avoid ReferenceError in older/cached bundles
            renderProductDetailPage = function () {
                pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"><p class="text-lg">Loading product details...</p></div>`;
            };
        }
    }
    renderApp();
}

// --- RENDER FUNCTIONS ---
// Define a module-scoped `renderCheckoutPage` so it's available to `renderApp()` regardless
// of whether an inline/global function was provided in index.html. We prefer any global
// `window.renderCheckoutPage` if present (legacy), otherwise use the built-in implementation.
let renderCheckoutPage;
try {
    if (typeof window !== 'undefined' && typeof window.renderCheckoutPage === 'function') {
        renderCheckoutPage = window.renderCheckoutPage.bind(window);
    }
} catch (e) { /* ignore */ }
if (typeof renderCheckoutPage !== 'function') {
    renderCheckoutPage = function () {
        console.info('renderCheckoutPage: using app.js fallback implementation');
        const cartProductIds = Object.keys((state.cart && state.cart.items) || {});
        if (cartProductIds.length === 0) {
            navigateTo('products');
            return;
        }

        let subtotal = 0;
        const orderItemsHTML = state.products
            .filter(p => cartProductIds.includes(p.id))
            .map(product => {
                const quantity = state.cart.items[product.id].quantity;
                const itemTotal = product.salePrice * quantity;
                subtotal += itemTotal;
                return `<div class="flex justify-between items-center py-3"><div class="flex items-center space-x-4"><img src="${product.image}" class="w-16 h-16 object-cover rounded-md"><div><p class="font-semibold">${product.name}</p><p class="text-sm text-gray-500">Qty: ${quantity}</p></div></div><p class="font-medium">${itemTotal.toFixed(2)}</p></div>`;
            }).join('');

        const shipping = 50.00;
            const gstBreakdown = {};
        if (state.siteSettings && state.siteSettings.isGstEnabled) {
            state.products.filter(p => cartProductIds.includes(p.id)).forEach(product => {
                const gstRate = product.gstPercentage || 0;
                if (gstRate > 0) {
                    if (!gstBreakdown[gstRate]) gstBreakdown[gstRate] = 0;
                    const quantity = state.cart.items[product.id].quantity;
                    gstBreakdown[gstRate] += product.salePrice * quantity * (gstRate / 100);
                }
            });
        }
        const totalGst = Object.values(gstBreakdown).reduce((sum, amount) => sum + amount, 0);
        const total = subtotal + totalGst + shipping;

    pageContent.innerHTML = `<div class="bg-gray-50"><div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16"><h1 class="text-4xl font-playfair text-center mb-12">Checkout</h1><div class="grid grid-cols-1 lg:grid-cols-2 gap-16"><div><h2 class="text-2xl font-semibold mb-6">Shipping Information</h2><form id="checkoutForm" class="space-y-4"><div><label for="fullName" class="block text-sm font-medium text-gray-700">Full Name</label><input type="text" id="fullName" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div><div><label for="phone" class="block text-sm font-medium text-gray-700">Mobile Number</label><input type="tel" id="phone" required placeholder="10-digit mobile number" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div><div><label for="address" class="block text-sm font-medium text-gray-700">Address</label><input type="text" id="address" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div><div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div><label for="city" class="block text-sm font-medium text-gray-700">City</label><input type="text" id="city" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div><div><label for="state" class="block text-sm font-medium text-gray-700">State</label><input type="text" id="state" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div><div><label for="zip" class="block text-sm font-medium text-gray-700">ZIP Code</label><input type="text" id="zip" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"></div></div><div class="pt-4 ${state.siteSettings && state.siteSettings.isGstEnabled ? '' : 'hidden'}"><label class="flex items-center"><input type="checkbox" id="requestGstInvoice" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"><span class="ml-2 text-sm text-gray-700">I need a GST invoice</span></label></div><div id="gstNumberContainer" class="hidden mt-4"><label for="gstNumber" class="block text-sm font-medium text-gray-700">GST Number</label><input type="text" id="gstNumber" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border" placeholder="e.g., 29ABCDE1234F1Z5"></div><div class="mt-4"><label class="inline-flex items-center"><input type="checkbox" id="saveAsDefaultAddress" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"><span class="ml-2 text-sm text-gray-700">Save as default shipping address</span></label></div><div class="pt-8"><button type="submit" class="w-full bg-black text-white font-semibold py-4 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Place Order</button></div></form></div><div class="bg-white p-8 rounded-lg shadow-sm h-fit"><h2 class="text-2xl font-semibold mb-6">Order Summary</h2><div class="space-y-3 divide-y">${orderItemsHTML}</div><div class="border-t mt-6 pt-6 space-y-3"><div class="flex justify-between"><span>Subtotal (₹)</span><span>${subtotal.toFixed(2)}</span></div> ${Object.keys(gstBreakdown).map(rate => `<div class="flex justify-between"><span>GST (${rate}%) (₹)</span><span>${gstBreakdown[rate].toFixed(2)}</span></div>`).join('')} <div class="flex justify-between"><span>Shipping (₹)</span><span>${shipping.toFixed(2)}</span></div><div class="flex justify-between font-bold text-lg"><span>Total (₹)</span><span>${total.toFixed(2)}</span></div></div></div></div></div>`;
    };
}
// Ensure `renderOrderSuccessPage` is available in module scope. Prefer a global implementation
// (legacy inline in `index.html`) when present, otherwise provide a fallback here.
let renderOrderSuccessPage;
try {
    if (typeof window !== 'undefined' && typeof window.renderOrderSuccessPage === 'function') {
        renderOrderSuccessPage = window.renderOrderSuccessPage.bind(window);
    }
} catch (e) { /* ignore */ }
if (typeof renderOrderSuccessPage !== 'function') {
    renderOrderSuccessPage = function () {
        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"><div class="bg-green-100 text-green-800 p-6 rounded-lg max-w-md mx-auto mb-8"><i class="fas fa-check-circle fa-3x"></i></div><h1 class="text-4xl font-playfair mb-4">Thank You For Your Order!</h1><p class="text-gray-600 mb-2">Your order has been placed successfully.</p><p class="text-gray-800 font-semibold mb-8">Order ID: <span class="font-mono">${state.currentOrderId || ''}</span></p><button data-page="products" class="nav-btn mt-8 bg-black text-white font-semibold py-3 px-8 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Continue Shopping</button></div>`;
    };
}

// Ensure `renderProductDetailPage` is available in module scope. Prefer a global implementation
// (legacy inline in `index.html`) when present, otherwise provide a fallback here.
let renderProductDetailPage;
try {
    if (typeof window !== 'undefined' && typeof window.renderProductDetailPage === 'function') {
        renderProductDetailPage = window.renderProductDetailPage.bind(window);
    }
} catch (e) { /* ignore */ }
if (typeof renderProductDetailPage !== 'function') {
    renderProductDetailPage = function () {
        const product = state.products.find(p => p.id === state.currentProductId);
        if (!product) {
            pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center py-20"><div class="loader mx-auto"></div><p class="mt-4">Loading Product...</p></div>`;
            return;
        }

        const isOutOfStock = !product.stock || product.stock <= 0;
        const addToCartButton = isOutOfStock
            ? `<button class="w-full bg-gray-400 text-white font-semibold py-4 px-10 rounded-full uppercase tracking-wider text-sm cursor-not-allowed" disabled>Out of Stock</button>`
            : `<button data-id="${product.id}" class="add-to-cart-btn-detail w-full bg-black text-white font-semibold py-4 px-10 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all duration-300">Add to Cart</button>`;

        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16"><div class="grid md:grid-cols-2 gap-16 items-start"><div class="bg-gray-100 p-4 rounded-lg relative"><img src="${product.image}" alt="${product.name}" class="w-full h-auto object-cover rounded-md" onerror="this.onerror=null;this.src='https://placehold.co/600x600/f0f0f0/ccc?text=Image+Not+Found';"> ${isOutOfStock ? `<div class="out-of-stock-overlay"><span class="bg-black text-white font-bold py-2 px-4 rounded-md uppercase">Out of Stock</span></div>` : ''}</div><div><h1 class="text-4xl font-playfair mb-4">${product.name}</h1><p class="text-3xl font-semibold text-gray-800 mb-6">₹${Number(product.salePrice).toFixed(2)}</p><p class="text-gray-600 leading-relaxed mb-8">${product.description}</p><div class="flex items-center space-x-4 mb-8"><label for="quantity" class="font-semibold text-sm">QUANTITY</label><input type="number" id="quantitySelector" value="1" min="1" class="w-20 p-2 border border-gray-300 rounded-md text-center"></div> ${addToCartButton} <div class="mt-12 border-t"><div class="accordion-item border-b"><button class="accordion-header w-full flex justify-between items-center py-4 text-left"><span class="font-semibold uppercase text-sm">Description</span><i class="fas fa-chevron-down transform transition-transform"></i></button><div class="accordion-content pb-4 text-gray-600"><p>${product.description}</p></div></div><div class="accordion-item border-b"><button class="accordion-header w-full flex justify-between items-center py-4 text-left"><span class="font-semibold uppercase text-sm">Shipping & Returns</span><i class="fas fa-chevron-down transform transition-transform"></i></button><div class="accordion-content pb-4 text-gray-600"><p>Free standard shipping on orders over ₹4000. Returns are accepted within 30 days of purchase. Please see our full policy for details.</p></div></div></div></div></div></div>`;
    };
}
function renderApp() {
    renderTopBars();
    renderHeader();
    renderFooter();
    
    pageContent.classList.remove('hidden');
    
    switch (state.currentPage) {
        case 'home':
            renderHomePage();
            break;
        case 'account':
            renderAccountPage();
            break;
        case 'products':
            renderProductsPage(state.currentCategory, state.currentGroup);
            break;
        case 'product_detail':
            renderProductDetailPage();
            break;
        case 'cart':
            renderCartPage();
            break;
        case 'checkout':
            renderCheckoutPage();
            break;
        case 'order_success':
            renderOrderSuccessPage();
            break;
        case 'orders':
            renderOrdersPage();
            break;
        case 'auth':
            renderAuthPage();
            break;
        case 'admin':
            renderAdminPage();
            break;
        case 'testimonials':
            renderTestimonialsPage();
            break;
        case 'invoice':
            renderInvoicePage();
            break;
        case 'purchase_invoice':
            renderPurchaseInvoicePage();
            break;
        case 'local_sale_invoice':
            renderLocalSaleInvoicePage();
            break;
        default:
            pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12"><p class="text-center text-red-500">Page not found.</p></div>`;
    }
}

function renderTopBars() {
    let scrollingBarHTML = '';
    if (state.siteSettings.isScrollingBarVisible && state.siteSettings.scrollingBarText) {
        const text = state.siteSettings.scrollingBarText;
        scrollingBarHTML = `
        <a href="#" data-page="products" class="nav-btn block bg-yellow-400 text-black font-medium text-sm py-2 overflow-hidden whitespace-nowrap">
            <div class="scrolling-text-inner">
                <span class="px-8">${text}</span>
                <span class="px-8">${text}</span>
            </div>
        </a>
        `;
    }

    const announcementRibbonHTML = `
        <div class="bg-[#4a2c2a] text-white text-xs font-medium uppercase tracking-wider">
        <div class="container mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-10">
            <div class="flex space-x-6">
                <a href="#" class="hover:text-gray-300 transition-colors">Track Your Order</a>
                <a href="#" class="hover:text-gray-300 transition-colors">Contact Us</a>
            </div>
            <div class="hidden md:block">
                    Free Shipping On All Orders
            </div>
        </div>
    </div>
    `;
    // If developer forced production mode locally, show a prominent banner to avoid accidental destructive actions
    const prodBannerHTML = (__tiaras_forceProd ? `
        <div class="bg-red-600 text-white text-sm font-semibold text-center py-2">
            <span>Production mode: You are connected to PRODUCTION Firebase. Avoid destructive actions.</span>
        </div>
    ` : '');

    topBarsContainer.innerHTML = prodBannerHTML + scrollingBarHTML + announcementRibbonHTML;
}

function renderHeader() {
    const cartItemCount = Object.values(state.cart.items).reduce((sum, item) => sum + item.quantity, 0);
    
    let userControls = `
        <button id="googleSignInHeaderBtn" class="hidden md:inline-flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1.5 text-xs font-semibold hover:bg-gray-50">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" class="w-4 h-4"/>
            Google
        </button>
        <a href="#" data-page="auth" class="nav-btn hover:text-gray-500"><i class="fa-solid fa-user fa-lg"></i></a>`; // Default: Login icon with Google
    if (state.currentUser && !state.currentUser.isAnonymous) {
        const adminIcon = state.isAdmin ? `<a href="#" data-page="admin" class="nav-btn hover:text-gray-500" title="Admin Panel"><i class="fa-solid fa-user-shield fa-lg"></i></a>` : '';
        const profileIcon = `<a href="#" data-page="account" class="nav-btn hover:text-gray-500" title="My Account"><i class="fa-solid fa-user fa-lg"></i></a>`;
        const ordersIcon = `<a href="#" data-page="orders" class="nav-btn hover:text-gray-500" title="My Orders"><i class="fa-solid fa-box-archive fa-lg"></i></a>`;
        const logoutIcon = `<a href="#" id="logoutBtn" class="hover:text-gray-500" title="Logout"><i class="fa-solid fa-right-from-bracket fa-lg"></i></a>`;
        userControls = `${adminIcon} ${profileIcon} ${ordersIcon} ${logoutIcon}`;
    }

        mainHeader.innerHTML = `
            <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                <div class="relative py-6">
                    <div class="absolute left-0 top-1/2 -translate-y-1/2">
                        <a href="#" data-page="home" class="nav-btn block">
                            <img src="https://i.postimg.cc/j2gPH9Kb/tiaras-logo-removebg-preview.png" alt="TIARAS Logo" class="h-14">
                        </a>
                    </div>
                    <div class="text-center">
                        <a href="#" data-page="home" class="nav-btn inline-flex items-center justify-center gap-3">
                            <span class="text-4xl font-playfair text-black font-bold tracking-widest">TIARAS</span>
                        </a>
                    </div>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center space-x-6 text-black">
                        ${userControls}
                        <a href="#" data-page="cart" class="nav-btn relative hover:text-gray-500">
                            <i class="fa-solid fa-cart-shopping fa-lg"></i>
                            ${cartItemCount > 0 ? `<span class="badge">${cartItemCount}</span>` : ''}
                        </a>
                    </div>
                    <nav class="hidden md:flex justify-center items-center space-x-10 text-sm font-medium uppercase pb-4 mt-6 w-full">
                        <a href="#" data-page="home" class="nav-btn nav-link ${state.currentPage === 'home' ? 'active' : ''}">Home</a>
                        <a href="#" data-page="products" class="nav-btn nav-link ${state.currentPage === 'products' && !state.currentCategory ? 'active' : ''}">Shop All</a>
                        <a href="#" data-page="products" data-category="ornament" class="nav-btn nav-link ${state.currentCategory === 'ornament' ? 'active' : ''}">Ornaments</a>
                        <a href="#" data-page="products" data-category="beauty" class="nav-btn nav-link ${state.currentCategory === 'beauty' ? 'active' : ''}">Beauty</a>
                        <a href="#" data-page="testimonials" class="nav-btn nav-link ${state.currentPage === 'testimonials' ? 'active' : ''}">Testimonials</a>
                    </nav>
                </div>
            </div>
        `;
}
        
function renderFooter() {
    mainFooter.innerHTML = `
        <div class="container mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-4 gap-12 text-sm">
            <div>
                <h3 class="font-bold text-base mb-4 uppercase tracking-wider">About TIARAS</h3>
                <p class="text-gray-500">Exquisite ornaments and premium beauty products to help you shine.</p>
                 <div class="flex space-x-5 mt-6 text-gray-600">
                    <a href="#" class="hover:text-black"><i class="fab fa-instagram fa-lg"></i></a>
                    <a href="#" class="hover:text-black"><i class="fab fa-facebook fa-lg"></i></a>
                    <a href="#" class="hover:text-black"><i class="fab fa-pinterest fa-lg"></i></a>
                </div>
            </div>
            <div>
                <h3 class="font-bold text-base mb-4 uppercase tracking-wider">Shop</h3>
                <ul class="space-y-3 text-gray-500">
                    <li><a href="#" data-page="products" class="nav-btn hover:text-black">All Products</a></li>
                    <li><a href="#" data-page="products" data-category="ornament" class="nav-btn hover:text-black">Ornaments</a></li>
                    <li><a href="#" data-page="products" data-category="beauty" class="nav-btn hover:text-black">Beauty</a></li>
                </ul>
            </div>
             <div>
                   <h3 class="font-bold text-base mb-4 uppercase tracking-wider">Customer Service</h3>
                 <ul class="space-y-3 text-gray-500">
                    <li><a href="#" class="hover:text-black">Contact Us</a></li>
                    <li><a href="#" class="hover:text-black">Shipping & Returns</a></li>
                    <li><a href="#" class="hover:text-black">Privacy Policy</a></li>
                    <li><a href="#" class="hover:text-black">Terms of Service</a></li>
                </ul>
            </div>
            <div>
                <h3 class="font-bold text-base mb-4 uppercase tracking-wider">Newsletter</h3>
                <p class="text-gray-500 mb-4">Subscribe for updates and special offers.</p>
                <form class="flex">
                    <input type="email" placeholder="Your email" class="w-full px-3 py-2 border border-r-0 border-gray-300 rounded-l-md focus:outline-none focus:ring-1 focus:ring-black">
                    <button type="submit" class="bg-black text-white px-4 py-2 rounded-r-md hover:bg-gray-800 font-semibold">Sign Up</button>
                </form>
            </div>
        </div>
        <div class="bg-gray-50 py-6">
            <div class="container mx-auto px-6 text-center text-gray-500 text-xs">
                <p>&copy; ${new Date().getFullYear()} TIARAS. All Rights Reserved.</p>
            </div>
        </div>
            `;
}
        
// --- PAGE RENDERING ---

function renderCartPage() {
    if (!state.currentUser || state.currentUser.isAnonymous) {
        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center py-16"><h2 class="text-3xl font-bold mb-4">Please Log In</h2><p class="text-lg text-gray-600">You need to be logged in to view your cart.</p></div>`;
        return;
    }
    const cartProductIds = Object.keys(state.cart.items);
    if (cartProductIds.length === 0) {
        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center py-16"><h2 class="text-3xl font-playfair mb-4">Your Cart is Empty</h2><p class="text-gray-600">Looks like you haven't added anything yet.</p></div>`;
        return;
    }

    let total = 0;
    const cartItemsHTML = state.products
            .filter(p => cartProductIds.includes(p.id) && p.salePrice > 0)
        .map(product => {
            const quantity = state.cart.items[product.id].quantity;
            const subtotal = product.salePrice * quantity;
                total += subtotal;
                return `<div class="flex items-center justify-between py-6"><div class="flex items-center space-x-6 flex-1"><img src="${product.image}" class="w-28 h-28 object-cover rounded-md"><div><h3 class="font-semibold text-lg">${product.name}</h3><p class="text-gray-500 text-sm mt-1">₹${formatMoney(Number(product.salePrice))}</p><div class="flex items-center border rounded-md w-28 mt-4"><button data-id="${product.id}" data-change="-1" class="cart-quantity-stepper p-2">-</button><input type="number" data-id="${product.id}" value="${quantity}" min="1" class="cart-quantity-selector w-12 text-center border-l border-r"><button data-id="${product.id}" data-change="1" class="cart-quantity-stepper p-2">+</button></div></div></div><div class="flex items-center space-x-5"><p class="font-semibold text-lg w-24 text-right">${formatMoney(subtotal)}</p><button data-id="${product.id}" class="remove-from-cart-btn text-gray-400 hover:text-black text-xl">&times;</button></div></div>`;
        }).join('');

    pageContent.innerHTML = `<div class="bg-gray-50 min-h-screen"><div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12"><h1 class="text-4xl font-playfair text-center mb-12">Shopping Cart</h1><div class="grid grid-cols-1 lg:grid-cols-3 gap-12"><div class="lg:col-span-2 bg-white p-8 rounded-lg shadow-sm"><div class="divide-y">${cartItemsHTML}</div></div><div class="bg-white p-8 rounded-lg shadow-sm h-fit"><h2 class="text-2xl font-playfair mb-6">Order Summary</h2><div class="flex justify-between items-center text-lg mb-6"><span>Subtotal (₹)</span><span class="font-semibold">${total.toFixed(2)}</span></div><button data-page="checkout" class="nav-btn w-full bg-black text-white font-semibold py-4 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Proceed to Checkout</button></div></div></div></div>`;
}

function renderOrdersPage() {
    if (!state.currentUser || state.currentUser.isAnonymous) {
            navigateTo('auth');
        return;
    }

    let content = '';
    if (state.orders.length === 0) {
        content = `<div class="text-center py-16"><h2 class="text-2xl font-semibold mb-2">No orders yet</h2><p class="text-gray-500">Looks like you haven't placed an order with us.</p></div>`;
    } else {
        content = state.orders.map(order => `<div class="bg-white p-6 rounded-lg shadow-sm"><div class="flex justify-between items-start mb-4"><div><p class="font-bold text-lg">Order ID: <span class="font-mono">${order.id}</span></p><p class="text-sm text-gray-500">Date: ${new Date(order.orderDate.seconds * 1000).toLocaleDateString()}</p></div><span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${order.status}</span></div><div class="border-t pt-4">${order.items.map(item => `<div class="flex items-center space-x-4 mb-3"><img src="${item.image}" class="w-12 h-12 rounded-md object-cover"><div><p class="font-medium">${item.name}</p><p class="text-sm text-gray-500">Qty: ${item.quantity} - \u20b9${item.price.toFixed(2)}</p></div></div>`).join('')}</div><div class="border-t pt-4 mt-4 text-right"><p class="font-semibold text-lg">Total: \u20b9${order.totalAmount.toFixed(2)}</p></div></div>`).join('');
    }

    pageContent.innerHTML = `<div class="bg-gray-50 min-h-screen"><div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12"><h1 class="text-4xl font-playfair text-center mb-12">My Orders</h1><div class="max-w-4xl mx-auto space-y-6">${content}</div></div></div>`;
}

function renderHomePage() {
    const newArrivals = state.products.slice(0, 4);
    const bestSellers = state.products.slice(0, 4).reverse(); 

    const heroSlidesHTML = state.heroSlides.length > 0 ? state.heroSlides.map(slide => `
        <div class="swiper-slide relative h-[70vh] md:h-[90vh] text-white">
            <img src="${slide.imageUrl}" class="absolute inset-0 w-full h-full object-cover">
            <div class="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
                <div class="text-center p-8">
                    <h2 class="text-4xl md:text-6xl font-playfair mb-4">${slide.headline}</h2>
                    <p class="text-lg md:text-xl mb-8 max-w-md mx-auto">${slide.subtitle}</p>
                    <a href="#" data-page="products" data-category="ornament" class="nav-btn mt-4 border-2 border-white text-white font-semibold py-3 px-12 rounded-full uppercase tracking-wider text-sm hover:bg-white hover:text-black transition-all duration-300">${slide.buttonText}</a>
                </div>
            </div>
        </div>
    `).join('') : `
        <div class="swiper-slide relative h-[70vh] md:h-[90vh] flex items-center justify-center bg-gray-200">
            <p class="text-gray-500">Add slides in the admin panel to see them here.</p>
        </div>
    `;

    const galleryImagesHTML = state.galleryImages.length > 0 ?
        state.galleryImages.map(img => `
            <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <img src="${img.imageUrl}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='https://placehold.co/500x500/f5f5f5/cccccc?text=tiaras';">
            </div>`).join('') :
        [1,2,3,4].map(i => `
            <div class="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                <img src="https://placehold.co/500x500/f5f5f5/cccccc?text=tiaras" class="w-full h-full object-cover">
            </div>`).join('');

    // Removed 'As seen on' ribbon as requested
    const asSeenOnImagesHTML = '';
        
    const testimonialsHTML = state.testimonials.map(testimonial => `
        <div class="swiper-slide">
            <div class="text-center p-8 max-w-lg mx-auto">
                <div class="text-yellow-400 mb-4 text-lg">
                    ${'<i class="fas fa-star"></i>'.repeat(testimonial.rating)}
                    ${'<i class="far fa-star"></i>'.repeat(5 - testimonial.rating)}
                </div>
                <p class="text-lg italic text-gray-600 mb-6">"${testimonial.message}"</p>
                <h4 class="font-semibold text-gray-800 uppercase tracking-wider text-sm">- ${testimonial.name}</h4>
            </div>
        </div>
    `).join('');

    const ornamentProducts = state.products.filter(p => p.category === 'ornament');
    ornamentProducts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const ornamentImageUrl = ornamentProducts.length > 0 ? ornamentProducts[0].image : "https://i.postimg.cc/DyMNP27y/antique-german-silver.webp";
    const beautyImageUrl = "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?q=80&w=1887&auto=format&fit=crop";

    const productGroupsHTML = state.productGroups.length > 0 ? state.productGroups.map(group => {
        const firstProductInGroup = state.products.find(p => p.productGroup === group.name);
        const groupImageUrl = firstProductInGroup ? firstProductInGroup.image : 'https://placehold.co/600x400/f5f5f5/cccccc?text=tiaras';
        
        return `
            <a href="#" data-page="products" data-group="${group.name}" class="nav-btn relative rounded-lg overflow-hidden group h-64">
                  <img src="${groupImageUrl}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                  <div class="absolute inset-0 bg-black bg-opacity-30 flex items-end justify-start p-8">
                       <h3 class="text-white text-3xl font-playfair font-bold">${group.name}</h3>
                  </div>
            </a>
        `;
    }).join('') : '';


    pageContent.innerHTML = `
        <section class="w-full hero-swiper">
            <div class="swiper">
                <div class="swiper-wrapper">${heroSlidesHTML}</div>
                <div class="swiper-pagination"></div>
                <div class="swiper-button-prev"></div>
                <div class="swiper-button-next"></div>
            </div>
        </section>
        
        <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <section class="mb-20">
                <div class="text-center mb-12">
                    <h2 class="text-3xl font-playfair">Shop by Category</h2>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <a href="#" data-page="products" data-category="ornament" class="nav-btn relative rounded-lg overflow-hidden group h-64">
                          <img src="${ornamentImageUrl}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                          <div class="absolute inset-0 bg-black bg-opacity-30 flex items-end justify-start p-8">
                               <h3 class="text-white text-3xl font-playfair font-bold">Ornaments</h3>
                          </div>
                    </a>
                      <a href="#" data-page="products" data-category="beauty" class="nav-btn relative rounded-lg overflow-hidden group h-64">
                          <img src="${beautyImageUrl}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                          <div class="absolute inset-0 bg-black bg-opacity-30 flex items-end justify-start p-8">
                               <h3 class="text-white text-3xl font-playfair font-bold">Beauty</h3>
                          </div>
                      </a>
                </div>
            </section>
            ${productGroupsHTML ? `
                <section class="mb-20">
                    <div class="text-center mb-12">
                        <h2 class="text-3xl font-playfair">Shop by Collection</h2>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                       ${productGroupsHTML}
                    </div>
                </section>
            ` : ''}
            <section class="mb-20">
                <div class="text-center mb-12">
                    <h2 class="text-3xl font-playfair">Best Sellers</h2>
                    <p class="text-gray-500 mt-2">Our most loved pieces</p>
                </div>
               ${renderProductGrid(bestSellers)}
            </section>
            <section class="bg-white py-20">
                <div class="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div class="text-center mb-12">
                        <h2 class="text-3xl font-playfair">What Our Customers Say</h2>
                    </div>
                    <div class="swiper reviews-swiper">
                        <div class="swiper-wrapper">
                            ${testimonialsHTML.length > 0 ? testimonialsHTML : `
                                <div class="swiper-slide">
                                    <div class="text-center p-8 max-w-lg mx-auto">
                                        <p class="text-gray-500">No customer reviews yet.</p>
                                    </div>
                                </div>
                            `}
                        </div>
                        <div class="swiper-pagination reviews-pagination mt-8"></div>
                    </div>
                </div>
            </section>
              <section>
                    <div class="text-center mb-12">
                    <h2 class="text-3xl font-playfair">#TIARASBEAUTY</h2>
                    <p class="text-gray-500 mt-2">Tag us on Instagram to be featured</p>
                </div>
                   <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${galleryImagesHTML}
                </div>
            </section>
        </div>
    `;

    (function(){
        function initConditionalLoop(selector, options){
            try{
                const el = document.querySelector(selector);
                const slideCount = el ? el.querySelectorAll('.swiper-slide').length : 0;
                const spv = options && options.slidesPerView ? options.slidesPerView : 1;
                if (slideCount < spv) options = Object.assign({}, options, { loop: false });
            }catch(e){ }
            return new Swiper(selector, options);
        }

        initConditionalLoop('.hero-swiper .swiper', {
            loop: true,
            autoplay: { delay: 5000, disableOnInteraction: false },
            pagination: { el: '.hero-swiper .swiper-pagination', clickable: true },
            navigation: { nextEl: '.hero-swiper .swiper-button-next', prevEl: '.hero-swiper .swiper-button-prev' },
        });

        initConditionalLoop('.reviews-swiper', {
            loop: true,
            autoplay: { delay: 4000, disableOnInteraction: false },
            slidesPerView: 1,
            spaceBetween: 30,
            pagination: { el: '.reviews-pagination', clickable: true },
        });
    })();
}

function renderProductsPage(category = null, group = null) {
    let productsToDisplay = state.products;
    let title = 'All Products';
    let subtitle = 'Browse our curated collection';

    if (category) {
        productsToDisplay = productsToDisplay.filter(p => p.category === category);
        title = category.charAt(0).toUpperCase() + category.slice(1) + 's';
        subtitle = `Browse our collection of ${title}`;
    }
    
    if (group) {
        // Filter products by group identifier or group name when provided
        // Some products use `productGroup` (name) while others may use ids (groupId/productGroupId)
        productsToDisplay = productsToDisplay.filter(p => {
            return (p.groupId || p.productGroupId || p.group || p.productGroup || p.productGroupName) === group;
        });
        title = 'All Products';
        subtitle = 'Browse our curated collection';
    }
    // Render the products listing using the existing helper
    pageContent.innerHTML = `<div class="bg-white"><div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12"><h1 class="text-4xl font-playfair text-center mb-2">${title}</h1><p class="text-center text-gray-500 mb-12">${subtitle}</p>${renderProductGrid(productsToDisplay)}</div></div>`;
}

function renderTestimonialsPage() {
    const testimonialFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-playfair mb-6">Write a Review</h3>
            <form id="testimonialForm" class="space-y-4">
                <div>
                    <input type="text" id="testimonialName" placeholder="Your Name" class="w-full px-4 py-2 border border-gray-300 rounded-md" required>
                </div>
                <div>
                    <textarea id="testimonialMessage" placeholder="Your review..." rows="4" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></textarea>
                </div>
                <div class="flex items-center space-x-2">
                    <span class="text-gray-600">Rating:</span>
                    <div id="testimonialRating" class="flex flex-row-reverse justify-end">
                        <input type="radio" id="star5" name="rating" value="5" class="hidden"/><label for="star5" title="5 stars" class="text-2xl text-gray-300 cursor-pointer hover:text-yellow-400"><i class="fas fa-star"></i></label>
                        <input type="radio" id="star4" name="rating" value="4" class="hidden"/><label for="star4" title="4 stars" class="text-2xl text-gray-300 cursor-pointer hover:text-yellow-400"><i class="fas fa-star"></i></label>
                        <input type="radio" id="star3" name="rating" value="3" class="hidden"/><label for="star3" title="3 stars" class="text-2xl text-gray-300 cursor-pointer hover:text-yellow-400"><i class="fas fa-star"></i></label>
                        <input type="radio" id="star2" name="rating" value="2" class="hidden"/><label for="star2" title="2 stars" class="text-2xl text-gray-300 cursor-pointer hover:text-yellow-400"><i class="fas fa-star"></i></label>
                        <input type="radio" id="star1" name="rating" value="1" class="hidden" required/><label for="star1" title="1 star" class="text-2xl text-gray-300 cursor-pointer hover:text-yellow-400"><i class="fas fa-star"></i></label>
                    </div>
                </div>
                <button type="submit" class="bg-black text-white font-semibold py-3 px-8 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Submit Review</button>
            </form>
        </div>
    `;

    const allTestimonialsHTML = state.testimonials && state.testimonials.length > 0 ? state.testimonials.map(testimonial => `
        <div class="bg-white p-6 rounded-lg shadow-sm">
            <div class="text-yellow-400 mb-2 text-lg">
                ${'<i class="fas fa-star"></i>'.repeat(testimonial.rating)}
                ${'<i class="far fa-star"></i>'.repeat(5 - testimonial.rating)}
            </div>
            <p class="italic text-gray-600 mb-4">"${testimonial.message}"</p>
            <h4 class="font-semibold text-gray-800 uppercase tracking-wider text-sm text-right">- ${testimonial.name}</h4>
        </div>
    `).join('') : '<p class="text-gray-500 text-center col-span-full">No reviews yet. Be the first to write one!</p>';

    pageContent.innerHTML = `
        <div class="bg-gray-50 min-h-screen">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 class="text-4xl font-playfair text-center mb-12">Customer Testimonials</h1>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div class="lg:col-span-2 space-y-6">
                       ${allTestimonialsHTML}
                    </div>
                    <div class="h-fit sticky top-28">
                       ${testimonialFormHTML}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAccountPage() {
    if (!state.currentUser || state.currentUser.isAnonymous) {
        navigateTo('auth');
        return;
    }

    const p = state.userProfile || {};
    const email = state.currentUser.email || '';

    pageContent.innerHTML = `
        <div class="bg-gray-50 min-h-screen">
            <div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 class="text-4xl font-playfair text-center mb-12">My Account</h1>
                <div class="max-w-2xl mx-auto bg-white p-8 rounded-lg shadow-sm">
                    <h2 class="text-2xl font-semibold mb-6">Profile</h2>
                    <form id="accountForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value="${email}" disabled class="mt-1 block w-full rounded-md border-gray-200 bg-gray-100 shadow-sm sm:text-sm p-2 border"/>
                        </div>
                        <div>
                            <label for="accFullName" class="block text-sm font-medium text-gray-700">Full Name</label>
                            <input id="accFullName" type="text" value="${p.fullName || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                        </div>
                        <div>
                            <label for="accAddress" class="block text-sm font-medium text-gray-700">Address</label>
                            <input id="accAddress" type="text" value="${p.address || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label for="accCity" class="block text-sm font-medium text-gray-700">City</label>
                                <input id="accCity" type="text" value="${p.city || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                            </div>
                            <div>
                                <label for="accState" class="block text-sm font-medium text-gray-700">State</label>
                                <input id="accState" type="text" value="${p.state || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                            </div>
                            <div>
                                <label for="accZip" class="block text-sm font-medium text-gray-700">ZIP</label>
                                <input id="accZip" type="text" value="${p.zip || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                            </div>
                        </div>
                        <div>
                            <label for="accPhone" class="block text-sm font-medium text-gray-700">Phone</label>
                            <input id="accPhone" type="tel" value="${p.phone || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2 border"/>
                        </div>
                        <div class="pt-4">
                            <button type="submit" class="w-full bg-black text-white font-semibold py-3 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Save Profile</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;
}
        
function renderAuthPage() {
    pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-16"><div class="max-w-md mx-auto bg-white p-10 rounded-lg"><div id="authFormContainer"></div></div></div>`;
    showAuthForm(true);
}
        
function showAuthForm(isLogin) {
    const container = document.getElementById('authFormContainer');
    if(!container) return;

    const title = isLogin ? 'Login' : 'Create Account';
    const switchBtnText = isLogin ? "Create an account" : "Already have an account?";
    const submitBtnText = isLogin ? 'Sign In' : 'Create';

    container.innerHTML = `
        <h3 class="text-3xl font-playfair text-center mb-8">${title}</h3>
        <form id="authForm" class="space-y-6">
            <div>
                <input type="email" id="email" required placeholder="Email" class="w-full px-4 py-3 border-b border-gray-300 focus:outline-none focus:border-black">
            </div>
            <div class="relative">
                <input type="password" id="password" required placeholder="Password" class="w-full px-4 py-3 border-b border-gray-300 focus:outline-none focus:border-black">
                <button type="button" id="toggleAuthPasswordBtn" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600">Show</button>
            </div>
            <button type="submit" class="w-full bg-black text-white font-semibold py-3 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition duration-300">${submitBtnText}</button>
        </form>
        <div class="flex items-center my-6">
            <div class="flex-1 h-px bg-gray-200"></div>
            <span class="px-4 text-xs uppercase tracking-wider text-gray-400">or</span>
            <div class="flex-1 h-px bg-gray-200"></div>
        </div>
        <button id="googleSignInBtn" class="w-full border border-gray-300 rounded-full py-3 text-sm font-semibold hover:bg-gray-50 flex items-center justify-center gap-3">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" class="w-5 h-5"/>
            Continue with Google
        </button>
        <div class="text-center mt-6">
            <button id="switchAuthMode" class="text-sm text-gray-600 hover:underline">${switchBtnText}</button>
        </div>`;

    // Wire auth password show/hide toggle
    try {
        const toggleAuth = document.getElementById('toggleAuthPasswordBtn');
        const pwdEl = document.getElementById('password');
        if (toggleAuth && pwdEl) toggleAuth.addEventListener('click', () => { pwdEl.type = pwdEl.type === 'password' ? 'text' : 'password'; toggleAuth.textContent = pwdEl.type === 'password' ? 'Show' : 'Hide'; });
    } catch(_){}

    document.getElementById('authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            navigateTo('home');
        } catch (err) {
            showMessage(`Authentication failed: ${err.message}`);
        }
    });

    document.getElementById('switchAuthMode').addEventListener('click', () => showAuthForm(!isLogin));

    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            try {
                await handleGoogleSignIn();
                navigateTo('home');
            } catch (err) {
                console.error('Google sign-in failed:', err);
                showMessage(`Google sign-in failed: ${err?.message || err}`);
            }
        });
    }
}

async function handleGoogleSignIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const result = await linkWithPopup(auth.currentUser, provider);
            return result.user;
        } else {
            const result = await signInWithPopup(auth, provider);
            return result.user;
        }
    } catch (err) {
        const code = err?.code || '';
        // If the Google credential is already linked to another account,
        // sign into that account and migrate the anonymous cart if present.
        if (code === 'auth/credential-already-in-use') {
            const cred = GoogleAuthProvider.credentialFromError(err);
            // Save cart backup across redirect so it can be merged after sign-in
            try { if (state.cart && Object.keys(state.cart.items || {}).length) localStorage.setItem('anonCartBackup', JSON.stringify(state.cart)); } catch {}
            await linkWithRedirect(auth.currentUser, provider);
        } else {
            await signInWithRedirect(auth, provider);
        }
        // The page will redirect; result will be handled on load
        return null;
    }
}

let _redirectHandled = false;
async function handleAuthRedirectResultOnce() {
    if (_redirectHandled) return;
    _redirectHandled = true;
    try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
            await mergeBackupCartToCurrentUser();
            // Successful redirect sign-in / linking
            navigateTo('home');
        }
    } catch (err) {
        console.warn('Google redirect result failed:', err?.message || err);
    }
}

async function mergeBackupCartToCurrentUser() {
    try {
        const raw = localStorage.getItem('anonCartBackup');
        if (!raw) return;
        localStorage.removeItem('anonCartBackup');
        const backup = JSON.parse(raw);
        if (!auth.currentUser || auth.currentUser.isAnonymous) return;
        const uid = auth.currentUser.uid;
        const cartRef = doc(db, `artifacts/${appId}/users/${uid}/cart`, 'user_cart');
        const snap = await getDoc(cartRef);
        const currentItems = (snap.exists() && snap.data().items) ? snap.data().items : {};
        const backupItems = (backup && backup.items) ? backup.items : {};
        // Merge quantities per productId
        const merged = { ...currentItems };
        for (const [pid, it] of Object.entries(backupItems)) {
            if (!merged[pid]) merged[pid] = it;
            else merged[pid] = { ...merged[pid], quantity: (parseInt(merged[pid].quantity)||0) + (parseInt(it.quantity)||0) };
        }
        await setDoc(cartRef, { items: merged }, { merge: true });
        // Update local state/cart
        state.cart = { items: merged };
        renderHeader();
    } catch (e) {
        console.warn('Cart merge after Google sign-in failed:', e?.message || e);
    }
}

function renderProductGrid(productsToRender) {
    if (productsToRender.length === 0 && state.products.length > 0) return `<p>No products match your criteria.</p>`;
    if (productsToRender.length === 0) return `<div class="col-span-full flex justify-center items-center h-64"><div class="loader"></div></div>`;
    return `<div class="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-10">${productsToRender.map(product => {
        const isOutOfStock = !product.stock || product.stock <= 0;
        const button = isOutOfStock
            ? `<button class="bg-gray-300 text-white font-semibold text-xs py-2 px-6 rounded-full uppercase tracking-wider cursor-not-allowed" disabled>Out of Stock</button>`
            : `<button data-id="${product.id}" class="add-to-cart-btn bg-black text-white font-semibold text-xs py-2 px-6 rounded-full uppercase tracking-wider">Add to Cart</button>`;
        
        return `<div class="product-card group text-center"><a href="#" data-page="product_detail" data-id="${product.id}" class="nav-btn block product-image-container mb-4 rounded-lg overflow-hidden bg-gray-100"><img src="${product.image}" alt="${product.name}" class="product-image w-full h-full aspect-[4/5] object-cover" onerror="this.onerror=null;this.src='https://placehold.co/400x500/f0f0f0/ccc?text=Image+Not+Found';"> ${isOutOfStock ? `<div class="out-of-stock-overlay"><span class="bg-black text-white font-bold py-1 px-3 rounded-md uppercase text-xs">Out of Stock</span></div>` : ''} </a><h4 class="font-semibold text-gray-800 mb-1">${product.name}</h4><p class="text-gray-600">₹${Number(product.salePrice).toFixed(2)}</p><div class="mt-2">${button}</div></div>`
    }).join('')}</div>`;
}

function escapeHtml(s) { return (s||'').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function tooltipHTML(text) {
    const t = escapeHtml(text||'');
    return `
        <span class="ml-2 relative inline-block group">
            <button type="button" class="focus:outline-none" aria-label="${t}" tabindex="0">
                <svg xmlns="http://www.w3.org/2000/svg" class="inline-block h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M12 18a6 6 0 100-12 6 6 0 000 12z"/></svg>
            </button>
            <div class="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute z-50 left-6 -top-1 w-64 bg-white text-xs text-gray-700 border rounded shadow p-2">
                ${t}
            </div>
        </span>`;
}

function renderAdminPage() {
    if (!state.isAdmin) {
        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"><h1 class="text-4xl font-playfair mb-4">Access Denied</h1><p class="text-gray-600">You do not have permission to view this page.</p><button data-page="home" class="nav-btn mt-8 bg-black text-white font-semibold py-3 px-8 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Go to Homepage</button></div>`;
        return;
    }

    const adminEmailsPrefill = normalizeList(state.siteSettings?.adminEmails ?? state.siteSettings?.adminEmail).join(', ');
    const adminUidsPrefill = normalizeList(state.siteSettings?.adminUids ?? state.siteSettings?.adminUid).join(', ');

    const gstFieldHTML = state.siteSettings.isGstEnabled
        ? `<div><label for="gstPercentage" class="block text-sm font-medium text-gray-700 mb-1">GST %</label><select id="gstPercentage" class="w-full px-4 py-2 border border-gray-300 rounded-md" required><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></div>`
        : '<input type="hidden" id="gstPercentage" value="0">';
    const formGridClass = state.siteSettings.isGstEnabled ? 'md:grid-cols-2' : 'md:grid-cols-1';

    const productFormHTML = `
        <input type="hidden" id="productId">
        <div><label for="productName" class="block text-sm font-medium text-gray-700 mb-1">Product Name</label><input type="text" id="productName" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div>
        <div><label for="productDescription" class="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea id="productDescription" rows="4" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></textarea></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div><label for="salePrice" class="block text-sm font-medium text-gray-700 mb-1">Sale Price (₹)</label><input type="number" id="salePrice" step="0.01" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div>
            <div class="grid grid-cols-2 gap-4 border p-2 rounded-md bg-gray-50">
                <div>
                    <label class="block text-xs font-medium text-gray-500">Avg. Purchase Price</label>
                    <p id="avgPurchasePriceDisplay" class="font-bold text-gray-800 mt-2">N/A</p>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-500">Last Purchase Price</label>
                    <p id="lastPurchasePriceDisplay" class="font-bold text-gray-800 mt-2">N/A</p>
                </div>
                </div>
                </div>
            
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div>
                <label for="productCategory" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select id="productCategory" class="w-full px-4 py-2 border border-gray-300 rounded-md" required>
                    <option value="ornament">Ornament</option>
                    <option value="beauty">Beauty</option>
                </select>
            </div>
            <div>
                <label for="productGroup" class="block text-sm font-medium text-gray-700 mb-1">Group (Collection)</label>
                <div class="flex items-center gap-2">
                    <select id="productGroup" class="flex-1 px-4 py-2 border border-gray-300 rounded-md">
                        <option value="">None</option>
                       ${state.productGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('')}
                    </select>
                    <button type="button" id="showNewProductGroupBtn" class="text-sm text-blue-600 hover:underline">+ Add</button>
                </div>
                <div id="newProductGroupRow" class="mt-2 hidden">
                    <div class="flex items-center gap-2">
                        <input type="text" id="newProductGroupName" class="flex-1 px-3 py-2 border border-gray-300 rounded-md" placeholder="New group name">
                        <button type="button" id="addProductGroupInlineBtn" class="bg-green-600 text-white px-3 py-2 rounded">Add</button>
                        <button type="button" id="cancelNewProductGroupBtn" class="bg-gray-200 text-gray-700 px-3 py-2 rounded">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1 ${formGridClass} gap-6 mt-6">
            ${state.siteSettings.isGstEnabled ? gstFieldHTML : ''}
            <div><label for="productImage" class="block text-sm font-medium text-gray-700 mb-1">Image URL</label><input type="url" id="productImage" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="https://example.com/image.jpg" required></div>
        </div>
       ${!state.siteSettings.isGstEnabled ? gstFieldHTML : ''}
        <div class="flex items-center space-x-4 mt-6"><button type="submit" id="productFormSubmitBtn" class="bg-green-600 text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-green-700 transition">Add Product</button><button type="button" id="productFormCancelBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition hidden">Cancel</button></div>`;

    const slideFormHTML = `<input type="hidden" id="slideId"><div><label for="slideHeadline" class="block text-sm font-medium text-gray-700 mb-1">Headline</label><input type="text" id="slideHeadline" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideSubtitle" class="block text-sm font-medium text-gray-700 mb-1">Subtitle</label><input type="text" id="slideSubtitle" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideImageUrl" class="block text-sm font-medium text-gray-700 mb-1">Image URL</label><input type="url" id="slideImageUrl" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label for="slideButtonText" class="block text-sm font-medium text-gray-700 mb-1">Button Text</label><input type="text" id="slideButtonText" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideButtonLink" class="block text-sm font-medium text-gray-700 mb-1">Button Link</label><input type="text" id="slideButtonLink" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="#" required></div></div><div class="flex items-center space-x-4"><button type="submit" id="slideFormSubmitBtn" class="bg-blue-600 text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-blue-700 transition">Add Slide</button><button type="button" id="slideFormCancelBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition hidden">Cancel</button></div>`;

    

    
    
    
    
    

    

    const settingsFormHTML = `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><form id="settingsForm"><div class="space-y-8"><div><h3 class="text-2xl font-bold mb-4">Store Settings ${tooltipHTML('General store configuration such as GST registration and core behaviour.')}</h3><div class="space-y-4"><div class="flex items-center justify-between"><span class="text-sm font-medium text-gray-700">Merchant is GST registered</span><label class="toggle-switch"><input type="checkbox" id="merchantGstRegistered" ${state.siteSettings.merchantGstRegistered ? 'checked' : ''}><span class="toggle-slider"></span></label></div><p class="text-xs text-gray-500">Sales GST is applied automatically when the merchant is GST registered. If not registered, GST will not be charged on sales, and purchase GST will be treated as part of item cost.</p></div></div><div class="space-y-4 pt-4 border-t"><h3 class="text-2xl font-bold mb-4">Business & GST Details ${tooltipHTML('Enter merchant GSTIN and business address used on invoices and tax reports.')}</h3><div><label for="merchantGstin" class="block text-sm font-medium text-gray-700 mb-1">Merchant GSTIN</label><input type="text" id="merchantGstin" value="${state.siteSettings.merchantGstRegistered ? (state.siteSettings.merchantGstRegistered ? (state.siteSettings.merchantGstin || '') : '') : ''}" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="e.g., 29ABCDE1234F1Z5" ${state.siteSettings.merchantGstRegistered ? '' : 'disabled title="Disabled when not GST registered"'}></div><div><label for="businessAddress" class="block text-sm font-medium text-gray-700 mb-1">Business Address</label><textarea id="businessAddress" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Full address">${state.siteSettings.businessAddress || ''}</textarea></div></div><div class="space-y-4 pt-4 border-t"><h3 class="text-2xl font-bold mb-4">Admin Access ${tooltipHTML('Add admin emails or Firebase UIDs to grant admin panel access.')}</h3><p class="text-xs text-gray-500">Grant additional admins by listing their email addresses or Firebase Auth UIDs (comma separated). Primary developer admin access always remains.</p><div><label for="adminEmails" class="block text-sm font-medium text-gray-700 mb-1">Additional Admin Emails</label><textarea id="adminEmails" rows="2" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="name@example.com, other@example.com">${adminEmailsPrefill}</textarea></div><div><label for="adminUids" class="block text-sm font-medium text-gray-700 mb-1">Additional Admin UIDs</label><textarea id="adminUids" rows="2" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="UID1, UID2">${adminUidsPrefill}</textarea></div><p class="text-[11px] text-gray-500">Changes take effect immediately after saving.</p></div>
    </div><div class="mt-8 border-t pt-6 flex items-center justify-between"><button type="submit" class="bg-green-600 text-white font-semibold py-2 px-8 rounded-md shadow hover:bg-green-700 transition">Save All Settings</button></div>
    </div></form></div>

    <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
        <div class="space-y-4 pt-4 border-t">
            <h3 class="text-2xl font-bold mb-4">App Reset (Admin) ${tooltipHTML('Dangerous: selects data buckets to reset; requires master password and is irreversible.')}</h3>
            <p class="text-xs text-gray-500 mb-3">Select the data buckets to reset. These operations are destructive and require the master password.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-700 mb-4">
                <label class="flex items-center"><input type="checkbox" id="reset_products" class="mr-2">Products</label>
                <label class="flex items-center"><input type="checkbox" id="reset_productGroups" class="mr-2">Product Groups</label>
                <label class="flex items-center"><input type="checkbox" id="reset_slides" class="mr-2">Hero Slides</label>
                <label class="flex items-center"><input type="checkbox" id="reset_gallery" class="mr-2">Gallery Images</label>
                <label class="flex items-center"><input type="checkbox" id="reset_testimonials" class="mr-2">Testimonials</label>
                <label class="flex items-center"><input type="checkbox" id="reset_purchases" class="mr-2">Purchases</label>
                    <label class="flex items-center"><input type="checkbox" id="reset_suppliers" class="mr-2">Suppliers</label>
                    <label class="flex items-center"><input type="checkbox" id="reset_customers" class="mr-2">Customers</label>
                    <label class="flex items-center"><input type="checkbox" id="reset_banks" class="mr-2">Banks</label>
                <label class="flex items-center"><input type="checkbox" id="reset_cash" class="mr-2">Cash Book</label>
                <label class="flex items-center"><input type="checkbox" id="reset_bank" class="mr-2">Bank Book</label>
                <label class="flex items-center"><input type="checkbox" id="reset_localSales" class="mr-2">Local Sales</label>
                <label class="flex items-center"><input type="checkbox" id="reset_orders" class="mr-2">Orders</label>
                <label class="flex items-center"><input type="checkbox" id="reset_carts" class="mr-2">User Carts</label>
                <label class="flex items-center"><input type="checkbox" id="reset_siteSettings" class="mr-2">Site Settings</label>
                <label class="flex items-center"><input type="checkbox" id="reset_counters" class="mr-2">Counters</label>
            </div>
            <div class="flex items-center gap-3">
                <button type="button" id="resetSelectedBtn" class="bg-yellow-600 text-white font-semibold py-2 px-4 rounded hover:bg-yellow-700">Reset Selected</button>
                <button type="button" id="masterResetBtn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded hover:bg-red-700">Master Reset (Full)</button>
            </div>
        </div>
    </div>`;

    

    const tabsContent = {
        orders: `<div><div id="adminOrderList" class="space-y-4"></div></div>`,
        products: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="productFormTitle" class="text-2xl font-bold mb-6">Add New Product</h3><form id="productForm" class="space-y-6">${productFormHTML}</form></div><div><h3 class="text-2xl font-bold mb-6">Manage Products</h3><div id="adminProductList" class="space-y-4"></div></div>`,
        product_groups: `<div id="adminProductGroupsContainer"></div>`,
        purchases: `<div id="adminPurchasesContainer"></div>`,
        audit: `<div id="adminAuditContainer"></div>`,
        media: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="slideFormTitle" class="text-2xl font-bold mb-6">Add New Hero Slide</h3><form id="slideForm" class="space-y-6">${slideFormHTML}</form></div><div class="mb-12"><h3 class="text-2xl font-bold mb-6">Manage Hero Slides</h3><div id="adminSlideList" class="space-y-4"></div></div><div class="bg-white p-8 rounded-lg shadow-lg"><h3 class="text-2xl font-bold mb-6">Manage Gallery Images</h3><div id="galleryImageFormContainer"><label for="galleryImageUrl" class="block text-sm font-medium text-gray-700 mb-1">New Image URL</label><div class="flex"><input type="url" id="galleryImageUrl" class="w-full px-4 py-2 border border-r-0 border-gray-300 rounded-l-md" required placeholder="https://example.com/photo.jpg"><button type="button" id="addGalleryImageBtn" class="bg-indigo-600 text-white font-semibold py-2 px-6 rounded-r-md shadow hover:bg-indigo-700 transition">Add Image</button></div></div><div class="mt-8"><h4 class="text-lg font-bold mb-4">Current Images</h4><div id="adminGalleryImageList" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div></div></div>`,
        billing_settings: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12">
                <h3 class="text-2xl font-bold mb-6">Manage Bank Accounts ${tooltipHTML('Add and manage bank accounts used for payment and receipt transactions.')}</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <form id="bankMasterForm" class="col-span-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                        <div class="md:col-span-4">
                            <label class="block text-xs text-gray-600">Popular banks (India)</label>
                            <select id="existingBanksDropdown" class="border rounded p-2 w-full">
                                <option value="">-- Select a popular bank to autofill --</option>
                                <option value="State Bank of India">State Bank of India</option>
                                <option value="HDFC Bank">HDFC Bank</option>
                                <option value="ICICI Bank">ICICI Bank</option>
                                <option value="Axis Bank">Axis Bank</option>
                                <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                                <option value="Punjab National Bank">Punjab National Bank</option>
                                <option value="Bank of Baroda">Bank of Baroda</option>
                                <option value="Canara Bank">Canara Bank</option>
                                <option value="Union Bank of India">Union Bank of India</option>
                                <option value="Other">Other / Custom</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Bank Name</label>
                            <input type="text" id="bankName" class="border rounded p-2 w-full" placeholder="Bank/Account name" required>
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Account Number</label>
                            <input type="text" id="bankAccountNumber" class="border rounded p-2 w-full" placeholder="Account number">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">IFSC</label>
                            <input type="text" id="bankIfsc" class="border rounded p-2 w-full" placeholder="IFSC code">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Bank Address</label>
                            <input type="text" id="bankAddress" class="border rounded p-2 w-full" placeholder="Branch / Address">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Notes</label>
                            <input type="text" id="bankNotes" class="border rounded p-2 w-full" placeholder="Optional notes">
                        </div>
                        <div class="md:col-span-4">
                            <div class="flex items-center gap-2">
                                <button id="bankMasterSubmitBtn" class="bg-green-600 text-white px-3 py-2 rounded" type="submit">Add Bank Account</button>
                                <button id="bankMasterCancelBtn" type="button" class="bg-gray-300 text-gray-800 px-3 py-2 rounded" style="display:none;">Cancel</button>
                            </div>
                        </div>
                    </form>
                    <div class="col-span-1 md:col-span-1">
                        <h4 class="text-sm text-gray-600 mb-2">Existing Accounts</h4>
                        <div id="bankMasterTableContainer" class="w-full overflow-auto">
                            <table id="bankMasterTable" class="w-full text-sm text-left border-collapse">
                                <thead>
                                    <tr class="bg-gray-100 text-xs text-gray-700">
                                        <th class="p-2 border">Name</th>
                                        <th class="p-2 border">Account No.</th>
                                        <th class="p-2 border">IFSC</th>
                                        <th class="p-2 border">Address</th>
                                        <th class="p-2 border">Notes</th>
                                        <th class="p-2 border">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(state.allBanks||[]).map(b=>`<tr class="border-b hover:bg-gray-50"><td class="p-2 align-top">${(b.name||'').replace(/</g,'&lt;')}</td><td class="p-2 align-top font-mono">${(b.accountNumber||'')}</td><td class="p-2 align-top">${(b.ifsc||'')}</td><td class="p-2 align-top">${(b.address||'')}</td><td class="p-2 align-top">${(b.notes||'')}</td><td class="p-2 align-top"><div class="flex items-center gap-2"><button type="button" data-id="${b.id}" class="edit-bank-btn text-blue-600 text-xs">Edit</button><button type="button" data-id="${b.id}" class="delete-bank-btn text-red-600 text-xs">Delete</button></div></td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                <!-- Billing: Invoice Number Formats -->
                <div style="margin-top:12px;" class="border-t pt-6">
                    <h3 class="text-2xl font-bold mb-3">Invoice Number Formats ${tooltipHTML('Configure invoice number templates. Tokens: {COUNTER},{COUNTER_PAD},{YYYY},{YY},{MM},{DD},{PREFIX}.')}</h3>
                    <p class="text-xs text-gray-500 mb-3">Use tokens: {COUNTER}, {COUNTER_PAD} (4 digits), {YYYY}, {YY}, {MM}, {DD}, {PREFIX}</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Sales (Orders)</label>
                            <input id="fmt_sales" class="w-full px-3 py-2 border rounded" value="${escapeHtml((state.siteSettings && state.siteSettings.invoiceFormats && state.siteSettings.invoiceFormats.sales) || 'INV-{YYYY}-{COUNTER_PAD}')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Purchases</label>
                            <input id="fmt_purchases" class="w-full px-3 py-2 border rounded" value="${escapeHtml((state.siteSettings && state.siteSettings.invoiceFormats && state.siteSettings.invoiceFormats.purchases) || 'PUR-{YYYY}-{COUNTER_PAD}')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Sales Returns (Credit Notes)</label>
                            <input id="fmt_salesReturns" class="w-full px-3 py-2 border rounded" value="${escapeHtml((state.siteSettings && state.siteSettings.invoiceFormats && state.siteSettings.invoiceFormats.salesReturns) || 'CR-{YYYY}-{COUNTER_PAD}')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Purchase Returns (Debit Notes)</label>
                            <input id="fmt_purchaseReturns" class="w-full px-3 py-2 border rounded" value="${escapeHtml((state.siteSettings && state.siteSettings.invoiceFormats && state.siteSettings.invoiceFormats.purchaseReturns) || 'DR-{YYYY}-{COUNTER_PAD}')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Local Sales</label>
                            <input id="fmt_localSales" class="w-full px-3 py-2 border rounded" value="${escapeHtml((state.siteSettings && state.siteSettings.invoiceFormats && state.siteSettings.invoiceFormats.localSales) || 'LS-{YYYY}-{COUNTER_PAD}')}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Global Prefix (optional)</label>
                            <input id="invoicePrefix" class="w-full px-3 py-2 border rounded" value="${escapeHtml(state.siteSettings?.invoicePrefix || '')}">
                        </div>
                    </div>
                </div>
                <!-- Credit Settings: Unified (Supplier / Customer) -->
                <div style="margin-top:18px;" class="border-t pt-6">
                    <h3 class="text-2xl font-bold mb-3">Credit Settings ${tooltipHTML('Select Suppliers or Customers to view configured credit days, credit limits, outstanding and overdue status.')}</h3>
                    <div class="mb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div class="flex items-center gap-3">
                            <label class="text-sm text-gray-600">Entity</label>
                            <select id="creditEntityType" class="border rounded p-2">
                                <option value="suppliers">Suppliers</option>
                                <option value="customers">Customers</option>
                            </select>
                            <label class="text-sm text-gray-600">Select</label>
                            <select id="creditEntitySelect" class="border rounded p-2 min-w-[220px]"><option value="">-- All --</option></select>
                        </div>
                        <div>
                            <button id="refreshCreditTableBtn" type="button" class="bg-blue-600 text-white px-3 py-2 rounded text-sm">Refresh</button>
                        </div>
                    </div>
                    <div id="creditTableContainer" class="w-full overflow-auto">
                        <table id="creditTable" class="w-full text-sm text-left border-collapse" style="table-layout: auto;">
                            <thead>
                                <tr class="bg-gray-100 text-xs text-gray-700">
                                    <th class="p-2 border">Name</th>
                                    <th class="p-2 border">Credit Days (Net)</th>
                                    <th class="p-2 border">Credit Limit (₹)</th>
                                    <th class="p-2 border">Outstanding (₹)</th>
                                    <th class="p-2 border">Overdue (days)</th>
                                    <th class="p-2 border">Status</th>
                                    <th class="p-2 border">Actions</th>
                                </tr>
                            </thead>
                            <tbody id="creditTableBody">
                                <!-- Populated dynamically -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`,
        testimonials: `<div><h3 class="text-2xl font-bold mb-6">Manage Testimonials</h3><div id="adminTestimonialsList" class="space-y-4"></div></div>`,
        reports: `<div id="adminReportsContainer"></div>`,
        local_sale: `<div id="adminLocalSaleContainer"></div>`,
        returns: `<div id="adminReturnsContainer"></div>`,
    ledgers: `<div id="adminLedgersContainer"></div>`,
    // Visible 'Transactions' tab should show the same ledgers container
    transactions: `<div id="adminLedgersContainer"></div>`,
        settings: settingsFormHTML,
    };

    // Move scrolling bar controls from Settings into Media tab at runtime
    const scrollingBarFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-4">Scrolling Announcement Bar</h3>
            <div class="space-y-4">
                <div>
                    <label for="scrollingBarText" class="block text-sm font-medium text-gray-700 mb-1">Display Text</label>
                    <input type="text" id="scrollingBarText" value="${state.siteSettings.scrollingBarText}" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-sm font-medium text-gray-700">Show Scrolling Bar</span>
                    <label class="toggle-switch"><input type="checkbox" id="scrollingBarVisible" ${state.siteSettings.isScrollingBarVisible ? 'checked' : ''}><span class="toggle-slider"></span></label>
                </div>
            </div>
        </div>`;

    // Append to media tab content
    tabsContent.media = (tabsContent.media || '') + scrollingBarFormHTML;

    // Remove the scrolling bar block from settings HTML (if present)
    tabsContent.settings = (tabsContent.settings || '').replace(/<hr>\s*<div>\s*<h3 class=\"text-2xl font-bold mb-4\">Scrolling Announcement Bar[\s\S]*?<\/div>\s*<\/div>/, '');
    // Also remove any other variants (different spacing/containers) by stripping from the <hr> up to the following section
    tabsContent.settings = tabsContent.settings.replace(/<hr>[\s\S]*?<div class="mt-8 border-t pt-6/, '<div class="mt-8 border-t pt-6');

    pageContent.innerHTML = `<div class="container mx-auto px-6 py-12"><div class="flex justify-between items-center mb-8"><h2 class="text-4xl font-playfair">Admin Panel</h2><button data-page="home" class="nav-btn bg-gray-800 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-900 transition duration-300">View Store</button></div><div class="border-b border-gray-200 mb-8"><nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs"><a href="#" data-tab="orders" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'orders' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Orders</a><a href="#" data-tab="products" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'products' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Products</a><a href="#" data-tab="product_groups" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'product_groups' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Product Groups</a><a href="#" data-tab="purchases" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'purchases' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Purchases</a><a href="#" data-tab="audit" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'audit' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Audit</a><a href="#" data-tab="media" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'media' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Media</a><a href="#" data-tab="testimonials" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'testimonials' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Testimonials</a><a href="#" data-tab="reports" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'reports' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Billing & Reports</a><a href="#" data-tab="billing_settings" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'billing_settings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Billing Settings</a><a href="#" data-tab="local_sale" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'local_sale' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Local Sale</a><a href="#" data-tab="returns" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'returns' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Returns</a><a href="#" data-tab="transactions" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'transactions' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Transactions</a><a href="#" data-tab="settings" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'settings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Settings</a></nav></div><div id="adminTabContent">${tabsContent[state.adminCurrentTab]}</div></div>`;

    if (state.adminCurrentTab === 'orders') renderAdminOrderList();
    else if (state.adminCurrentTab === 'products') renderAdminProductList();
    else if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage();
    else if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
    else if (state.adminCurrentTab === 'media') { renderAdminMediaPage(); }
    else if (state.adminCurrentTab === 'testimonials') renderAdminTestimonialsList();
    else if (state.adminCurrentTab === 'reports') renderAdminBillingPage();
    else if (state.adminCurrentTab === 'billing_settings') renderAdminBillingSettings();
    else if (state.adminCurrentTab === 'local_sale') renderLocalSalePage();
    else if (state.adminCurrentTab === 'returns') renderAdminReturnsPage();
    else if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
    else if (state.adminCurrentTab === 'settings') { /* no gallery here anymore */ }

    // --- Billing Settings: Supplier Credit Helpers & Renderer ---
    function _toDate(ts) {
        try {
            if (!ts) return null;
            if (ts instanceof Date) return ts;
            if (typeof ts === 'number') return new Date(ts);
            if (typeof ts.toDate === 'function') return ts.toDate();
            if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
            if (typeof ts === 'string') return new Date(ts);
            return null;
        } catch (e) { return null; }
    }

    function computeSupplierOutstandingAndOverdue(supplierName) {
        try {
            const all = (state.allCreditorsLedger || []).filter(x => !x.isDeleted && (x.partyName||'').trim().toLowerCase() === (supplierName||'').trim().toLowerCase());
            // Purchase-origin entries (bills)
            const purchaseEntries = all.filter(e => (e.refType||'').toLowerCase().includes('purchase'));
            const byRef = {};
            for (const e of purchaseEntries) {
                const refId = e.refId || e.id || ('ref_' + (e.id||Math.random()));
                if (!byRef[refId]) byRef[refId] = { refId, invoice: e.invoiceNumber || '', date: e.date || e.createdAt || null, credit: 0, paid: 0 };
                byRef[refId].credit += Number(e.credit || 0);
            }
            // Payments/debits that reference these refIds
            const payments = all.filter(e => Number(e.debit || 0) > 0);
            for (const p of payments) {
                const refId = p.refId || p.id;
                if (refId && byRef[refId]) byRef[refId].paid += Number(p.debit || 0);
            }
            const bills = Object.values(byRef).map(b => ({
                refId: b.refId,
                invoice: b.invoice,
                date: _toDate(b.date) || null,
                outstanding: Math.round(((b.credit || 0) - (b.paid || 0) + Number.EPSILON) * 100) / 100
            })).filter(b => b.outstanding > 0).sort((a,b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
            const totalOutstanding = bills.reduce((acc,b)=>acc + b.outstanding, 0);
            return { totalOutstanding: Math.round((totalOutstanding+Number.EPSILON)*100)/100, bills };
        } catch (err) { console.error('computeSupplierOutstandingAndOverdue error', err); return { totalOutstanding: 0, bills: [] }; }
    }

    function computeCustomerOutstandingAndOverdue(customerName) {
        try {
            const all = (state.allDebtorsLedger || []).filter(x => !x.isDeleted && (x.partyName||'').trim().toLowerCase() === (customerName||'').trim().toLowerCase());
            // Sales-origin entries (invoices)
            const saleEntries = all.filter(e => { const t=(e.refType||'').toLowerCase(); return t.includes('sale') || t.includes('invoice') || t.includes('local'); });
            const byRef = {};
            for (const e of saleEntries) {
                const refId = e.refId || e.id || ('ref_' + (e.id||Math.random()));
                if (!byRef[refId]) byRef[refId] = { refId, invoice: e.invoiceNumber || '', date: e.date || e.createdAt || null, debit: 0, received: 0 };
                byRef[refId].debit += Number(e.debit || 0);
            }
            // Receipts (credits) against these refIds
            const receipts = all.filter(e => Number(e.credit || 0) > 0);
            for (const r of receipts) {
                const refId = r.refId || r.id;
                if (refId && byRef[refId]) byRef[refId].received += Number(r.credit || 0);
            }
            const bills = Object.values(byRef).map(b => ({
                refId: b.refId,
                invoice: b.invoice,
                date: _toDate(b.date) || null,
                outstanding: Math.round(((b.debit || 0) - (b.received || 0) + Number.EPSILON) * 100) / 100
            })).filter(b => b.outstanding > 0).sort((a,b) => (b.date ? b.date.getTime() : 0) - (a.date ? a.date.getTime() : 0));
            const totalOutstanding = bills.reduce((acc,b)=>acc + b.outstanding, 0);
            return { totalOutstanding: Math.round((totalOutstanding+Number.EPSILON)*100)/100, bills };
        } catch (err) { console.error('computeCustomerOutstandingAndOverdue error', err); return { totalOutstanding: 0, bills: [] }; }
    }

    function renderAdminBillingSettings() {
        try {
            const tbody = document.getElementById('creditTableBody');
            if (!tbody) return;
            const entityTypeEl = document.getElementById('creditEntityType');
            const entitySelectEl = document.getElementById('creditEntitySelect');
            const entityType = (entityTypeEl?.value || 'suppliers');

            // Populate entity select options
            const items = entityType === 'customers' ? (state.allCustomers || []) : (state.allSuppliers || []);
            // Build options (include -- All --)
            if (entitySelectEl) {
                const prev = entitySelectEl.value;
                entitySelectEl.innerHTML = '<option value="">-- All --</option>' + (items.filter(i=>!i.isDeleted).sort((a,b)=>((a.name||'').toLowerCase()> (b.name||'').toLowerCase()?1:-1)).map(function(i){ return '<option value="' + escapeHtml(i.name || '') + '">' + escapeHtml(i.name || '') + '</option>'; }).join(''));
                // restore previous selection if still present
                try { if (prev) entitySelectEl.value = prev; } catch(_) {}
            }

            const selectedName = (entitySelectEl?.value || '').trim();
            const listToRender = selectedName ? items.filter(i => ((i.name||'').trim().toLowerCase() === selectedName.toLowerCase())) : items.filter(i=>!i.isDeleted);

            const rows = listToRender.map(s => {
                const name = s.name || '';
                const creditDays = (typeof s.creditDays === 'number') ? s.creditDays : (s.creditDays ? Number(s.creditDays) : 0);
                const creditLimit = (typeof s.creditLimit === 'number') ? s.creditLimit : (s.creditLimit ? Number(s.creditLimit) : 0);
                const totals = entityType === 'customers' ? computeCustomerOutstandingAndOverdue(name) : computeSupplierOutstandingAndOverdue(name);
                const outstanding = totals.totalOutstanding || 0;
                let maxOverdueDays = 0;
                const today = new Date();
                for (const b of totals.bills) {
                    const billDate = b.date || new Date();
                    const ageDays = Math.floor((today.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
                    const overdue = Math.max(0, ageDays - (creditDays || 0));
                    if (overdue > maxOverdueDays) maxOverdueDays = overdue;
                }
                let status = 'OK';
                if ((creditLimit || 0) > 0 && outstanding > (creditLimit || 0)) status = 'OVER LIMIT';
                if (maxOverdueDays > 0) status = status === 'OK' ? 'OVERDUE' : (status + ' / OVERDUE');
                const statusClass = status.includes('OVER') ? 'text-red-600 font-semibold' : 'text-green-600';
                return `<tr class="border-b hover:bg-gray-50" data-id="${s.id||''}" data-type="${entityType}"><td class="p-2 align-top">${escapeHtml(name)}</td><td class="p-2 align-top">${creditDays || ''}</td><td class="p-2 align-top">${creditLimit ? Number(creditLimit).toFixed(2) : ''}</td><td class="p-2 align-top">${outstanding ? Number(outstanding).toFixed(2) : '0.00'}</td><td class="p-2 align-top">${maxOverdueDays || ''}</td><td class="p-2 align-top"><span class="${statusClass}">${status}</span></td><td class="p-2 align-top"><button type="button" class="credit-edit-btn px-2 py-1 bg-gray-200 rounded text-sm" data-id="${s.id||''}" data-type="${entityType}" data-name="${escapeHtml(name)}" data-credit-days="${creditDays || ''}" data-credit-limit="${creditLimit || ''}">Edit</button></td></tr>`;
            }).join('');

            tbody.innerHTML = rows || '<tr><td class="p-2" colspan="7"><div class="text-gray-500">No entries found.</div></td></tr>';

            // Attach refresh handler (single button)
            const refreshBtn = document.getElementById('refreshCreditTableBtn');
            if (refreshBtn && !refreshBtn._attached) {
                refreshBtn.addEventListener('click', () => renderAdminBillingSettings());
                refreshBtn._attached = true;
            }

            // Attach change handlers for selectors
            if (entityTypeEl && !entityTypeEl._attached) {
                entityTypeEl.addEventListener('change', () => renderAdminBillingSettings());
                entityTypeEl._attached = true;
            }
            if (entitySelectEl && !entitySelectEl._attached) {
                entitySelectEl.addEventListener('change', () => renderAdminBillingSettings());
                entitySelectEl._attached = true;
            }

            // Attach delegated click handler for Edit buttons in credit table
            try {
                const container = document.getElementById('creditTableContainer');
                if (container && !container._creditEditAttached) {
                    container.addEventListener('click', async (ev) => {
                        const btn = ev.target && ev.target.closest ? ev.target.closest('.credit-edit-btn') : null;
                        if (!btn) return;
                        ev.preventDefault();
                        const id = btn.dataset && btn.dataset.id;
                        const type = btn.dataset && btn.dataset.type; // 'suppliers' or 'customers'
                        const name = btn.dataset && btn.dataset.name;
                        const currentDays = btn.dataset && btn.dataset.creditDays;
                        const currentLimit = btn.dataset && btn.dataset.creditLimit;
                        openCreditEditModal(type, id, name, currentDays, currentLimit);
                    });
                    container._creditEditAttached = true;
                }
            } catch (_) {}
        } catch (err) { console.error('renderAdminBillingSettings error', err); }
    }

    try { if (typeof window !== 'undefined') window.renderAdminBillingSettings = renderAdminBillingSettings; } catch(_){}
    attachAdminListeners();
    // Inject optional Auth-deletion controls into the Danger Zone if present (added dynamically to avoid editing large template strings)
    // deleteAuth UI injection removed: master-reset and selection-reset
    // features are disabled. If needed for emulator-only testing, add a
    // controlled helper under functions/.tools instead of injecting
    // destructive controls into the live admin UI.
}

function renderAdminBillingPage() {
    const container = document.getElementById('adminReportsContainer');
    if (!container) return;
    try {
    
    const startDate = new Date(state.registerStartDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(state.registerEndDate);
    endDate.setHours(23, 59, 59, 999);

    // --- Purchase & Sales Register ---
    const salesEntries = (state.allOrders || [])
        .filter(order => {
            const orderDate = _toDate(order.orderDate);
            if (!orderDate) return false;
            return orderDate >= startDate && orderDate <= endDate;
        })
        .map(order => ({
            date: _toDate(order.orderDate) || new Date(),
            id: order.id,
            invoiceNumber: order.invoiceNumber,
            type: 'Sale',
            details: `To: ${order.shippingInfo?.fullName || 'Customer'}`,
            itemCount: (order.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0),
            debit: 0,
            credit: order.totalAmount || 0,
        }));

    const purchaseEntries = (state.allPurchases || [])
        .filter(purchase => {
            // **MODIFIED:** Exclude deleted purchases from register
            if (purchase.isDeleted) return false;
            const purchaseDate = _toDate(purchase.purchaseDate);
            if (!purchaseDate) return false;
            return purchaseDate >= startDate && purchaseDate <= endDate;
        })
        .map(purchase => ({
            date: _toDate(purchase.purchaseDate) || new Date(),
            id: purchase.id,
            invoiceNumber: purchase.invoiceNumber,
            type: 'Purchase',
            details: `From: ${purchase.supplierName || ''}`,
            itemCount: (purchase.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0),
            debit: purchase.totalAmount || 0,
            credit: 0,
        }));
    
    // Sales Returns (reduce revenue)
    const salesReturnEntries = (state.allSalesReturns || [])
        .filter(ret => {
            const date = _toDate(ret.returnDate) || null;
            if (!date) return false;
            return date >= startDate && date <= endDate;
        })
        .map(ret => ({
            date: _toDate(ret.returnDate) || new Date(),
            id: ret.id,
            invoiceNumber: ret.creditNoteNumber || ret.id,
            type: 'Sales Return',
            details: `From: ${ret.customerName || ret.orderShippingName || 'Customer'}`,
            itemCount: (ret.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0),
            debit: ret.totalAmount || 0,
            credit: 0,
        }));

    // Purchase Returns (reduce cost)
    const purchaseReturnEntries = (state.allPurchaseReturns || [])
        .filter(ret => {
            const date = _toDate(ret.returnDate) || null;
            if (!date) return false;
            return date >= startDate && date <= endDate;
        })
        .map(ret => ({
            date: _toDate(ret.returnDate) || new Date(),
            id: ret.id,
            invoiceNumber: ret.debitNoteNumber || ret.id,
            type: 'Purchase Return',
            details: `To: ${ret.supplierName || 'Supplier'}`,
            itemCount: (ret.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0),
            debit: 0,
            credit: ret.totalAmount || 0,
        }));
    
    const localSalesEntries = (state.allLocalSales || [])
             .filter(sale => {
                const saleDate = _toDate(sale.saleDate);
                if (!saleDate) return false;
                return saleDate >= startDate && saleDate <= endDate;
            })
            .map(sale => ({
                date: _toDate(sale.saleDate) || new Date(),
                id: sale.id,
                invoiceNumber: sale.invoiceNumber,
                type: 'Local Sale',
                details: `To: ${sale.customerName || ''}`,
                itemCount: (sale.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0),
                debit: 0,
                credit: sale.totalAmount || 0,
            }));

    let combinedEntries;
    if (state.registerFilter === 'sales') {
        combinedEntries = [...salesEntries, ...localSalesEntries, ...salesReturnEntries];
    } else if (state.registerFilter === 'purchases') {
        combinedEntries = [...purchaseEntries, ...purchaseReturnEntries];
    } else {
        combinedEntries = [...salesEntries, ...purchaseEntries, ...localSalesEntries, ...salesReturnEntries, ...purchaseReturnEntries];
    }
    
    combinedEntries.sort((a, b) => a.date - b.date);

    // Totals for full (filtered) register
    const totalDebit = combinedEntries.reduce((acc, e) => acc + (e.debit || 0), 0);
    const totalCredit = combinedEntries.reduce((acc, e) => acc + (e.credit || 0), 0);
    const finalBalanceTotal = totalCredit - totalDebit;

    // Pagination for register
    const rpSize = Math.max(5, parseInt(state.registerPageSize || 25));
    const rp = Math.max(1, parseInt(state.registerPage || 1));
    const regTotalPages = Math.max(1, Math.ceil(combinedEntries.length / rpSize));
    const regPage = Math.min(rp, regTotalPages);
    if (regPage !== state.registerPage) state.registerPage = regPage;
    const startIdx = (regPage - 1) * rpSize;
    const pagedEntries = combinedEntries.slice(startIdx, startIdx + rpSize);

    let runningBalance = combinedEntries.slice(0, startIdx).reduce((acc, e) => acc + (e.credit || 0) - (e.debit || 0), 0);
    const registerRowsHTML = pagedEntries.map(entry => {
        runningBalance += entry.credit - entry.debit;
        const typeClass = entry.type === 'Sale' || entry.type === 'Local Sale' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        return `
            <tr class="border-b text-xs">
                <td class="p-3">${formatDate(entry.date)}</td>
                <td class="p-3 font-mono">${entry.invoiceNumber || entry.id.substring(0,8)}</td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold ${typeClass}">
                        ${entry.type}
                    </span>
                </td>
                <td class="p-3">${entry.details}</td>
                <td class="p-3 text-center">${entry.itemCount}</td>
                <td class="p-3 text-right text-red-600">${entry.debit > 0 ? formatMoney(entry.debit) : '-'}</td>
                <td class="p-3 text-right text-green-600">${entry.credit > 0 ? formatMoney(entry.credit) : '-'}</td>
                <td class="p-3 text-right font-bold">${formatMoney(runningBalance)}</td>
            </tr>
        `;
    }).join('');

    const dateRangeSelectorHTML = `
        <div class="flex items-end space-x-4 mb-4">
            <div>
                <label for="registerStartDate" class="block text-sm font-medium text-gray-700">Start Date</label>
                <input type="date" id="registerStartDate" value="${state.registerStartDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
            </div>
            <div>
                <label for="registerEndDate" class="block text-sm font-medium text-gray-700">End Date</label>
                <input type="date" id="registerEndDate" value="${state.registerEndDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
            </div>
            <button id="applyDateFilterBtn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition">Apply Filter</button>
        </div>
    `;
    
    // Attach delegated handlers once to the container so buttons/inputs keep working after re-renders
    try {
        if (!container.dataset.delegationAttached) {
            // Click delegation for quick-add buttons and modal cancel
            container.addEventListener('click', (ev) => {
                const btn = ev.target.closest && ev.target.closest('button') ? ev.target.closest('button') : ev.target;
                if (!btn) return;
                const id = btn.id || '';
                try {
                    if (id === 'addCashDebitBtn') { ev.preventDefault(); openLedgerEntryModal('cash', 'debit'); return; }
                    if (id === 'addCashCreditBtn') { ev.preventDefault(); openLedgerEntryModal('cash', 'credit'); return; }
                    if (id === 'addBankDebitBtn') { ev.preventDefault(); openLedgerEntryModal('bank', 'debit'); return; }
                    if (id === 'addBankCreditBtn') { ev.preventDefault(); openLedgerEntryModal('bank', 'credit'); return; }
                    if (id === 'ledgerEntryCancelBtn') { ev.preventDefault(); closeLedgerEntryModal(); return; }
                    // supplier quick buttons
                    if (btn.classList && btn.classList.contains('pay-supplier-btn')) { ev.preventDefault(); const party = btn.getAttribute('data-party')||''; const amount = btn.getAttribute('data-amount')||''; const spPartyEl = document.getElementById('spParty'); const spAmountEl = document.getElementById('spAmount'); if (spPartyEl) spPartyEl.value = party; if (spAmountEl) spAmountEl.value = Number(amount).toFixed(2); spAmountEl?.focus(); return; }
                    if (btn.classList && btn.classList.contains('receive-customer-btn')) { ev.preventDefault(); const party = btn.getAttribute('data-party')||''; const amount = btn.getAttribute('data-amount')||''; const crPartyEl = document.getElementById('crParty'); const crAmountEl = document.getElementById('crAmount'); if (crPartyEl) crPartyEl.value = party; if (crAmountEl) crAmountEl.value = Number(amount).toFixed(2); crAmountEl?.focus(); return; }
                } catch (e) { /* ignore handler errors */ }
            });

            // Submit delegation for the ledger entry form (modal)
            container.addEventListener('submit', async (ev) => {
                try {
                    if (!ev.target || ev.target.id !== 'ledgerEntryForm') return;
                    ev.preventDefault();
                    const submitBtn = document.getElementById('ledgerEntrySubmitBtn');
                    const addBtns = [document.getElementById('addCashDebitBtn'), document.getElementById('addCashCreditBtn'), document.getElementById('addBankDebitBtn'), document.getElementById('addBankCreditBtn')];
                    const originalText = submitBtn ? submitBtn.textContent : '';
                    try {
                        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
                        addBtns.forEach(b => { try { if (b) b.disabled = true; } catch(_){} });

                        const target = (document.getElementById('ledgerEntryTarget')?.value || 'cash');
                        const type = (document.getElementById('ledgerEntryType')?.value || 'debit');
                        const raw = (document.getElementById('ledgerEntryAmount')?.value || '').toString();
                        const amount = parseFloat(raw.replace(/,/g, '')) || 0;
                        if (amount <= 0) { showMessage('Please enter a positive amount.'); return; }
                        const notes = (document.getElementById('ledgerEntryNotes')?.value || '').trim();
                        const dateVal = (document.getElementById('ledgerEntryDate')?.value || '');
                        const date = dateVal ? new Date(dateVal) : new Date();
                        if (target === 'cash') {
                            await addDoc(collection(db, cashLedgerColPath), { date, refType: 'Manual', refId: '', notes, debit: type === 'debit' ? amount : 0, credit: type === 'credit' ? amount : 0, isDeleted: false, createdAt: serverTimestamp() });
                        } else {
                            const bankAccount = (document.getElementById('ledgerEntryBankAccount')?.value || (state.bankAccountFilter || 'Main Bank'));
                            await addDoc(collection(db, bankLedgerColPath), { date, refType: 'Manual', refId: '', bankAccount, notes, debit: type === 'debit' ? amount : 0, credit: type === 'credit' ? amount : 0, isDeleted: false, createdAt: serverTimestamp() });
                        }
                        showToast('Ledger entry saved', [`${type === 'debit' ? 'Debit' : 'Credit'} ₹${amount.toFixed(2)} recorded`], { ttl: 4000 });
                        closeLedgerEntryModal();
                        renderAdminLedgersPage();
                    } catch (err) {
                        console.error('Ledger entry save failed', err);
                        showMessage('Failed to save ledger entry.');
                    } finally {
                        try { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Save'; } addBtns.forEach(b => { try { if (b) b.disabled = false; } catch(_){} }); } catch(_){}
                    }
                } catch (err) { console.error('Delegated submit handler error', err); }
            });

            container.dataset.delegationAttached = '1';
        }
    } catch (err) { console.error('Failed to attach delegated admin listeners', err); }

    // Ledger handlers are attached after the admin ledgers page is rendered (see renderAdminLedgersPage)

    const filterButtonsHTML = `
        <div class="flex space-x-2 mb-4">
            <button data-filter="all" class="register-filter-btn px-4 py-1 text-sm rounded-md ${state.registerFilter === 'all' ? 'bg-black text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">All Transactions</button>
            <button data-filter="sales" class="register-filter-btn px-4 py-1 text-sm rounded-md ${state.registerFilter === 'sales' ? 'bg-black text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">Sales Only</button>
            <button data-filter="purchases" class="register-filter-btn px-4 py-1 text-sm rounded-md ${state.registerFilter === 'purchases' ? 'bg-black text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}">Purchases Only</button>
        </div>
    `;

    const includeArchivedHTML = `
        <div class="flex items-center gap-2 mb-2">
            <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" id="includeArchivedToggle" ${state.reportsIncludeArchived ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black" />
                Include archived data (ignores visibility reset)
            </label>
        </div>`;

    const registerPaginationHTML = `
        <div class="flex items-center justify-between mt-3 text-xs">
            <div class="flex items-center gap-2">
                <span>Rows per page:</span>
                <select id="registerPageSize" class="border rounded p-1">
                    ${[10,25,50,100].map(n => `<option value="${n}" ${rpSize===n?'selected':''}>${n}</option>`).join('')}
                </select>
            </div>
            <div class="flex items-center gap-2">
                <span>Showing ${combinedEntries.length === 0 ? 0 : startIdx + 1}–${Math.min(startIdx + rpSize, combinedEntries.length)} of ${combinedEntries.length}</span>
                <button id="registerPrev" class="px-2 py-1 border rounded ${regPage<=1?'opacity-50 cursor-not-allowed':''}">Prev</button>
                <button id="registerNext" class="px-2 py-1 border rounded ${regPage>=regTotalPages?'opacity-50 cursor-not-allowed':''}">Next</button>
            </div>
        </div>`;

    const registerHTML = `
        <div id="registerReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
             <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">Purchase & Sales Register ${tooltipHTML('Register view summarising purchases and sales for the selected period.')}</h3>
                <div class="flex space-x-2">
                    <button id="printRegisterBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                    <button id="exportRegisterBtn" class="bg-green-100 text-green-700 font-semibold py-2 px-4 rounded-md hover:bg-green-200 transition text-sm flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
                </div>
            </div>
            ${includeArchivedHTML}
            ${dateRangeSelectorHTML}
            ${filterButtonsHTML}
            <div class="overflow-x-auto">
                <table id="registerTable" class="w-full text-sm text-left">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="p-3">Date</th>
                            <th class="p-3">Invoice #</th>
                            <th class="p-3">Type</th>
                            <th class="p-3">Details</th>
                            <th class="p-3 text-center">Items</th>
                            <th class="p-3 text-right">Debit (₹)</th>
                            <th class="p-3 text-right">Credit (₹)</th>
                            <th class="p-3 text-right">Balance (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                       ${registerRowsHTML}
                    </tbody>
                    <tfoot>
                        <tr class="bg-gray-50 font-semibold">
                            <td class="p-3" colspan="5">Totals</td>
                            <td class="p-3 text-right text-red-700">${formatMoney(totalDebit)}</td>
                            <td class="p-3 text-right text-green-700">${formatMoney(totalCredit)}</td>
                            <td class="p-3 text-right">${formatMoney(finalBalanceTotal)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            ${registerPaginationHTML}
        </div>
    `;

    // --- GST Summary (aligned to the same date range as the register) ---
    const src = getReportArrays();
    const ordersInRange = (src.orders || []).filter(o => {
        const d = _toDate(o.orderDate) || null;
        if (!d) return false;
        return d >= startDate && d <= endDate;
    });
    const localSalesInRange = (src.localSales || []).filter(s => {
        const d = _toDate(s.saleDate) || null;
        if (!d) return false;
        return d >= startDate && d <= endDate;
    });
    const purchasesInRange = (src.purchases || []).filter(p => {
        if (p.isDeleted) return false;
        const d = _toDate(p.purchaseDate) || null;
        if (!d) return false;
        return d >= startDate && d <= endDate;
    });

    // If GST calculations are disabled globally, show zero GST collected/paid
    const gstEnabled = !!state.siteSettings.isGstEnabled;
    // Sales GST should only be reported when GST calculations are enabled.
    const salesGstCollected = gstEnabled
        ? ordersInRange.reduce((sum, o) => sum + (o.gstBreakdown?.total || 0), 0)
            + localSalesInRange.reduce((sum, s) => sum + (s.gstBreakdown?.total || 0), 0)
        : 0;
    // Purchase GST paid should be shown even when GST calculations are turned off
    // (treated as part of cost but visible to admins for reconciliation).
    const purchaseGstPaid = purchasesInRange.reduce((sum, p) => sum + (p.gstBreakdown?.total || 0), 0);
    const merchantReg = !!state.siteSettings.merchantGstRegistered;
    const netGst = merchantReg ? (salesGstCollected - purchaseGstPaid) : 0;

    const gstReportHTML = `
        <div id="gstReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">GST Summary ${tooltipHTML('Summary of GST collected and paid, grouped by rate and type.')}</h3>
                <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${merchantReg ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}">
                    ${merchantReg ? 'Merchant GST Registered' : 'Not GST Registered'}
                </span>
            </div>
            ${merchantReg ? '' : '<p class="text-xs text-gray-500 mb-4">Sales GST is not charged; purchase GST is treated as part of item cost. Net GST not applicable.</p>'}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-700">₹${formatMoney(salesGstCollected)}</p>
                    <p class="text-sm text-gray-500">Sales GST Collected</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-red-700">₹${formatMoney(purchaseGstPaid)}</p>
                    <p class="text-sm text-gray-500">Purchase GST Paid</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md ${merchantReg ? '' : 'opacity-60'}">
                    <p class="text-2xl font-bold ${netGst >= 0 ? 'text-indigo-700' : 'text-orange-700'}">₹${merchantReg ? formatMoney(netGst) : '—'}</p>
                    <p class="text-sm text-gray-500">Net GST ${merchantReg ? '(Payable/Refundable)' : '(N/A)'}</p>
                </div>
            </div>
        </div>
    `;
    // --- Other Reports ---
    // Compute report arrays (optionally include archived via cached fetch)
    const source = getReportArrays();

    // Totals and profits with returns and local sales
    // Only include orders that have been shipped in sales aggregates
    const shippedOrders = (source.orders || []).filter(o => {
        const s = (o.status || '').toString().toLowerCase();
        return s === 'shipped';
    });
    const ordersRevenue = shippedOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const localSalesRevenue = source.localSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const salesReturnsTotal = source.salesReturns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

    let ordersCost = 0;
    shippedOrders.forEach(order => {
        (order.items || []).forEach(item => {
            const unitCost = (typeof item.costAtOrder === 'number') ? item.costAtOrder : ((state.products.find(p => p.id === item.id)?.purchasePrice) || 0);
            ordersCost += unitCost * (item.quantity || 0);
        });
    });

    let localSalesCost = 0;
    source.localSales.forEach(sale => {
        (sale.items || []).forEach(item => {
            const unitCost = (typeof item.costAtSale === 'number') ? item.costAtSale : ((state.products.find(p => p.id === item.id)?.purchasePrice) || 0);
            localSalesCost += unitCost * (item.quantity || 0);
        });
    });

    const grossRevenue = ordersRevenue + localSalesRevenue;
    const netRevenue = grossRevenue - salesReturnsTotal;
    const totalProfit = grossRevenue - (ordersCost + localSalesCost);

    const salesReportHTML = `
        <div id="salesReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">Sales Report ${tooltipHTML('Daily/period sales summary with totals and filters.')}</h3>
                <div>
                    <button id="printSalesReportBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-600">₹${formatMoney(grossRevenue)}</p>
                    <p class="text-sm text-gray-500">Gross Revenue (Orders + Local)</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold">${shippedOrders.length}</p>
                    <p class="text-sm text-gray-500">Orders (Shipped)</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-indigo-600">₹${formatMoney(netRevenue)}</p>
                    <p class="text-sm text-gray-500">Net Revenue (less Returns)</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-blue-600">₹${formatMoney(totalProfit)}</p>
                    <p class="text-sm text-gray-500">Estimated Profit</p>
                </div>
            </div>
           </div>
    `;
    // --- Party-wise Purchase & Sales Ledger ---
    const partyType = 'supplier';
    const partyLedgerPartyOptionsSuppliers = (state.allSuppliers || []).map(s => {
        const name = (s.name || '').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const gst = s.gstin ? (' • ' + s.gstin) : '';
        return `<option value="${name}" data-id="${s.id || ''}">${name}${gst}</option>`;
    }).join('');
    const partyLedgerPartyOptionsCustomers = (state.allCustomers || []).map(c => {
        const name = (c.name || '').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<option value="${name}" data-id="${c.id || ''}">${name}</option>`;
    }).join('');
    const partyLedgerHTML = `
        <div id="partyLedgerContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">Party-wise Purchase & Sales Ledger ${tooltipHTML('Generate ledger entries (purchases, sales, payments) for a selected party and date range.')}</h3>
                <div>
                    <button id="printPartyLedgerBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                    <button id="exportPartyLedgerBtn" class="bg-green-100 text-green-700 font-semibold py-2 px-4 rounded-md hover:bg-green-200 transition text-sm flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div class="md:col-span-1">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Party Type</label>
                    <select id="partyLedgerType" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="supplier">Supplier</option>
                        <option value="customer">Customer</option>
                    </select>
                </div>
                <div class="md:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Party</label>
                    <select id="partyLedgerSelect" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="">-- Select Party --</option>
                        ${partyLedgerPartyOptionsSuppliers}
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Rows</label>
                    <select id="partyLedgerRows" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="100">100</option>
                        <option value="500">500</option>
                        <option value="1000">1000</option>
                    </select>
                </div>
            </div>
            <div class="flex items-end space-x-4 mb-4">
                <div>
                    <label for="partyLedgerStartDate" class="block text-sm font-medium text-gray-700">Start Date</label>
                    <input type="date" id="partyLedgerStartDate" value="${state.registerStartDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>
                <div>
                    <label for="partyLedgerEndDate" class="block text-sm font-medium text-gray-700">End Date</label>
                    <input type="date" id="partyLedgerEndDate" value="${state.registerEndDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border">
                </div>
                <div class="flex items-center">
                    <button id="generatePartyLedgerBtn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-blue-700 transition">Generate</button>
                </div>
            </div>
            <div id="partyLedgerResultContainer" class="overflow-x-auto"></div>
        </div>
    `;
    
        // Inventory pagination: compute paged product rows (default page size = 10)
        const inventoryAll = (state.products || []).slice().sort((a,b) => (String(a.name || '')).localeCompare(String(b.name || '')));
        const ipSize = Math.max(1, parseInt(state.inventoryPageSize || 10));
        const ip = Math.max(1, parseInt(state.inventoryPage || 1));
        const inventoryTotalPages = Math.max(1, Math.ceil(inventoryAll.length / ipSize));
        const inventoryPage = Math.min(ip, inventoryTotalPages);
        if (inventoryPage !== state.inventoryPage) state.inventoryPage = inventoryPage;
        const inventoryStartIdx = (inventoryPage - 1) * ipSize;
        const inventoryPageItems = inventoryAll.slice(inventoryStartIdx, inventoryStartIdx + ipSize);
        const inventoryRowsHTML = inventoryPageItems.map(p => {
            const stock = p.stock || 0;
            const purchasePrice = p.purchasePrice || 0;
            const salePrice = p.salePrice || 0;
            const potentialProfit = (salePrice - purchasePrice) * stock;
            // Compute last purchase price and weighted average purchase price from purchase history
            let lastPrice = null;
            let avgPrice = null;
            try {
                const itemPurchases = (state.allPurchases || []).filter(pp => !pp.isDeleted && Array.isArray(pp.items) && pp.items.some(i => i.productId === p.id));
                if (itemPurchases.length > 0) {
                    // Collect all matching item entries
                    const entries = [];
                    for (const pur of itemPurchases) {
                        const pd = pur.purchaseDate ? new Date(pur.purchaseDate.seconds ? pur.purchaseDate.seconds * 1000 : pur.purchaseDate) : new Date(0);
                        for (const it of pur.items || []) {
                            if (it.productId === p.id) entries.push({ price: (typeof it.purchasePrice === 'number' ? it.purchasePrice : (typeof it.price === 'number' ? it.price : 0)), qty: (it.quantity || 0), date: pd });
                        }
                    }
                    // Last price = price from most recent entry
                    entries.sort((a,b) => b.date - a.date);
                    if (entries.length > 0) {
                        lastPrice = entries[0].price || 0;
                        // Weighted average
                        const totalQty = entries.reduce((s, e) => s + (e.qty || 0), 0) || entries.length;
                        const weightedSum = entries.reduce((s, e) => s + ((e.price || 0) * ((e.qty || 0) || 1)), 0);
                        avgPrice = totalQty > 0 ? (weightedSum / totalQty) : (weightedSum / entries.length || 0);
                    }
                }
            } catch (err) { /* ignore */ }
            let statusBadge = `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">In Stock</span>`;
            if(stock <= 0) {
                statusBadge = `<span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Out of Stock</span>`;
            } else if (stock < 5) {
                statusBadge = `<span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Low Stock</span>`;
            }
            return `
                <tr class="border-b">
                     <td class="p-3 font-semibold">${p.name}</td>
                     <td class="p-3">${formatMoney(purchasePrice)}${(lastPrice !== null || avgPrice !== null) ? `<div class="text-xs text-gray-500 mt-1">(${lastPrice !== null ? formatMoney(lastPrice) : '-'} / ${avgPrice !== null ? formatMoney(avgPrice) : '-'})</div>` : ''}</td>
                     <td class="p-3">${formatMoney(salePrice)}</td>
                     <td class="p-3 font-bold">${stock}</td>
                     <td class="p-3 text-green-600 font-semibold">${formatMoney(potentialProfit)}</td>
                     <td class="p-3">${statusBadge}</td>
                </tr>
            `; }).join('');

        const inventoryReportHTML = `
        <div id="inventoryReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">Inventory Report ${tooltipHTML('Current stock levels and valuation for listed products.')}</h3>
                <div class="flex space-x-2">
                     <button id="printInventoryBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                     <button id="exportInventoryBtn" class="bg-green-100 text-green-700 font-semibold py-2 px-4 rounded-md hover:bg-green-200 transition text-sm flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
                </div>
            </div>
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <label class="text-sm">Rows:</label>
                        <select id="inventoryPageSize" class="border rounded p-1">
                            <option value="10" ${ipSize===10?'selected':''}>10</option>
                            <option value="25" ${ipSize===25?'selected':''}>25</option>
                            <option value="50" ${ipSize===50?'selected':''}>50</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-2">
                        <button id="inventoryPrev" class="px-2 py-1 border rounded ${inventoryPage<=1?'opacity-50 cursor-not-allowed':''}">Prev</button>
                        <span class="text-sm">Page ${inventoryPage} / ${inventoryTotalPages}</span>
                        <button id="inventoryNext" class="px-2 py-1 border rounded ${inventoryPage>=inventoryTotalPages?'opacity-50 cursor-not-allowed':''}">Next</button>
                    </div>
                </div>
              <div class="overflow-x-auto">
                   <table id="inventoryTable" class="w-full text-sm text-left">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="p-3">Product Name</th>
                            <th class="p-3">Purchase Price (₹)</th>
                            <th class="p-3">Sale Price (₹)</th>
                            <th class="p-3">Stock Left</th>
                            <th class="p-3">Potential Profit (₹)</th>
                            <th class="p-3">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                       ${inventoryRowsHTML}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Billing filters (date + search)
    const bStart = new Date(state.billingStartDate); bStart.setHours(0,0,0,0);
    const bEnd = new Date(state.billingEndDate); bEnd.setHours(23,59,59,999);
    const search = (state.billingSearchText || '').toLowerCase();
    const billingOrdersAll = (state.allOrders || [])
        .filter(o => {
            const d = _toDate(o.orderDate) || null;
            if (!d) return false;
            return d >= bStart && d <= bEnd;
        })
        .filter(o => {
            if (!search) return true;
            const texts = [o.invoiceNumber || '', o.id || '', o.shippingInfo?.fullName || '', o.customerEmail || ''].map(s => String(s).toLowerCase());
            return texts.some(t => t.includes(search));
        })
        .sort((a,b) => {
            const da = _toDate(a.orderDate) || new Date(0);
            const db = _toDate(b.orderDate) || new Date(0);
            return db - da;
        });
    const bpSize = Math.max(5, parseInt(state.billingPageSize || 25));
    const bp = Math.max(1, parseInt(state.billingPage || 1));
    const billingTotalPages = Math.max(1, Math.ceil(billingOrdersAll.length / bpSize));
    const billingPage = Math.min(bp, billingTotalPages);
    if (billingPage !== state.billingPage) state.billingPage = billingPage;
    const billingStartIdx = (billingPage - 1) * bpSize;
    const billingOrders = billingOrdersAll.slice(billingStartIdx, billingStartIdx + bpSize);

    const billingControlsHTML = `
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
            <div class="flex items-end gap-3">
                <div>
                    <label for="billingStartDate" class="block text-sm font-medium text-gray-700">Start</label>
                    <input type="date" id="billingStartDate" value="${state.billingStartDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
                <div>
                    <label for="billingEndDate" class="block text-sm font-medium text-gray-700">End</label>
                    <input type="date" id="billingEndDate" value="${state.billingEndDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
                <div>
                    <label for="billingSearch" class="block text-sm font-medium text-gray-700">Search</label>
                    <input type="text" id="billingSearch" value="${state.billingSearchText}" placeholder="Invoice #, name, email" class="mt-1 block w-56 rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
            </div>
            <div class="flex items-center gap-2">
                <label class="hidden md:flex items-center gap-2 text-sm mr-2">
                    <input type="checkbox" id="includeArchivedToggleBilling" ${state.reportsIncludeArchived ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black" />
                    Include archived data
                </label>
                <button id="printBillingBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                <button id="exportBillingBtn" class="bg-green-100 text-green-700 font-semibold py-2 px-4 rounded-md hover:bg-green-200 transition text-sm flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
            </div>
        </div>`;

    const billingCount = billingOrders.length;
    const billingTotal = billingOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const billingPaginationHTML = `
        <div class="flex items-center justify-between mt-3 text-xs">
            <div class="flex items-center gap-2">
                <span>Rows per page:</span>
                <select id="billingPageSize" class="border rounded p-1">
                    ${[10,25,50,100].map(n => `<option value="${n}" ${bpSize===n?'selected':''}>${n}</option>`).join('')}
                </select>
            </div>
            <div class="flex items-center gap-2">
                <span>Showing ${billingOrdersAll.length === 0 ? 0 : billingStartIdx + 1}–${Math.min(billingStartIdx + bpSize, billingOrdersAll.length)} of ${billingOrdersAll.length}</span>
                <button id="billingPrev" class="px-2 py-1 border rounded ${billingPage<=1?'opacity-50 cursor-not-allowed':''}">Prev</button>
                <button id="billingNext" class="px-2 py-1 border rounded ${billingPage>=billingTotalPages?'opacity-50 cursor-not-allowed':''}">Next</button>
            </div>
        </div>`;

    const billingHTML = `
        <div id="billingContainer" class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-bold mb-6">Billing & Invoicing ${tooltipHTML('Settings and reports related to billing, invoices, returns, and receipts.')}</h3>
            ${billingControlsHTML}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold">${billingCount}</p>
                    <p class="text-sm text-gray-500">Invoices</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-600">₹${formatMoney(billingTotal)}</p>
                    <p class="text-sm text-gray-500">Total (filtered)</p>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table id="billingTable" class="w-full text-sm text-left">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="p-3">Invoice #</th>
                            <th class="p-3">Date</th>
                            <th class="p-3">Customer</th>
                            <th class="p-3">Email</th>
                            <th class="p-3">Total (₹)</th>
                            <th class="p-3">Invoice</th>
                        </tr>
                    </thead>
                     <tbody>
                       ${billingOrders.map(o => `
                                    <tr class="border-b">
                                         <td class="p-3 font-mono text-xs">${o.invoiceNumber || o.id}</td>
                                         <td class="p-3">${formatDate(o.orderDate)}</td>
                                         <td class="p-3">${o.shippingInfo.fullName}</td>
                                         <td class="p-3">${o.customerEmail || ''}</td>
                                         <td class="p-3 font-semibold">${formatMoney(o.totalAmount)}</td>
                                         <td class="p-3">
                                             <button data-page="invoice" data-id="${o.id}" class="nav-btn bg-blue-500 text-white text-xs font-semibold py-1 px-3 rounded-md hover:bg-blue-600">Generate</button>
                                         </td>
                                    </tr>
                                `).join('')}
                    </tbody>
                </table>
            </div>
            ${billingPaginationHTML}
        </div>
    `;

    container.innerHTML = registerHTML + gstReportHTML + salesReportHTML + partyLedgerHTML + inventoryReportHTML + billingHTML;
    try { attachReportListeners(); } catch (err) { console.error('attachReportListeners failed', err); }
    } catch (err) {
        console.error('renderAdminBillingPage failed', err);
        try {
            container.innerHTML = `<div class="bg-red-50 border border-red-200 p-6 rounded"> <h3 class="text-lg font-bold text-red-700">Failed to load Billing & Reports</h3><p class="text-sm text-gray-700 mt-2">An error occurred while rendering the reports. Check the console for details.</p><pre class="mt-3 text-xs text-red-600">${escapeHtml(String(err?.message || err))}</pre></div>`;
        } catch (_) { /* ignore */ }
    }
}

function renderAdminProductList() {
    const listEl = document.getElementById('adminProductList');
    if (!listEl) return;
    listEl.innerHTML = '';
    state.products.forEach(product => {
        const item = document.createElement('div');
        item.className = 'bg-white p-4 rounded-lg shadow-sm flex items-center justify-between';
        item.innerHTML = `<div class="flex items-center space-x-4"><img src="${product.image}" alt="${product.name}" class="w-16 h-16 object-cover rounded-md" onerror="this.onerror=null;this.src='https://placehold.co/100x100/f0f0f0/ccc?text=Image';"><div><p class="font-bold">${product.name}</p><p class="text-sm text-gray-500">Sale: ₹${Number(product.salePrice || 0).toFixed(2)} / Cost: ₹${Number(product.purchasePrice || 0).toFixed(2)} / Stock: ${product.stock || 0}</p></div></div><div class="flex space-x-2"><button data-id="${product.id}" class="edit-product-btn bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-pencil"></i></button><button data-id="${product.id}" class="delete-product-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-trash"></i></button></div>`;
        listEl.appendChild(item);
    });
}
        
function renderAdminProductGroupsPage() {
    const container = document.getElementById('adminProductGroupsContainer');
    if (!container) return;

    const groupFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 id="groupFormTitle" class="text-2xl font-bold mb-6">Add New Product Group</h3>
            <form id="groupForm" class="flex items-center gap-4">
                <input type="hidden" id="groupId">
                <div class="flex-grow">
                    <label for="groupName" class="sr-only">Group Name</label>
                    <input type="text" id="groupName" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Enter group name" required>
                </div>
                <div class="flex items-center space-x-2">
                    <button type="submit" id="groupFormSubmitBtn" class="bg-green-600 text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-green-700 transition">Add Group</button>
                    <button type="button" id="groupFormCancelBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition hidden">Cancel</button>
                </div>
            </form>
        </div>
    `;

    const groupListHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-bold mb-6">Manage Product Groups</h3>
            <div id="adminGroupList" class="space-y-4">
                ${state.productGroups.length > 0 ? state.productGroups.map(group => `
                    <div class="bg-gray-50 p-4 rounded-md flex items-center justify-between">
                        <p class="font-semibold">${group.name}</p>
                        <div class="flex space-x-2">
                            <button data-id="${group.id}" data-name="${group.name}" class="edit-group-btn bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-pencil"></i></button>
                            <button data-id="${group.id}" class="delete-group-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                `).join('') : '<p class="text-gray-500">No product groups created yet.</p>'}
            </div>
        </div>
    `;

    container.innerHTML = groupFormHTML + groupListHTML;

    document.getElementById('groupForm').addEventListener('submit', handleGroupFormSubmit);
    document.getElementById('groupFormCancelBtn').addEventListener('click', resetGroupForm);
    document.querySelectorAll('.edit-group-btn').forEach(btn => btn.addEventListener('click', handleEditGroupClick));
    document.querySelectorAll('.delete-group-btn').forEach(btn => btn.addEventListener('click', handleDeleteGroupClick));
}

function renderAdminMediaPage() {
    // Populate both media sections
    renderAdminSlideList();
    renderAdminGalleryList();
}

function renderAdminSlideList() {
    const listEl = document.getElementById('adminSlideList');
    if (!listEl) return;
    listEl.innerHTML = '';
    state.heroSlides.forEach(slide => {
        const item = document.createElement('div');
        item.className = 'bg-white p-4 rounded-lg shadow-sm flex items-center justify-between';
        item.innerHTML = `<div class="flex items-center space-x-4"><img src="${slide.imageUrl}" alt="${slide.headline}" class="w-24 h-12 object-cover rounded-md"><div><p class="font-bold">${slide.headline}</p><p class="text-sm text-gray-500">${slide.subtitle}</p></div></div><div class="flex space-x-2"><button data-id="${slide.id}" class="edit-slide-btn bg-blue-500 text-white p-2 rounded-full hover:bg-blue-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-pencil"></i></button><button data-id="${slide.id}" class="delete-slide-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-trash"></i></button></div>`;
        listEl.appendChild(item);
    });
}

function renderAdminOrderList() {
    const listEl = document.getElementById('adminOrderList');
    if (!listEl) return;
    
    // --- 1. Date Range & Filter Logic ---
    const startDate = new Date(state.ordersStartDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(state.ordersEndDate);
    endDate.setHours(23, 59, 59, 999);

    let filteredOrders = [...(state.allOrders || [])]
        .filter(order => {
            const orderDate = _toDate(order.orderDate);
            if (!orderDate) return false;
            return orderDate >= startDate && orderDate <= endDate;
        })
        .sort((a, b) => {
            const da = _toDate(a.orderDate) || new Date(0);
            const db = _toDate(b.orderDate) || new Date(0);
            return db - da;
        });

    if (state.adminOrderFilter !== 'All') {
        filteredOrders = filteredOrders.filter(order => order.status === state.adminOrderFilter);
    }
    
    // --- 2. Pagination ---
    const pageSize = Math.max(5, parseInt(state.ordersPageSize || 10));
    const currentPage = Math.max(1, parseInt(state.ordersPage || 1));
    const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
    const page = Math.min(currentPage, totalPages);
    if (page !== state.ordersPage) state.ordersPage = page;
    const startIdx = (page - 1) * pageSize;
    const pagedOrders = filteredOrders.slice(startIdx, startIdx + pageSize);

    // --- 3. Date Range & Filter Controls HTML ---
    const dateRangeHTML = `
        <div class="flex flex-wrap items-end gap-3 mb-4">
            <div>
                <label for="ordersStartDate" class="block text-sm font-medium text-gray-700">Start Date</label>
                <input type="date" id="ordersStartDate" value="${state.ordersStartDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" ${state.ordersUseToday ? 'disabled' : ''}>
            </div>
            <div>
                <label for="ordersEndDate" class="block text-sm font-medium text-gray-700">End Date</label>
                <input type="date" id="ordersEndDate" value="${state.ordersEndDate}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" ${state.ordersUseToday ? 'disabled' : ''}>
            </div>
            <div class="flex items-center gap-2">
                <input type="checkbox" id="ordersUseToday" ${state.ordersUseToday ? 'checked' : ''} class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black">
                <label for="ordersUseToday" class="text-sm text-gray-700">Today</label>
            </div>
            <div>
                <label for="orderStatusFilter" class="block text-sm font-medium text-gray-700">Status</label>
                <select id="orderStatusFilter" class="mt-1 w-40 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border">
                    <option value="All" ${state.adminOrderFilter === 'All' ? 'selected' : ''}>All Orders</option>
                    <option value="Pending" ${state.adminOrderFilter === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Shipped" ${state.adminOrderFilter === 'Shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="Delivered" ${state.adminOrderFilter === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="Cancelled" ${state.adminOrderFilter === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                </select>
            </div>
        </div>
    `;

    // --- 4. List Content Rendering ---
    let orderListHTML = '';
    if (pagedOrders.length === 0) {
        orderListHTML = `<p class="text-gray-500 text-center py-4">No ${state.adminOrderFilter !== 'All' ? state.adminOrderFilter : ''} orders found for the selected date range.</p>`;
    } else {
        orderListHTML = pagedOrders.map(order => 
            `<div class="bg-white p-4 rounded-lg shadow-sm">
                <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-center text-xs">
                    <div>
                        <p class="font-bold text-sm mb-1">Invoice #</p>
                        <p class="font-mono">${order.invoiceNumber || order.id}</p>
                        <p>${formatDate(order.orderDate)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Customer</p>
                        <p>${order.shippingInfo?.fullName || ''}</p>
                        <p class="text-xs text-gray-600"><span class="font-semibold">Email:</span> ${order.customerEmail || 'Not available'}</p>
                        ${order.shippingInfo?.address ? `<p class="text-gray-600">${order.shippingInfo.address}</p>` : ''}
                        <p class="text-gray-600">${order.shippingInfo?.city || ''}, ${order.shippingInfo?.state || ''} ${order.shippingInfo?.zip || ''}</p>
                        ${order.shippingInfo?.phone ? `<p class="text-gray-600"><span class=\"font-semibold\">Mobile:</span> ${order.shippingInfo.phone}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Total</p>
                        <p class="font-semibold text-base">₹${formatMoney(order.totalAmount || 0)}</p>
                        ${order.gstInfo?.applied ? '<span class="text-green-600 text-xs">(GST)</span>' : ''}
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Items</p>
                        <p>${(order.items || []).reduce((acc, item) => acc + (item.quantity || 0), 0)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Status</p>
                        <select data-order-id="${order.id}" data-user-id="${order.userId}" class="admin-order-status-selector w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border">
                            <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                            <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                            <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                            <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                        </select>
                    </div>
                </div>
            </div>`).join('');
    }
    
    // --- 5. Pagination Controls ---
    const paginationHTML = `
        <div class="flex items-center justify-between mt-4 text-sm">
            <div class="flex items-center gap-2">
                <span>Rows per page:</span>
                <select id="ordersPageSize" class="border rounded p-1">
                    ${[5,10,25,50].map(n => `<option value="${n}" ${pageSize===n?'selected':''}>${n}</option>`).join('')}
                </select>
            </div>
            <div class="flex items-center gap-2">
                <span>Showing ${filteredOrders.length === 0 ? 0 : startIdx + 1}–${Math.min(startIdx + pageSize, filteredOrders.length)} of ${filteredOrders.length}</span>
                <button id="ordersPrev" class="px-3 py-1 border rounded ${page<=1?'opacity-50 cursor-not-allowed':'hover:bg-gray-100'}">Prev</button>
                <span>Page ${page} / ${totalPages}</span>
                <button id="ordersNext" class="px-3 py-1 border rounded ${page>=totalPages?'opacity-50 cursor-not-allowed':'hover:bg-gray-100'}">Next</button>
            </div>
        </div>
    `;
    
    // --- 6. Render Final HTML ---
    listEl.innerHTML = dateRangeHTML + orderListHTML + paginationHTML;

    // --- 7. Attach Event Listeners ---
    // Date range changes
    document.getElementById('ordersStartDate')?.addEventListener('change', (e) => {
        state.ordersStartDate = e.target.value;
        state.ordersPage = 1;
        renderAdminOrderList();
    });
    document.getElementById('ordersEndDate')?.addEventListener('change', (e) => {
        state.ordersEndDate = e.target.value;
        state.ordersPage = 1;
        renderAdminOrderList();
    });
    
    // Today checkbox
    document.getElementById('ordersUseToday')?.addEventListener('change', (e) => {
        state.ordersUseToday = e.target.checked;
        if (state.ordersUseToday) {
            const today = new Date().toISOString().split('T')[0];
            state.ordersStartDate = today;
            state.ordersEndDate = today;
        }
        state.ordersPage = 1;
        renderAdminOrderList();
    });

    // Status filter
    document.getElementById('orderStatusFilter')?.addEventListener('change', (e) => {
        state.adminOrderFilter = e.target.value;
        state.ordersPage = 1;
        renderAdminOrderList();
    });

    // Pagination
    document.getElementById('ordersPrev')?.addEventListener('click', () => {
        if (state.ordersPage > 1) {
            state.ordersPage--;
            renderAdminOrderList();
        }
    });
    document.getElementById('ordersNext')?.addEventListener('click', () => {
        if (state.ordersPage < totalPages) {
            state.ordersPage++;
            renderAdminOrderList();
        }
    });
    document.getElementById('ordersPageSize')?.addEventListener('change', (e) => {
        state.ordersPageSize = parseInt(e.target.value) || 10;
        state.ordersPage = 1;
        renderAdminOrderList();
    });

    // Order status change listeners
    document.querySelectorAll('.admin-order-status-selector').forEach(selector => {
        selector.addEventListener('change', (e) => {
            const orderId = e.target.dataset.orderId;
            const userId = e.target.dataset.userId;
            const newStatus = e.target.value;
            updateOrderStatus(orderId, userId, newStatus);
        });
    });
}

function renderAdminGalleryList() {
    const listEl = document.getElementById('adminGalleryImageList');
    if (!listEl) return;
    if (state.galleryImages.length === 0) {
        listEl.innerHTML = `<p class="text-gray-500 text-center col-span-full py-4">No gallery images have been added yet.</p>`;
        return;
    }
    listEl.innerHTML = state.galleryImages.map(image => `<div class="relative group"><img src="${image.imageUrl}" class="w-full h-full object-cover rounded-lg aspect-square"><div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center"><button data-id="${image.id}" class="delete-gallery-image-btn bg-red-500 text-white rounded-full w-10 h-10 opacity-0 group-hover:opacity-100 transition-opacity"><i class="fa-solid fa-trash"></i></button></div></div>`).join('');
}

function renderAdminTestimonialsList() {
    const listEl = document.getElementById('adminTestimonialsList');
    if (!listEl) return;
    if (state.allTestimonials.length === 0) {
        listEl.innerHTML = `<p class="text-gray-500 text-center py-4">No testimonials submitted yet.</p>`;
        return;
    }
    const sortedTestimonials = [...state.allTestimonials].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    listEl.innerHTML = sortedTestimonials.map(t => {
        const approvedBadge = t.approved
            ? `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Approved</span>`
            : `<span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Pending</span>`;
        return `
            <div class="bg-white p-4 rounded-lg shadow-sm">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="flex items-center gap-4">
                        <p class="font-bold">${t.name}</p>
                        ${approvedBadge}
                        </div>
                        <div class="text-yellow-400 mt-1">
                            ${'<i class="fas fa-star"></i>'.repeat(t.rating)}
                            ${'<i class="far fa-star"></i>'.repeat(5 - t.rating)}
                        </div>
                        <p class="text-gray-600 mt-2 text-sm italic">"${t.message}"</p>
                    </div>
                    <div class="flex space-x-2">
                        ${!t.approved ? `<button data-id="${t.id}" class="approve-testimonial-btn bg-green-500 text-white p-2 rounded-full hover:bg-green-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-check"></i></button>` : ''}
                        <button data-id="${t.id}" class="delete-testimonial-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-10 h-10 flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderInvoicePage() {
    const order = state.allOrders.find(o => o.id === state.currentOrderId);
    if (!order) {
        pageContent.innerHTML = `<div class="container mx-auto p-8 text-center"><p>Order not found.</p></div>`;
        return;
    }

    const subtotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstOn = !!state.siteSettings.isGstEnabled;
    const merchantAddressLine = state.siteSettings.businessAddress.split(',').join('<br>');
    
    pageContent.innerHTML = `
    <div class="bg-gray-100 p-8">
        <div id="invoice-container" class="max-w-4xl mx-auto bg-white p-12 shadow-lg">
            <div class="flex justify-between items-start mb-12">
                <div>
                    <h1 class="text-4xl font-playfair font-bold">TIARAS</h1>
                    <p class="text-sm text-gray-500">${merchantAddressLine}</p>
                    ${state.siteSettings.isGstEnabled && state.siteSettings.merchantGstin ? `<p class="text-sm mt-2"><strong>GSTIN:</strong> ${state.siteSettings.merchantGstin}</p>` : ''}
                </div>
                <div class="text-right">
                    <h2 class="text-2xl font-semibold uppercase text-gray-400">Invoice</h2>
                    <p class="text-sm"><strong>Invoice #:</strong> ${order.invoiceNumber || order.id}</p>
                    <p class="text-sm"><strong>Date:</strong> ${formatDate(order.orderDate)}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-8 mb-12">
                <div>
                    <h4 class="font-semibold mb-2">Billed To:</h4>
                   <p>${order.shippingInfo.fullName}</p>
                   <p>${order.shippingInfo.address}</p>
                   <p>${order.shippingInfo.city}, ${order.shippingInfo.state} ${order.shippingInfo.zip}</p>
                   ${order.customerEmail ? `<p class="mt-2"><strong>Email:</strong> ${order.customerEmail}</p>` : ''}
                   ${gstOn && order.gstInfo?.requested ? `<p class="mt-2 font-semibold"><strong>GSTIN:</strong> ${order.gstInfo.number}</p>` : ''}
                </div>
            </div>
            <table class="w-full text-left mb-12">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-3 text-sm font-semibold">Item</th>
                        <th class="p-3 text-sm font-semibold text-center">Quantity</th>
                        <th class="p-3 text-sm font-semibold text-right">Unit Price (₹)</th>
                        ${gstOn ? `<th class=\"p-3 text-sm font-semibold text-right\">GST</th>` : ''}
                        <th class="p-3 text-sm font-semibold text-right">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                ${order.items.map(item => {
                        const base = (item.price * item.quantity);
                        const computed = state.siteSettings.pricesIncludeGst ? base : (base * (1 + (item.gstPercentage||0)/100));
                        const lineTotal = gstOn ? computed : base;
                        return `
                            <tr class="border-b">
                                 <td class="p-3">${item.name}</td>
                                 <td class="p-3 text-center">${item.quantity}</td>
                                 <td class="p-3 text-right">${item.price.toFixed(2)}</td>
                                 ${gstOn ? `<td class=\"p-3 text-right\">${item.gstPercentage}%</td>` : ''}
                           <td class="p-3 text-right">${lineTotal.toFixed(2)}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
            <div class="flex justify-end">
                <div class="w-full max-w-xs space-y-2">
                    <div class="flex justify-between"><span>Subtotal (₹):</span><span>${(order.subtotal ?? subtotal).toFixed(2)}</span></div>
                   ${gstOn ? Object.keys(order.gstBreakdown.rates || {}).map(rate => 
                         `<div class=\"flex justify-between\"><span>GST (${rate}%) (₹):</span><span>${order.gstBreakdown.rates[rate].toFixed(2)}</span></div>`
                    ).join('') : ''}
                    <div class="flex justify-between"><span>Shipping (₹):</span><span>${(gstOn ? (state.siteSettings.pricesIncludeGst ? (order.totalAmount - (order.subtotal ?? subtotal)) : (order.totalAmount - (order.subtotal ?? subtotal) - (order.gstBreakdown?.total || 0))) : (order.totalAmount - (order.subtotal ?? subtotal))).toFixed(2)}</span></div>
                    <div class="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total (₹):</span><span>${order.totalAmount.toFixed(2)}</span></div>
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>Thank you for your business!</p>
               </div>
     </div>
     <div class="text-center mt-8">
         <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Invoice</button>
         <button id="backFromOrderInvoiceBtn" class="ml-4 bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-md hover:bg-gray-300 transition">Back</button>
     </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
   document.getElementById('backFromOrderInvoiceBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const prev = state.previousRoute;
        if (prev && prev.page) {
            if (prev.page === 'admin') {
                state.adminCurrentTab = prev.adminTab || 'orders';
            }
            state.previousRoute = null;
            navigateTo(prev.page);
        } else {
            // Fallback: go to Admin > Orders
            state.adminCurrentTab = 'orders';
            navigateTo('admin');
        }
    });
}

function renderAdminPurchasesPage() {
    const container = document.getElementById('adminPurchasesContainer');
    if (!container) return;

    const purchaseFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-6">Add New Purchase Entry ${tooltipHTML('Create a new purchase record: select supplier, add items and taxes, then save.')}</h3>
            <form id="purchaseForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input type="hidden" id="editingPurchaseId" value="" />
                    <div>
                        <label for="supplierName" class="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                        <input type="text" id="supplierName" data-testid="supplierName" class="w-full px-4 py-2 border border-gray-300 rounded-md" list="suppliersDatalistPurchase" placeholder="Type to search suppliers" required>
                        <datalist id="suppliersDatalistPurchase">${(state.allSuppliers||[]).map(s => `<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                        <div class="mt-2">
                            <button type="button" id="showNewSupplierBtn" data-testid="showNewSupplierBtn" class="text-sm text-blue-600 hover:underline">Can\'t find supplier? + Add</button>
                        </div>
                        <div id="supplierGstBadge" class="text-sm mt-2 text-gray-600"></div>
                        <div id="supplierAddress" class="text-sm mt-1 text-gray-700"></div>
                        <div id="purchaseSupplierWarning" class="text-xs mt-2 text-orange-600 hidden">Supplier is not GST-registered — any GST will be treated as part of item cost.</div>
                        <div id="newSupplierRow" class="mt-3 hidden border p-3 rounded bg-gray-50">
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div>
                                    <label class="block text-xs text-gray-600">GSTIN (optional)</label>
                                    <input type="text" id="newSupplierGstin" data-testid="newSupplierGstin" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="GSTIN">
                                    <div id="newSupplierGstinFeedback" data-testid="newSupplierGstinFeedback" role="status" aria-live="polite" class="text-xs text-red-600 mt-1 hidden" data-validation-state=""></div>
                                    <div class="mt-2">
                                        <label class="inline-flex items-center text-xs text-gray-700">
                                            <input type="checkbox" id="newSupplierNotRegistered" data-testid="newSupplierNotRegistered" title="Mark supplier as not GST-registered. This disables GSTIN and related GST fields." class="mr-2"> Not GST-registered
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600">Address <span class="text-red-600">*</span></label>
                                    <input type="text" id="newSupplierAddress" data-testid="newSupplierAddress" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Address" required aria-required="true">
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600">State <span class="text-red-600">*</span></label>
                                    <select id="newSupplierStateCode" data-testid="newSupplierStateCode" class="w-full px-3 py-2 border border-gray-300 rounded-md" required aria-required="true">
                                        <option value="">Select state</option>
                                        ${GST_STATE_CODES.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600">PIN / Pincode</label>
                                    <input type="tel" id="newSupplierPin" data-testid="newSupplierPin" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="PIN / Pincode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6">
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600">Mobile</label>
                                    <div class="flex">
                                        <span class="inline-flex items-center px-3 rounded-l border border-r-0 bg-gray-100 text-gray-700">${state.siteSettings?.countryCode || '+91'}</span>
                                        <input type="tel" id="newSupplierMobile" data-testid="newSupplierMobile" class="w-full px-3 py-2 border rounded-r-md border-gray-300" placeholder="Mobile number">
                                    </div>
                                    <div>
                                        <label class="block text-xs text-gray-600">Email (optional)</label>
                                        <input type="email" id="newSupplierEmail" data-testid="newSupplierEmail" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="supplier@example.com">
                                        <div id="newSupplierEmailFeedback" class="text-xs text-red-600 mt-1 hidden" role="status" aria-live="polite"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="mt-3 flex gap-3">
                                <button type="button" id="addSupplierInlineBtn" data-testid="addSupplierInlineBtn" class="bg-green-600 text-white px-3 py-2 rounded">Add Supplier</button>
                                    <button type="button" id="cancelNewSupplierBtn" data-testid="cancelNewSupplierBtn" class="bg-gray-200 px-3 py-2 rounded">Cancel</button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label for="purchaseDate" class="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                        <input type="date" id="purchaseDate" class="w-full px-4 py-2 border border-gray-300 rounded-md" required value="${new Date().toISOString().split('T')[0]}">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                        <div class="flex gap-2">
                            <input type="text" id="purchaseInvoiceNumber" class="w-1/3 px-3 py-2 border border-gray-300 rounded-md bg-gray-50" readonly placeholder="Will be generated on save">
                            <input type="hidden" id="purchaseReusedInvoice" value="">
                            <select id="deletedInvoiceSelect" class="w-2/3 px-3 py-2 border border-gray-300 rounded-md">
                                <option value="">Use deleted invoice</option>
                                ${((state.allPurchases||[]).filter(p=>p.isDeleted && p.invoiceNumber).map(p => `<option value="${(p.invoiceNumber||'').replace(/\"/g,'&quot;')}">${(p.invoiceNumber||'').replace(/</g,'&lt;')} — ${formatDate(p.deletedAt || p.updatedAt || p.purchaseDate || p.createdAt || new Date())}</option>`).join(''))}
                            </select>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-between bg-gray-50 border rounded-md p-3">
                    <div class="text-sm text-gray-700">Supplier prices include GST?</div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="purchasePricesIncludeGst" ${state.siteSettings?.pricesIncludeGst ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
                <div>
                    <h4 class="text-lg font-semibold mb-2">Items</h4>
                    <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                        <div class="col-span-4">Product</div>
                        <div class="col-span-2">Cost/Unit (₹)</div>
                        <div class="col-span-2">Quantity</div>
                        <div class="col-span-1" id="purchaseGstHeader">GST %</div>
                        <div class="col-span-2 text-right">Total (₹)</div>
                    </div>
                    <div id="purchaseItemsContainer" class="space-y-2"></div>
                    <button type="button" id="addPurchaseItemBtn" class="mt-4 bg-blue-100 text-blue-700 font-semibold text-sm py-2 px-4 rounded-md hover:bg-blue-200 transition">+ Add Item</button>
                </div>
                <div class="border-t pt-4">
                    <div class="flex justify-end mb-2">
                        <span id="purchaseModeBadge" class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200">Exclusive mode</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                          <div class="text-right sm:text-left">
                              <div id="purchaseSubtotalLabel" class="text-gray-600">Subtotal (₹)</div>
                              <div id="purchaseSubtotal" class="font-semibold">0.00</div>
                          </div>
                          <div class="text-right sm:text-left">
                              <div class="text-gray-600">GST (₹)</div>
                              <div id="purchaseGst" class="font-semibold">0.00</div>
                          </div>
                          <div class="text-right">
                              <div class="text-gray-600">Grand Total (₹)</div>
                              <div id="purchaseTotal" class="font-bold text-xl">0.00</div>
                          </div>
                    </div>
                    <div class="mt-4 space-y-3">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Payment Type</label>
                            <div class="flex flex-wrap gap-4 text-sm">
                                <label class="inline-flex items-center gap-2">
                                    <input type="radio" name="purchasePaymentType" value="credit" checked>
                                    <span>Credit (to Creditors)</span>
                                </label>
                                <label class="inline-flex items-center gap-2">
                                    <input type="radio" name="purchasePaymentType" value="cash">
                                    <span>Cash</span>
                                </label>
                                <label class="inline-flex items-center gap-2">
                                    <input type="radio" name="purchasePaymentType" value="bank">
                                    <span>Bank</span>
                                </label>
                            </div>
                        </div>
                        <div id="purchasePayNowRow" class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Pay Now (₹)</label>
                                <input type="number" id="purchasePayNow" class="w-full px-3 py-2 border border-gray-300 rounded-md" step="0.01" min="0" placeholder="0.00">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                                <select id="purchasePaymentMode" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    <option value="cash">Cash</option>
                                    <option value="bank">Bank</option>
                                </select>
                            </div>
                            <div id="purchaseBankAccountRow" class="hidden">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
                                <select id="purchaseBankAccount" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                    ${(state.allBanks||[]).map(b => `<option value="${(b.name||'').replace(/"/g,'&quot;')}">${(b.name||'').replace(/</g,'&lt;')}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500">Tip: Enter Pay Now to split between immediate payment and Creditors automatically. Leave 0 for full credit.</p>
                    </div>
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="bg-green-600 text-white font-semibold py-3 px-8 rounded-md shadow hover:bg-green-700 transition">Record Purchase</button>
                </div>
                <input type="hidden" id="confirmedUnregPurchase" value="" />
            </form>
            <!-- Confirmation modal for unregistered suppliers -->
            <div id="unregSupplierConfirmModal" role="dialog" aria-modal="true" aria-hidden="true" tabindex="-1" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden">
                <div class="bg-white rounded-md p-6 max-w-lg w-full">
                    <h3 class="text-lg font-semibold mb-2">Confirm purchase with unregistered supplier</h3>
                    <p class="text-sm text-gray-700 mb-4">The selected supplier is not GST-registered. Any GST will be treated as part of item cost and will not be recorded separately. Do you want to continue?</p>
                    <div class="flex justify-end gap-3">
                        <button id="unregCancelBtn" class="px-4 py-2 rounded bg-gray-200">Cancel</button>
                        <button id="unregConfirmBtn" class="px-4 py-2 rounded bg-green-600 text-white">Yes, record purchase</button>
                    </div>
                </div>
            </div>
            <!-- Confirm reuse deleted invoice modal -->
            <div id="reuseInvoiceConfirmModal" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="reuseInvoiceTitle" aria-describedby="reuseInvoiceMsg" tabindex="-1" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden">
                <div class="bg-white rounded-md p-6 max-w-lg w-full">
                    <h3 id="reuseInvoiceTitle" class="text-lg font-semibold mb-2">Reuse deleted invoice?</h3>
                    <p id="reuseInvoiceMsg" class="text-sm text-gray-700 mb-4">This will assign the deleted invoice number to the new purchase. Do you want to continue?</p>
                    <div class="flex justify-end gap-3">
                        <button id="reuseInvoiceCancelBtn" class="px-4 py-2 rounded bg-gray-200">Cancel</button>
                        <button id="reuseInvoiceConfirmBtn" class="px-4 py-2 rounded bg-green-600 text-white">Yes, reuse invoice</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    // Render form and a separate purchase-history pane below it
    const purchaseHistoryHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-bold mb-4">Purchase History ${tooltipHTML('View past purchases; use filters to narrow by supplier or date range.')}</h3>
            <div id="purchaseHistoryContainer" class="space-y-4"></div>
        </div>
    `;

    // Render form first, then the history pane below it
    container.innerHTML = purchaseFormHTML + purchaseHistoryHTML;
    // Ensure hidden required inputs are disabled to avoid browser blocking form submission
    try { updateHiddenRequiredInputs(); } catch(_) {}
    // Populate purchase history immediately so the Add Purchase screen shows recent entries
    try { renderPurchaseHistory(); } catch(_) {}

    // Attach listeners specific to this page
    document.getElementById('addPurchaseItemBtn').addEventListener('click', addPurchaseItemRow);
    // Inline supplier add handlers
    const showNewSupplierBtn = document.getElementById('showNewSupplierBtn');
    const newSupplierRow = document.getElementById('newSupplierRow');
    const newSupplierGstin = document.getElementById('newSupplierGstin');
    const newSupplierAddress = document.getElementById('newSupplierAddress');
    const newSupplierNotRegistered = document.getElementById('newSupplierNotRegistered');
    const addSupplierInlineBtn = document.getElementById('addSupplierInlineBtn');
    const cancelNewSupplierBtn = document.getElementById('cancelNewSupplierBtn');
    const newSupplierStateSel = document.getElementById('newSupplierStateCode');

    // Default the inline new-supplier State select to merchant home state (or merchant GSTIN derived state)
    try {
        if (newSupplierStateSel) {
            newSupplierStateSel.value = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '') || '';
        }
    } catch (_) {}

    // Ensure required attributes on inline new-supplier inputs reflect initial visibility
    try {
        if (newSupplierRow && newSupplierRow.classList.contains('hidden')) {
            if (newSupplierAddress) newSupplierAddress.required = false;
            if (newSupplierStateSel) newSupplierStateSel.required = false;
        }
    } catch (_) {}

    // When GSTIN is entered for a new supplier, use the shared GSTIN validation which shows red/green
    // border feedback and (when valid) auto-applies the two-digit state code to the State select.
    try {
            if (newSupplierGstin && newSupplierStateSel) {
            const feedbackEl = document.getElementById('newSupplierGstinFeedback');
            enforceUppercaseInput(newSupplierGstin);
            attachGstinValidation(newSupplierGstin, feedbackEl);
            try { const newSupplierMobileEl = document.getElementById('newSupplierMobile'); if (newSupplierMobileEl) attachMobileValidation(newSupplierMobileEl, null); } catch(_) {}
            try { const newSupplierPinEl = document.getElementById('newSupplierPin'); if (newSupplierPinEl) attachPinBehavior(newSupplierPinEl, null); } catch(_) {}
            try { const newSupplierEmailEl = document.getElementById('newSupplierEmail'); const newSupplierEmailFb = document.getElementById('newSupplierEmailFeedback'); if (newSupplierEmailEl) { attachEmailValidation(newSupplierEmailEl, newSupplierEmailFb); try { enforceLowercaseInput(newSupplierEmailEl); } catch(_) {} } } catch(_) {}
            try { const newSupplierNameEl = document.getElementById('newSupplierName'); if (newSupplierNameEl) attachNameCapitalization(newSupplierNameEl); } catch(_) {}
            try { if (newSupplierAddress) attachNameCapitalization(newSupplierAddress); } catch(_) {}

            // If the "Not GST-registered" checkbox exists, wire it to disable/enable the GSTIN input
            try {
                if (newSupplierNotRegistered) {
                    const toggleGstinForNotReg = () => {
                        try {
                                    if (newSupplierNotRegistered.checked) {
                                    // clear and disable GSTIN when supplier is marked not-registered
                                    try { newSupplierGstin.value = ''; } catch(_) {}
                                    try { newSupplierGstin.classList.remove('tiaras-valid'); newSupplierGstin.classList.remove('tiaras-invalid'); newSupplierGstin.removeAttribute && newSupplierGstin.removeAttribute('aria-invalid'); } catch(_) {}
                                    newSupplierGstin.disabled = true;
                                    // Hide feedback so it doesn't show stale validation state
                                    if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                                } else {
                                    // re-enable GSTIN input for editing
                                    newSupplierGstin.disabled = false;
                                }
                            } catch (_) {}
                    };
                    newSupplierNotRegistered.addEventListener('change', toggleGstinForNotReg);
                    // initialize
                    toggleGstinForNotReg();
                }
            } catch (_) {}

            // Auto-apply state code after validation (debounced slightly after attachGstinValidation runs)
            let _debApply = null;
            const applyStateIfValid = () => {
                try {
                    // if user marked supplier as not registered, skip GSTIN-derived auto state
                    if (newSupplierNotRegistered && newSupplierNotRegistered.checked) return;
                    const vFull = (newSupplierGstin.value || '').trim().toUpperCase();
                    if (!vFull || vFull.length < 15) return;
                    const v = vFull.substring(0, 15);
                    if (GSTIN_REGEX.test(v)) {
                        const code = getStateCodeFromGstin(v);
                        if (code) {
                            newSupplierStateSel.value = code;
                            try { document.dispatchEvent(new CustomEvent('gstin:stateApplied', { detail: { inputId: newSupplierGstin.id, stateCode: code } })); } catch(_) {}
                        }
                    }
                } catch (_) {}
                // (intentionally synchronous) end of GSTIN-derived auto state logic
                _debApply = null;
            };
            const scheduleApply = () => { if (_debApply) clearTimeout(_debApply); _debApply = setTimeout(applyStateIfValid, 360); };
            newSupplierGstin.addEventListener('input', scheduleApply);
            newSupplierGstin.addEventListener('change', scheduleApply);
            newSupplierGstin.addEventListener('blur', scheduleApply);
            scheduleApply();
        }
    } catch (_) {}
    if (showNewSupplierBtn) {
        // Open the shared party add/edit modal instead of showing the inline row.
        showNewSupplierBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const supplierInputEl = document.getElementById('supplierName');
            const currentName = (supplierInputEl?.value || '').trim();
            // When the modal saves a supplier, reselect the typed name in the purchase form.
            pendingPurchaseRetryFn = () => {
                try {
                    setTimeout(() => {
                        try {
                            const supplierInput = document.getElementById('supplierName');
                            if (supplierInput) {
                                supplierInput.value = currentName || '';
                                const dl = document.getElementById('suppliersDatalistPurchase');
                                if (dl && currentName) {
                                    const already = Array.from(dl.options).some(o => (o.value||'') === currentName);
                                    if (!already) { const opt = document.createElement('option'); opt.value = currentName; dl.appendChild(opt); }
                                }
                                try { updateSupplierRegistrationUI(); } catch(_) {}
                            }
                        } catch(_) {}
                        pendingPurchaseRetryFn = null;
                    }, 120);
                } catch(_) { pendingPurchaseRetryFn = null; }
            };
            try {
                showPartyEditModal({ type: 'supplier', name: currentName });
            } catch (err) {
                pendingPurchaseRetryFn = null;
                showMessage('Unable to open supplier add modal.');
            }
        });
    }
    if (cancelNewSupplierBtn && newSupplierRow) {
        cancelNewSupplierBtn.addEventListener('click', (e) => {
            e.preventDefault();
            newSupplierRow.classList.add('hidden');
            try { if (newSupplierAddress) { newSupplierAddress.value = ''; newSupplierAddress.required = false; } } catch(_){}
            try { if (newSupplierStateSel) newSupplierStateSel.required = false; } catch(_){}
            if (newSupplierGstin) newSupplierGstin.value = ''; 
        });
    }
    if (addSupplierInlineBtn) {
        addSupplierInlineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('supplierName')?.value || '').trim();
            const notRegistered = !!(newSupplierNotRegistered && newSupplierNotRegistered.checked);
            let gstin = ((newSupplierGstin?.value || '').trim() || '').toUpperCase();
            // If user marked as not registered, ignore any GSTIN value
            if (notRegistered) gstin = '';
            // Validate GSTIN if provided and supplier is marked registered
            if (!notRegistered && gstin && !GSTIN_REGEX.test(gstin)) {
                showMessage('Invalid GSTIN format. Please check and enter a valid GSTIN or mark supplier as not GST-registered.');
                return;
            }
            const address = (newSupplierAddress?.value || '').trim();
            const stateCode = (document.getElementById('newSupplierStateCode')?.value || '').trim();
            const pin = (document.getElementById('newSupplierPin')?.value || '').trim();
            const mobile = (document.getElementById('newSupplierMobile')?.value || '').trim();
            const email = (document.getElementById('newSupplierEmail')?.value || '').trim().toLowerCase();
            if (!name) { showMessage('Enter supplier name first.'); return; }
            // Address and state are mandatory when adding supplier from purchase entry
            if (!address) { showMessage('Enter supplier address. Address is required when adding from purchase entry.'); return; }
            if (!stateCode) { showMessage('Select supplier state. State is required when adding from purchase entry.'); return; }
            // Enforce 6-digit PIN when adding supplier inline from purchase
            try {
                const pinDigits = (pin || '').replace(/\D/g, '');
                if (!pin || pinDigits.length !== 6) { showMessage('Enter valid 6-digit PIN. PIN is required when adding from purchase entry.'); return; }
            } catch (_) {}
            // Mobile is mandatory when adding supplier inline from purchase entry
            if (!mobile) { showMessage('Enter supplier mobile. Mobile is required when adding from purchase entry.'); return; }
            // Enforce exact 10 digits for mobile
            try {
                const mobileDigits = (mobile || '').replace(/\D/g, '');
                if (mobileDigits.length !== 10) { showMessage('Enter valid 10-digit mobile number.'); return; }
            } catch (_) {}
            // Check for existing supplier (case-insensitive)
            const exists = (state.allSuppliers || []).some(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
            if (exists) { showMessage('Supplier already exists. Choose from the list.'); return; }
            try {
                // Build payload without undefined fields (Firestore rejects undefined values)
                const payload = { name, createdAt: serverTimestamp(), isDeleted: false };
                if (gstin) payload.gstin = gstin;
                // Record explicit GST registration flag to simplify downstream logic
                payload.isGstRegistered = !notRegistered;
                if (address) payload.address = address;
                if (stateCode) payload.stateCode = stateCode;
                if (pin) payload.pin = pin;
                if (mobile) payload.mobile = mobile;
                if (email) payload.email = email;
                const ref = await addDoc(collection(db, suppliersColPath), payload);
                // Update local state and datalist (avoid inserting undefined fields)
                try {
                    const supEntry = { id: ref.id, name };
                    if (gstin) supEntry.gstin = gstin;
                    supEntry.isGstRegistered = !notRegistered;
                    if (address) supEntry.address = address;
                    if (stateCode) supEntry.stateCode = stateCode;
                    if (pin) supEntry.pin = pin;
                    if (mobile) supEntry.mobile = mobile;
                    if (email) supEntry.email = email;
                    state.allSuppliers = [supEntry, ...(state.allSuppliers || [])];
                } catch (_) {}
                // Use optimistic upsert to trigger UI refreshes
                try { upsertPartyInState('supplier', Object.assign({ name }, gstin ? { gstin } : {}, address ? { address } : {}, stateCode ? { stateCode } : {}, pin ? { pin } : {}, mobile ? { mobile } : {}, email ? { email } : {}, { isGstRegistered: !notRegistered })); } catch(_){ }
                const dl = document.getElementById('suppliersDatalistPurchase');
                if (dl) { const opt = document.createElement('option'); opt.value = name; dl.appendChild(opt); }
                // Select the supplier in input
                const supplierInput = document.getElementById('supplierName'); if (supplierInput) supplierInput.value = name;
                // Update GST UI after adding supplier
                try { updateSupplierRegistrationUI(); } catch (_) {}
                showMessage('Supplier added.');
                if (newSupplierGstin) newSupplierGstin.value = '';
                try { if (newSupplierAddress) { newSupplierAddress.value = ''; newSupplierAddress.required = false; } } catch(_){}
                try { if (newSupplierStateSel) newSupplierStateSel.required = false; } catch(_){}
                if (newSupplierRow) newSupplierRow.classList.add('hidden');
            } catch (err) {
                console.error('Failed to add supplier inline:', err);
                showMessage('Failed to add supplier.');
            }
            updatePurchaseTotal();
        });
    }
    container.addEventListener('click', e => {
        if (e.target.closest('.remove-purchase-item-btn')) {
            if (document.querySelectorAll('.purchase-item-row').length > 1) {
                e.target.closest('.purchase-item-row').remove();
                updatePurchaseTotal();
            } else {
                showMessage("You must have at least one item in a purchase.");
            }
        }
    });
    // Update totals live when user types price or quantity
    container.addEventListener('input', e => {
        try {
            if (e.target && (e.target.classList.contains('purchase-price') || e.target.classList.contains('purchase-quantity'))) {
                updatePurchaseTotal();
            }
        } catch (_) {}
    });
     container.addEventListener('change', e => {
        if (e.target.classList.contains('purchase-product-select')) {
            if (e.target.value === 'new') {
                openNewProductModal(e.target);
                return;
            }
            const prod = state.products.find(p => p.id === e.target.value);
            const rowEl = e.target.closest('.purchase-item-row');
            if (prod && rowEl) {
                const gstSel = rowEl.querySelector('.purchase-gst');
                const customInput = rowEl.querySelector('.purchase-gst-custom');
                if (gstSel && typeof prod.gstPercentage === 'number') {
                    const v = String(prod.gstPercentage);
                    const presetValues = ['0','5','12','18','28'];
                    if (presetValues.includes(v)) {
                        gstSel.value = v;
                        if (customInput) customInput.classList.add('hidden');
                    } else {
                        gstSel.value = 'custom';
                        if (customInput) { customInput.classList.remove('hidden'); customInput.value = v; }
                    }
                }
                // Prefill price with average and update hints
                const priceInput = rowEl.querySelector('.purchase-price');
                const hint = rowEl.querySelector('.avg-price-hint');
                const hintAvg = rowEl.querySelector('.avg-price-val');
                const hintLast = rowEl.querySelector('.last-price-val');
                const avg = typeof prod.purchasePrice === 'number' ? prod.purchasePrice : null;
                const last = typeof prod.lastPurchasePrice === 'number' ? prod.lastPurchasePrice : null;

                if (priceInput && avg && avg > 0) {
                    priceInput.value = avg.toFixed(2);
                }
                if (hint && hintAvg && hintLast) {
                    const hasAny = (avg && avg > 0) || (last && last > 0);
                    if (avg && avg > 0) hintAvg.textContent = avg.toFixed(2);
                    if (last && last > 0) hintLast.textContent = last.toFixed(2);
                    if (hasAny) hint.classList.remove('hidden'); else hint.classList.add('hidden');
                }
            } else if (rowEl) {
                const hint = rowEl.querySelector('.avg-price-hint');
                if (hint) hint.classList.add('hidden');
            }
            updatePurchaseTotal();
        }
        if (e.target.id === 'purchasePricesIncludeGst' || e.target.classList.contains('purchase-gst')) {
            if (e.target.id === 'purchasePricesIncludeGst') {
                // Enable editing when inclusive is ON; disable when OFF
                setPurchaseGstEnabled(e.target.checked);
            }
            updatePurchaseTotal();
        }
    });

    // Modal confirm/cancel handlers for unregistered supplier confirmation
    const unregConfirmBtn = document.getElementById('unregConfirmBtn');
    const unregCancelBtn = document.getElementById('unregCancelBtn');
    if (unregConfirmBtn) {
        unregConfirmBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            const confirmedEl = document.getElementById('confirmedUnregPurchase');
            if (confirmedEl) confirmedEl.value = '1';
            try { closeModalById && typeof closeModalById === 'function' ? closeModalById('unregSupplierConfirmModal') : (document.getElementById('unregSupplierConfirmModal')?.classList.add('hidden')); } catch(_) {}
            // Resubmit the form programmatically
            const form = document.getElementById('purchaseForm');
            if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
    }
    if (unregCancelBtn) {
        unregCancelBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try { closeModalById && typeof closeModalById === 'function' ? closeModalById('unregSupplierConfirmModal') : (document.getElementById('unregSupplierConfirmModal')?.classList.add('hidden')); } catch(_) {}
        });
    }

    // Supplier GST status UI: badge, warning, and disabling GST selects for unregistered suppliers
    function updateSupplierRegistrationUI() {
        const supplierInput = document.getElementById('supplierName');
    const badge = document.getElementById('supplierGstBadge');
    const addrEl = document.getElementById('supplierAddress');
    const warn = document.getElementById('purchaseSupplierWarning');
        if (!supplierInput) return;
        const name = (supplierInput.value || '').trim();
    const supplierObj = (state.allSuppliers || []).find(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
    // Consider explicit isGstRegistered flag when present; fall back to GSTIN presence
    const registered = !!(supplierObj && (typeof supplierObj.isGstRegistered !== 'undefined' ? !!supplierObj.isGstRegistered : !!((supplierObj.gstin || '').trim())));
        if (badge) {
            try { badge.setAttribute('role', 'status'); badge.setAttribute('aria-live', 'polite'); } catch(_){}
            if (supplierObj) {
                if (registered) {
                    badge.innerHTML = `GSTIN: <strong>${supplierObj.gstin}</strong>`;
                    try { badge.removeAttribute('aria-hidden'); } catch(_){}
                } else {
                    badge.textContent = 'Not GST-registered';
                    try { badge.removeAttribute('aria-hidden'); } catch(_){}
                }
            } else {
                badge.textContent = '';
                try { badge.setAttribute('aria-hidden', 'true'); } catch(_){}
            }
        }
        if (addrEl) {
            try {
                if (supplierObj && supplierObj.address) addrEl.textContent = supplierObj.address;
                else addrEl.textContent = '';
            } catch (_) { try { addrEl.textContent = ''; } catch(_){} }
        }
        if (warn) {
            try { warn.setAttribute('role','status'); warn.setAttribute('aria-live','polite'); } catch(_){}
            // If supplier exists but missing address/state, show a helpful action to edit details
                if (supplierObj && (!supplierObj.address || !supplierObj.stateCode)) {
                warn.classList.remove('hidden');
                warn.innerHTML = `Supplier record is missing address or state. <button id="editSupplierDetailsBtn" class="underline text-sm text-blue-600">Edit supplier details</button>`;
                // Attach handler to open party edit modal
                setTimeout(() => {
                    const btn = document.getElementById('editSupplierDetailsBtn');
                    if (btn) {
                        btn.addEventListener('click', (ev) => {
                            ev.preventDefault();
                            try {
                                showPartyEditModal({ type: 'supplier', name: supplierObj.name || '', gstin: supplierObj.gstin || '', address: supplierObj.address || '', docId: supplierObj.id, isGstRegistered: (typeof supplierObj.isGstRegistered !== 'undefined') ? !!supplierObj.isGstRegistered : undefined, stateCode: supplierObj.stateCode || '', pin: supplierObj.pin || '', mobile: supplierObj.mobile || '' });
                            } catch (_) {}
                        });
                    }
                }, 10);
            } else {
                warn.classList.toggle('hidden', registered || !supplierObj);
                // ensure default text when just a warning about not registered
                if (!warn.classList.contains('hidden') && !supplierObj) {
                    warn.textContent = 'Supplier is not GST-registered — any GST will be treated as part of item cost.';
                    try { warn.removeAttribute('aria-hidden'); } catch(_){}
                } else {
                    try { warn.setAttribute('aria-hidden', 'true'); } catch(_){}
                }
            }
        }
        // If supplier is not registered, force the 'prices include GST' toggle OFF and disable it,
        // and disable GST% selects so GST is treated as part of cost. If supplier is registered or not chosen,
        // restore the toggle to editable state and respect its checked value for GST select editability.
        const pricesToggle = document.getElementById('purchasePricesIncludeGst');
        if (supplierObj && !registered) {
            if (pricesToggle) {
                try { pricesToggle.checked = false; } catch(_) {}
                pricesToggle.disabled = true;
            }
            // disable GST% selects for all rows
            setPurchaseGstEnabled(false);
            // also ensure any existing selects show 0
            document.querySelectorAll('.purchase-item-row .purchase-gst').forEach(sel => { try { sel.value = '0'; } catch(_) {} });
        } else {
            if (pricesToggle) {
                pricesToggle.disabled = false;
                // If supplier is present and GST-registered, auto-enable the inclusive-prices toggle
                if (supplierObj && registered) {
                    try { pricesToggle.checked = true; } catch(_) {}
                }
            }
            // enable/disable selects based on the toggle's checked state
            const enabled = !!(pricesToggle && pricesToggle.checked);
            setPurchaseGstEnabled(enabled);
        }
        // Recompute totals to reflect any changes
        updatePurchaseTotal();
    }

    const supplierNameInput = document.getElementById('supplierName');
    if (supplierNameInput) {
        supplierNameInput.addEventListener('input', () => updateSupplierRegistrationUI());
        supplierNameInput.addEventListener('blur', () => updateSupplierRegistrationUI());
        try { attachNameCapitalization(supplierNameInput); } catch(_) {}
    }
    // Run once on render to set initial state
    try { updateSupplierRegistrationUI(); } catch(_) {}

    // Populate invoice preview and wire deleted-invoice selection
    try {
        const invInput = document.getElementById('purchaseInvoiceNumber');
        const deletedSel = document.getElementById('deletedInvoiceSelect');
        const editingId = (document.getElementById('editingPurchaseId')?.value || '').trim();
        const setPreview = async () => {
            try {
                if (!invInput) return;
                const editingIdNow = (document.getElementById('editingPurchaseId')?.value || '').trim();
                if (editingIdNow) {
                    const orig = (state.allPurchases||[]).find(p => p.id === editingIdNow) || {};
                    invInput.value = orig.invoiceNumber || '';
                    return;
                }
                if (deletedSel && (deletedSel.value || '').trim()) {
                    invInput.value = deletedSel.value;
                    return;
                }
                // Peek next counter for display (non-destructive)
                try {
                    const nextRaw = await peekNextCounter('purchases');
                    if (nextRaw) invInput.value = formatInvoiceFromCounter(nextRaw, 'purchases');
                } catch (e) { /* ignore preview errors */ }
            } catch (_) {}
        };
        if (deletedSel) {
            // Modal-based confirmation flow for reusing deleted invoices
            let _pendingDeletedValue = null;
            const reuseModal = document.getElementById('reuseInvoiceConfirmModal');
            const reuseMsg = document.getElementById('reuseInvoiceMsg');
            const reuseConfirmBtn = document.getElementById('reuseInvoiceConfirmBtn');
            const reuseCancelBtn = document.getElementById('reuseInvoiceCancelBtn');

            const openReuseModal = (val) => {
                try {
                    _pendingDeletedValue = val;
                    if (reuseMsg) reuseMsg.textContent = `This will assign invoice number ${val} to the new purchase. Do you want to continue?`;
                    if (typeof openModalById === 'function') openModalById('reuseInvoiceConfirmModal'); else if (reuseModal) reuseModal.classList.remove('hidden');
                } catch (_) {}
            };
            const closeReuseModal = () => {
                try { if (typeof closeModalById === 'function') closeModalById('reuseInvoiceConfirmModal'); else if (reuseModal) reuseModal.classList.add('hidden'); } catch(_){}
            };

            deletedSel.addEventListener('change', (ev) => {
                try {
                    const val = (deletedSel.value || '').trim();
                    if (!val) { setPreview(); return; }
                    openReuseModal(val);
                } catch (_) { setPreview(); }
            });

            if (reuseConfirmBtn) {
                reuseConfirmBtn.addEventListener('click', (ev) => {
                    try {
                        ev.preventDefault();
                        // Persist the chosen reused invoice into a hidden input so it survives removing the option
                        const hid = document.getElementById('purchaseReusedInvoice');
                        if (_pendingDeletedValue) {
                            if (hid) hid.value = _pendingDeletedValue;
                            // Remove the option from dropdown so it's no longer available
                            try {
                                for (let i = deletedSel.options.length - 1; i >= 0; i--) {
                                    const o = deletedSel.options[i];
                                    if ((o.value || '').trim() === _pendingDeletedValue) {
                                        deletedSel.remove(i);
                                    }
                                }
                            } catch (_) {}
                            // Ensure the select shows no option (we keep the value in hidden input)
                            try { deletedSel.value = ''; } catch(_) {}
                            // Update invoice preview to the chosen value
                            if (invInput) invInput.value = _pendingDeletedValue;
                        }
                    } catch (_) {}
                    try { closeReuseModal(); } catch(_) {}
                });
            }
            if (reuseCancelBtn) {
                reuseCancelBtn.addEventListener('click', (ev) => {
                    try {
                        ev.preventDefault();
                        // Clear selection and restore preview
                        if (deletedSel) deletedSel.value = '';
                        setPreview();
                    } catch (_) {}
                    try { closeReuseModal(); } catch(_) {}
                });
            }
        }
        setPreview();
    } catch (_) {}
}

function renderLocalSalePage() {
    const container = document.getElementById('adminLocalSaleContainer');
    if (!container) return;

    const saleFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-6">Create Local Sale Invoice</h3>
            <form id="localSaleForm" class="space-y-6">
                <input type="hidden" id="editingLocalSaleId" value="" />
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <label for="customerName" class="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                         <input type="text" id="customerName" class="w-full px-4 py-2 border border-gray-300 rounded-md" list="customersDatalistLocalSale" required>
                         <datalist id="customersDatalistLocalSale">${(state.allCustomers||[]).map(c=>`<option value="${(c.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                     </div>
                    <div>
                        <label for="saleDate" class="block text-sm font-medium text-gray-700 mb-1">Sale Date</label>
                        <input type="date" id="saleDate" class="w-full px-4 py-2 border border-gray-300 rounded-md" required value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
                <div class="pt-2">
                    <label class="flex items-center">
                        <input type="checkbox" id="localSaleIsCredit" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black">
                        <span class="ml-2 text-sm text-gray-700">Credit Sale (on account)</span>
                    </label>
                </div>
                <div class="pt-4 ${state.siteSettings.isGstEnabled ? '' : 'hidden'}">
                    <label class="flex items-center">
                        <input type="checkbox" id="localSaleGstInvoice" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black">
                        <span class="ml-2 text-sm text-gray-700">Customer needs a GST invoice</span>
                    </label>
                  </div>
                <div id="localSaleGstNumberContainer" class="hidden">
                    <label for="localSaleGstNumber" class="block text-sm font-medium text-gray-700">Customer GST Number</label>
                    <input type="text" id="localSaleGstNumber" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border" placeholder="e.g., 29ABCDE1234F1Z5">
                </div>
                <div>
                    <h4 class="text-lg font-semibold mb-2">Items</h4>
                    <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                        <div class="col-span-6">Product</div>
                        <div class="col-span-2">Quantity</div>
                        <div class="col-span-3 text-right">Total (₹)</div>
                    </div>
                    <div id="localSaleItemsContainer" class="space-y-2"></div>
                    <button type="button" id="addLocalSaleItemBtn" class="mt-4 bg-blue-100 text-blue-700 font-semibold text-sm py-2 px-4 rounded-md hover:bg-blue-200 transition">+ Add Item</button>
                </div>
                <div id="localSaleReceiveNowRow" class="pt-2 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Receive Now (₹)</label>
                                            <input type="number" id="localSaleReceiveNow" class="w-full px-3 py-2 border border-gray-300 rounded-md" step="0.01" min="0" placeholder="0.00">
                                        </div>
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                                            <select id="localSalePaymentMode" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                                    <option value="cash" selected>Cash</option>
                                                    <option value="bank">Bank</option>
                                            </select>
                                        </div>
                                        <div id="localSaleBankAccountRow" class="hidden">
                                            <label class="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
                                            <select id="localSaleBankAccount" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                                ${(state.allBanks||[]).map(b=>`<option>${b.name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <p class="md:col-span-3 text-xs text-gray-500">If the received amount is less than the total, the balance will be posted to Debtors (credit on account).</p>
                                </div>
                <div class="pt-4 ${state.siteSettings.isGstEnabled ? '' : 'hidden'}">
                    <label class="flex items-center">
                        <input type="checkbox" id="localSaleGstInvoice" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black">
                        <span class="ml-2 text-sm text-gray-700">Customer needs a GST invoice</span>
                    </label>
                  </div>
                <div id="localSaleGstNumberContainer" class="hidden">
                    <label for="localSaleGstNumber" class="block text-sm font-medium text-gray-700">Customer GST Number</label>
                    <input type="text" id="localSaleGstNumber" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border" placeholder="e.g., 29ABCDE1234F1Z5">
                </div>
                <div>
                    <h4 class="text-lg font-semibold mb-2">Items</h4>
                    <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                        <div class="col-span-6">Product</div>
                        <div class="col-span-2">Quantity</div>
                        <div class="col-span-3 text-right">Total (₹)</div>
                    </div>
                    <div id="localSaleItemsContainer" class="space-y-2"></div>
                    <button type="button" id="addLocalSaleItemBtn" class="mt-4 bg-blue-100 text-blue-700 font-semibold text-sm py-2 px-4 rounded-md hover:bg-blue-200 transition">+ Add Item</button>
                </div>
                <div class="border-t pt-4">
                    <div class="flex justify-end mb-2">
                        <span id="localSaleModeBadge" class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 border border-gray-200">Exclusive mode</span>
                    </div>
                    <div class="w-full max-w-sm ml-auto space-y-2 text-sm">
                        <div class="flex justify-between"><span>Subtotal (₹):</span><span id="localSaleSubtotal">0.00</span></div>
                        <div id="localSaleGstBreakdown"></div>
                        <div class="flex justify-between font-bold text-base border-t pt-2 mt-2"><span>Grand Total (₹):</span><span id="localSaleTotal">0.00</span></div>
                    </div>
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="bg-green-600 text-white font-semibold py-3 px-8 rounded-md shadow hover:bg-green-700 transition">Generate & Finalize Invoice</button>
                </div>
            </form>
        </div>
    `;
    // Recent Local Sales (compact list with Edit)
    const localSalesSorted = (state.allLocalSales || []).slice().sort((a,b) => (_toDate(b.saleDate) - _toDate(a.saleDate)));
    const localSalesRows = localSalesSorted.slice(0, 10).map(s => {
        const dt = _toDate(s.saleDate);
        const mode = s.receivedNow?.mode ? (s.receivedNow.mode === 'bank' ? `Bank${s.receivedNow.bankAccount ? ` – ${s.receivedNow.bankAccount}`:''}` : 'Cash') : (s.isCreditSale ? 'Credit' : 'Cash/Bank');
        const tags = s.isCreditSale ? '<span class="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 text-xs">Credit</span>' : '';
        return `<div class="flex items-center justify-between p-3 border rounded-md text-sm">
            <div>
                <div class="font-mono">${s.invoiceNumber || s.id}</div>
                <div class="text-gray-600">${s.customerName || 'Customer'} • ${formatDate(dt)} • ₹${(s.totalAmount||0).toFixed(2)} • ${mode} ${tags}</div>
            </div>
            <div class="flex items-center gap-2">
                <button class="edit-local-sale-btn text-xs bg-blue-600 text-white px-3 py-1 rounded-md" data-id="${s.id}">Edit</button>
                <a href="#" data-page="local_sale_invoice" data-id="${s.id}" class="nav-btn text-xs bg-gray-100 px-3 py-1 rounded-md">Invoice</a>
            </div>
        </div>`;
    }).join('') || '<div class="text-gray-500 text-sm">No local sales yet.</div>';

    const historyHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-2xl font-bold">Recent Local Sales</h3>
            </div>
            <div id="localSalesHistory" class="space-y-2">${localSalesRows}</div>
        </div>`;

    container.innerHTML = saleFormHTML + historyHTML;
    addLocalSaleItemRow(); // Add the first row

    // Attach listeners
    document.getElementById('addLocalSaleItemBtn').addEventListener('click', addLocalSaleItemRow);
    
    const form = document.getElementById('localSaleForm');
    form.addEventListener('input', e => {
        if (e.target.classList.contains('local-sale-quantity')) {
            updateLocalSaleTotals();
        }
    });
    form.addEventListener('change', e => {
        if (e.target.classList.contains('local-sale-product-select')) {
            updateLocalSaleTotals();
        }
    });
    form.addEventListener('click', e => {
        if (e.target.closest('.remove-local-sale-item-btn')) {
            if (document.querySelectorAll('.local-sale-item-row').length > 1) {
                e.target.closest('.local-sale-item-row').remove();
                updateLocalSaleTotals();
            }
        }
    });

    const gstCheckbox = document.getElementById('localSaleGstInvoice');
    const gstContainer = document.getElementById('localSaleGstNumberContainer');
    gstCheckbox.addEventListener('change', () => {
        gstContainer.classList.toggle('hidden', !gstCheckbox.checked);
        document.getElementById('localSaleGstNumber').required = gstCheckbox.checked;
    });

    const pmSel = document.getElementById('localSalePaymentMode');
    const bankRow = document.getElementById('localSaleBankAccountRow');
    const syncBankRow = ()=>{ bankRow.classList.toggle('hidden', pmSel.value!=='bank'); };
    pmSel.addEventListener('change', syncBankRow);
    syncBankRow();

    form.addEventListener('submit', handleGenerateLocalInvoice);
    // Initialize totals and badge immediately
    updateLocalSaleTotals();

    try { const customerNameInput = document.getElementById('customerName'); if (customerNameInput) attachNameCapitalization(customerNameInput); } catch(_) {}

    // Helper to populate form from an existing local sale
    function populateLocalSaleFormFromRecord(s) {
        if (!s) return;
        const idEl = document.getElementById('editingLocalSaleId');
        if (idEl) idEl.value = s.id;
        document.getElementById('customerName').value = s.customerName || '';
        const d = _toDate(s.saleDate) || new Date();
        document.getElementById('saleDate').value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().split('T')[0];

        // GST invoice toggle and number
        const gstReq = !!(s.gstInfo && s.gstInfo.requested);
        const gstCb = document.getElementById('localSaleGstInvoice');
        const gstNumEl = document.getElementById('localSaleGstNumber');
        const gstContainer = document.getElementById('localSaleGstNumberContainer');
        gstCb.checked = gstReq;
        gstContainer.classList.toggle('hidden', !gstReq);
        gstNumEl.required = gstReq;
        gstNumEl.value = s.gstInfo?.number || '';

        // Receive now and mode
        const recv = s.receivedNow || { amount: 0, mode: 'cash', bankAccount: '' };
        document.getElementById('localSaleReceiveNow').value = recv.amount ? String(recv.amount) : '';
        document.getElementById('localSalePaymentMode').value = recv.mode || 'cash';
        const bankRow = document.getElementById('localSaleBankAccountRow');
        bankRow.classList.toggle('hidden', (recv.mode !== 'bank'));
        if (recv.mode === 'bank') {
            document.getElementById('localSaleBankAccount').value = recv.bankAccount || '';
        }

        // Credit toggle (informational; we use amount to compute but keep in sync)
        const remaining = Math.max(0, (s.totalAmount||0) - (recv.amount||0));
        document.getElementById('localSaleIsCredit').checked = (remaining > 0) || !!s.isCreditSale;

        // Rebuild items
        const cont = document.getElementById('localSaleItemsContainer');
        cont.innerHTML = '';
        (s.items || []).forEach(it => {
            addLocalSaleItemRow();
            const row = cont.lastElementChild;
            const sel = row.querySelector('.local-sale-product-select');
            const qty = row.querySelector('.local-sale-quantity');
            sel.value = it.id;
            qty.value = it.quantity;
        });
        updateLocalSaleTotals();
        document.getElementById('localSaleForm').scrollIntoView({ behavior: 'smooth' });
    }

    // Wire edit buttons
    document.querySelectorAll('.edit-local-sale-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            const id = btn.dataset.id;
            const sale = (state.allLocalSales || []).find(s => s.id === id);
            populateLocalSaleFormFromRecord(sale);
        });
    });
}

function renderPurchaseInvoicePage() {
    // Minimal, robust purchase invoice renderer to avoid template parsing issues.
    // Locates the current purchase by `state.currentOrderId` (set when navigating) and
    // renders a compact invoice with Print and Back controls.
    const purchase = (state.allPurchases || []).find(p => p.id === state.currentOrderId) || null;
    const page = document.getElementById('pageContent') || document.body;
    if (!purchase) {
        page.innerHTML = `<div class="container mx-auto p-8 text-center"><p>No purchase found for invoice.</p><div class="mt-4"><button id="backFromPurchaseInvoiceBtn" class="ml-4 bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-md hover:bg-gray-300 transition">Back</button></div></div>`;
        document.getElementById('backFromPurchaseInvoiceBtn')?.addEventListener('click', (e) => { e.preventDefault(); navigateTo('admin'); });
        return;
    }

    const purchaseDate = purchase.purchaseDate && purchase.purchaseDate.seconds ? new Date(purchase.purchaseDate.seconds * 1000) : (purchase.purchaseDate || new Date());
    const subtotal = (purchase.items || []).reduce((s,it) => s + ((parseFloat(it.purchasePrice) || 0) * (parseFloat(it.quantity) || 0)), 0);
    const gstTotal = purchase.gstBreakdown?.total || 0;
    const total = purchase.totalAmount || (subtotal + gstTotal);

    page.innerHTML = `
        <div class="container mx-auto p-8">
            <div class="bg-white p-8 rounded shadow">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h1 class="text-2xl font-bold">Purchase Record</h1>
                        <p class="text-sm text-gray-600">Supplier: ${escapeHtml(purchase.supplierName || '')}</p>
                        <p class="text-xs text-gray-500">Invoice: ${escapeHtml(purchase.invoiceNumber || purchase.id)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-sm">Date: ${formatDate(purchaseDate)}</p>
                        <p class="text-sm">Total: ₹${Number(total).toFixed(2)}</p>
                    </div>
                </div>
                <table class="w-full text-left mb-4">
                    <thead class="bg-gray-50"><tr><th class="p-2 text-sm">Item</th><th class="p-2 text-sm text-center">Qty</th><th class="p-2 text-sm text-right">Unit</th><th class="p-2 text-sm text-right">Line</th></tr></thead>
                    <tbody>
                        ${(purchase.items || []).map(it => `<tr class="border-b"><td class="p-2 text-sm">${escapeHtml(it.productName||'')}</td><td class="p-2 text-center text-sm">${escapeHtml(String(it.quantity||0))}</td><td class="p-2 text-right text-sm">${Number(it.purchasePrice||0).toFixed(2)}</td><td class="p-2 text-right text-sm">${(Number(it.purchasePrice||0)*Number(it.quantity||0)).toFixed(2)}</td></tr>`).join('')}
                    </tbody>
                </table>
                <div class="flex justify-end gap-4">
                    <div class="text-right">
                        <div class="text-sm text-gray-600">Subtotal: ₹${Number(subtotal).toFixed(2)}</div>
                        <div class="text-sm text-gray-600">GST: ₹${Number(gstTotal).toFixed(2)}</div>
                        <div class="font-bold text-lg">Grand Total: ₹${Number(total).toFixed(2)}</div>
                    </div>
                </div>
                <div class="mt-6 text-right">
                    <button id="printInvoiceBtn" class="bg-black text-white px-4 py-2 rounded">Print</button>
                    <button id="backFromPurchaseInvoiceBtn" class="ml-2 bg-gray-200 px-4 py-2 rounded">Back</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('printInvoiceBtn')?.addEventListener('click', () => window.print());
    document.getElementById('backFromPurchaseInvoiceBtn')?.addEventListener('click', (e) => { e.preventDefault(); navigateTo('admin'); });
}

function renderLocalSaleInvoicePage() {
    const saleData = state.allLocalSales.find(s => s.id === state.currentOrderId) || state.localSaleData;
    if (!saleData) {
        pageContent.innerHTML = `<div class="container mx-auto p-8 text-center"><p>No invoice data found. Please create a sale first.</p></div>`;
        navigateTo('admin'); // redirect back
        return;
    }
    
    const saleDate = saleData.saleDate.seconds ? new Date(saleData.saleDate.seconds * 1000) : saleData.saleDate;
    const gstOn = !!state.siteSettings.isGstEnabled;
    const merchantAddressLine = state.siteSettings.businessAddress.split(',').join('<br>');


    pageContent.innerHTML = `
    <div class="bg-gray-100 p-8">
        <div id="invoice-container" class="max-w-4xl mx-auto bg-white p-12 shadow-lg">
            <div class="flex justify-between items-start mb-12">
                <div>
                    <h1 class="text-4xl font-playfair font-bold">TIARAS</h1>
                    <p class="text-sm text-gray-500">${merchantAddressLine}</p>
                    ${state.siteSettings.isGstEnabled && state.siteSettings.merchantGstin ? `<p class="text-sm mt-2"><strong>GSTIN:</strong> ${state.siteSettings.merchantGstin}</p>` : ''}
                </div>
                <div class="text-right">
                    <h2 class="text-2xl font-semibold uppercase text-gray-400">Local Sale Invoice</h2>
                    <p class="text-sm"><strong>Invoice #:</strong> ${saleData.invoiceNumber || saleData.id}</p>
                    <p class="text-sm"><strong>Date:</strong> ${formatDate(saleDate)}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-8 mb-12">
                <div>
                    <h4 class="font-semibold mb-2">Billed To:</h4>
                   <p>${saleData.customerName}</p>
                    ${gstOn && saleData.gstInfo?.requested && saleData.gstInfo.number ? `<p class="mt-2 font-semibold"><strong>GSTIN:</strong> ${saleData.gstInfo.number}</p>` : ''}
                </div>
            </div>
            <table class="w-full text-left mb-12">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-3 text-sm font-semibold">Item</th>
                        <th class="p-3 text-sm font-semibold text-center">Quantity</th>
                        <th class="p-3 text-sm font-semibold text-right">Unit Price (₹)</th>
                        ${gstOn ? `<th class=\"p-3 text-sm font-semibold text-right\">GST</th>` : ''}
                        <th class="p-3 text-sm font-semibold text-right">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                ${saleData.items.map(item => {
                        const base = (item.price * item.quantity);
                        const computed = state.siteSettings.pricesIncludeGst ? base : (base * (1 + (item.gstPercentage||0)/100));
                        const lineTotal = gstOn ? computed : base;
                        return `
                            <tr class="border-b">
                                 <td class="p-3">${item.name}</td>
                                 <td class="p-3 text-center">${item.quantity}</td>
                                 <td class="p-3 text-right">${item.price.toFixed(2)}</td>
                                 ${gstOn ? `<td class=\"p-3 text-right\">${item.gstPercentage}%</td>` : ''}
                           <td class="p-3 text-right">${lineTotal.toFixed(2)}</td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
            <div class="flex justify-end">
                <div class="w-full max-w-xs space-y-2">
                    <div class="flex justify-between"><span>Subtotal (₹):</span><span>${(saleData.subtotal ?? saleData.items.reduce((s,i)=>s+(i.price*i.quantity),0)).toFixed(2)}</span></div>
                   ${gstOn ? Object.keys(saleData.gstBreakdown.rates || {}).map(rate => 
                         `<div class=\"flex justify-between\"><span>GST (${rate}%) (₹):</span><span>${saleData.gstBreakdown.rates[rate].toFixed(2)}</span></div>`
                    ).join('') : ''}
                    <div class="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total (₹):</span><span>${saleData.totalAmount.toFixed(2)}</span></div>
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>Thank you for your business!</p>
               </div>
        </div>
        <div class="text-center mt-8">
            <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Invoice</button>
            <button id="backFromLocalInvoiceBtn" class="ml-4 bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-md hover:bg-gray-300 transition">Back</button>
        </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
   document.getElementById('backFromLocalInvoiceBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const prev = state.previousRoute;
        if (prev && prev.page) {
            if (prev.page === 'admin') {
                state.adminCurrentTab = prev.adminTab || 'local_sale';
            }
            state.previousRoute = null;
            navigateTo(prev.page);
        } else {
            // Fallback: Admin > Local Sale
            state.adminCurrentTab = 'local_sale';
            navigateTo('admin');
        }
    });
}
        
// --- DATA & FIRESTORE LOGIC ---
const productsColPath = `artifacts/${appId}/public/data/products`;
const productGroupsColPath = `artifacts/${appId}/public/data/productGroups`;
const slidesColPath = `artifacts/${appId}/public/data/heroSlides`;
const ordersColPath = `artifacts/${appId}/public/data/orders`;
const galleryImagesColPath = `artifacts/${appId}/public/data/galleryImages`;
const testimonialsColPath = `artifacts/${appId}/public/data/testimonials`;
const purchasesColPath = `artifacts/${appId}/public/data/purchases`;
const invoiceReusesColPath = `artifacts/${appId}/public/data/audit/invoiceReuses`;
const localSalesColPath = `artifacts/${appId}/public/data/localSales`;
const salesReturnsColPath = `artifacts/${appId}/public/data/salesReturns`;
const purchaseReturnsColPath = `artifacts/${appId}/public/data/purchaseReturns`;
const siteSettingsDocPath = `artifacts/${appId}/public/data/siteSettings/main`;
const countersDocPath = `artifacts/${appId}/public/data/counters/invoiceCounters`;
// Ledgers (collections) — ensure odd number of segments by inserting a fixed document key 'main'
const creditorsLedgerColPath = `artifacts/${appId}/public/data/ledgers/main/creditors`;
const debtorsLedgerColPath = `artifacts/${appId}/public/data/ledgers/main/debtors`;
const cashLedgerColPath = `artifacts/${appId}/public/data/ledgers/main/cash`;
const bankLedgerColPath = `artifacts/${appId}/public/data/ledgers/main/bank`;
// Transfers (contra) collection so transfers are single documents referenced by ledger rows
const transfersColPath = `artifacts/${appId}/public/data/ledgers/main/transfers`;
// Party masters (collections)
const suppliersColPath = `artifacts/${appId}/public/data/masters/main/suppliers`;
const customersColPath = `artifacts/${appId}/public/data/masters/main/customers`;
const banksColPath = `artifacts/${appId}/public/data/masters/main/banks`;
// Legacy collection paths (pre-fix) for backward-compatible reads
const suppliersLegacyColPath = `artifacts/${appId}/public/data/masters/suppliers`;
const customersLegacyColPath = `artifacts/${appId}/public/data/masters/customers`;

// Validate collection path: Firestore collection paths must have an odd number of segments
function isValidCollectionPath(p) {
    try {
        const n = (p || '').split('/').filter(Boolean).length;
        return n % 2 === 1;
    } catch (_) { return false; }
}

// Disable `required` on inputs that are inside hidden containers, and re-enable when visible.
function updateHiddenRequiredInputs() {
    try {
        document.querySelectorAll('[required]').forEach(el => {
            let node = el;
            let hidden = false;
            while (node && node !== document.documentElement) {
                try {
                    // Hidden via Tailwind/class
                    if (node.classList && node.classList.contains && node.classList.contains('hidden')) { hidden = true; break; }
                    // Hidden via boolean hidden attribute (<div hidden>)
                    if (node.hidden === true) { hidden = true; break; }
                    // Hidden via inline style or CSS (display:none / visibility:hidden)
                    const cs = window.getComputedStyle ? window.getComputedStyle(node) : null;
                    if (cs) {
                        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') { hidden = true; break; }
                    }
                    // aria-hidden
                    if (node.getAttribute && node.getAttribute('aria-hidden') === 'true') { hidden = true; break; }
                } catch (_) {
                    // ignore computed style failures
                }
                node = node.parentElement;
            }
            if (hidden) {
                if (!el.dataset._origRequired) el.dataset._origRequired = '1';
                try { el.required = false; } catch(_) {}
            } else {
                if (el.dataset._origRequired) { try { el.required = true; } catch(_) {}; delete el.dataset._origRequired; }
            }
        });
    } catch (_) {}
}

// Format money safely (always returns string with two decimals)
function formatMoney(v) {
    try {
        const n = (typeof v === 'number') ? v : (parseFloat(v) || 0);
        return n.toFixed(2);
    } catch (_) { return '0.00'; }
}

// Lightweight runtime hook: ensure hidden-required inputs are updated after initial render
// and when the DOM mutates (visibility toggles). This avoids inserting calls inside
// large template strings and fixes native form blocking when hidden inputs remain required.
try {
    // Run at DOMContentLoaded and shortly after as a fallback
    document.addEventListener('DOMContentLoaded', () => { try { updateHiddenRequiredInputs(); } catch(_) {} });
    setTimeout(() => { try { updateHiddenRequiredInputs(); } catch(_) {} }, 120);

    // Observe DOM mutations (class changes, subtree changes) and update when needed
    try {
        const observer = new MutationObserver(() => { try { updateHiddenRequiredInputs(); } catch(_) {} });
        const root = document.documentElement || document.body;
        if (root && observer.observe) observer.observe(root, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'style', 'hidden'] });
    } catch (_) {}

    // Also run a quick update after any click (most toggles are click-driven)
    document.addEventListener('click', () => { try { setTimeout(updateHiddenRequiredInputs, 20); } catch(_) {} }, true);
} catch (_) {}


async function getAndIncrementCounter(counterType) {
    const counterRef = doc(db, countersDocPath);
    const year = new Date().getFullYear();
    const fieldName = `${counterType}_${year}`;
    
    try {
        const newCount = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            if (!counterDoc.exists()) {
               transaction.set(counterRef, { [fieldName]: 1 });
               return 1;
            }
            const currentCount = counterDoc.data()[fieldName] || 0;
            const nextCount = currentCount + 1;
           transaction.update(counterRef, { [fieldName]: nextCount });
            return nextCount;
        });
        return `${newCount}/${year}`;
    } catch (e) {
        console.error("Counter transaction failed: ", e);
        // Fallback to a timestamp-based ID if counter fails
        return `ERR-${Date.now()}`;
    }
}

// Peek the next counter value for display without incrementing the stored counter.
async function peekNextCounter(counterType) {
    try {
        const counterRef = doc(db, countersDocPath);
        const year = new Date().getFullYear();
        const fieldName = `${counterType}_${year}`;
        const snap = await getDoc(counterRef);
        if (!snap.exists()) {
            return `1/${year}`;
        }
        const current = snap.data()[fieldName] || 0;
        const next = current + 1;
        return `${next}/${year}`;
    } catch (e) {
        console.error('peekNextCounter failed', e);
        return null;
    }
}

// Format invoice numbers based on a format string stored in site settings.
// Supported tokens: {COUNTER}, {COUNTER_PAD} (4 digits), {YYYY}, {YY}, {MM}, {DD}, {PREFIX}
function zeroPad(num, width) {
    try { const s = String(num || '0'); return s.padStart(width, '0'); } catch(_) { return String(num); }
}

function formatInvoiceFromCounter(counterStr, type) {
    try {
        const formats = (state.siteSettings && state.siteSettings.invoiceFormats) || {};
        const fmt = (formats[type] || '').toString().trim() || null;
        const now = new Date();
        // Parse counterStr like '123/2025' or '123' -> number and maybe year
        let counter = null; let yearFromCounter = null;
        if (counterStr && counterStr.toString().includes('/')) {
            const parts = counterStr.toString().split('/').map(p => p.trim());
            counter = parseInt(parts[0]) || null;
            yearFromCounter = parts[1] || null;
        } else if (counterStr) {
            const n = parseInt(counterStr.toString());
            if (!isNaN(n)) counter = n;
        }
        const YYYY = yearFromCounter || String(now.getFullYear());
        const YY = YYYY.toString().slice(-2);
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const DD = String(now.getDate()).padStart(2, '0');
        const COUNTER = (counter !== null && counter !== undefined) ? String(counter) : (counterStr || '');
        const COUNTER_PAD = (counter !== null && counter !== undefined) ? zeroPad(counter, 4) : COUNTER;
        const PREFIX = (state.siteSettings && state.siteSettings.invoicePrefix) ? String(state.siteSettings.invoicePrefix) : '';
        if (!fmt) {
            // Default format per type
            const defaults = {
                sales: `INV-${YYYY}-${COUNTER_PAD}`,
                purchases: `PUR-${YYYY}-${COUNTER_PAD}`,
                salesReturns: `CR-${YYYY}-${COUNTER_PAD}`,
                purchaseReturns: `DR-${YYYY}-${COUNTER_PAD}`,
                localSales: `LS-${YYYY}-${COUNTER_PAD}`
            };
            return (defaults[type] || `${PREFIX}${COUNTER_PAD}`);
        }
        // Replace tokens
        return fmt.replace(/\{COUNTER_PAD\}/g, COUNTER_PAD)
                  .replace(/\{COUNTER\}/g, COUNTER)
                  .replace(/\{YYYY\}/g, YYYY)
                  .replace(/\{YY\}/g, YY)
                  .replace(/\{MM\}/g, MM)
                  .replace(/\{DD\}/g, DD)
                  .replace(/\{PREFIX\}/g, PREFIX);
    } catch (err) { console.error('formatInvoiceFromCounter error', err); return counterStr; }
}


function listenToProducts() {
    if (state.listeners.products) return; 
    state.listeners.products = onSnapshot(collection(db, productsColPath), snapshot => {
        const epoch = getEpochMs('products');
        state.products = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => {
                if (p.isDeleted) return false;
                const ts = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            });
        // Avoid re-rendering the Admin Purchases tab so we don't lose form state when products update
        if (state.currentPage === 'admin') {
            if (state.adminCurrentTab && state.adminCurrentTab !== 'purchases') {
                renderApp();
            }
        } else if (['home', 'products', 'product_detail', 'cart', 'checkout'].includes(state.currentPage)) {
            renderApp();
        }
    }, error => { console.error("Product listener error:", error); });
}

function listenToProductGroups() {
    if (state.listeners.productGroups) return;
    state.listeners.productGroups = onSnapshot(collection(db, productGroupsColPath), snapshot => {
        const epoch = getEpochMs('productGroups');
        state.productGroups = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(g => {
                if (g.isDeleted) return false;
                const ts = g.createdAt?.seconds ? g.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
        if (state.currentPage === 'admin' || state.currentPage === 'home' || state.currentPage === 'products') {
            renderApp();
        }
    }, error => { console.error("Product groups listener error:", error); });
}

function listenToHeroSlides() {
    if (state.listeners.heroSlides) return;
    state.listeners.heroSlides = onSnapshot(collection(db, slidesColPath), snapshot => {
        const epoch = getEpochMs('slides');
        state.heroSlides = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => {
                if (s.isDeleted) return false;
                const ts = s.createdAt?.seconds ? s.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'home') {
            renderHomePage();
        } else if (state.currentPage === 'admin' && state.adminCurrentTab === 'media') {
            renderAdminMediaPage();
        }
    }, error => { console.error("Hero slides listener error:", error); });
}

function listenToGalleryImages() {
    if (state.listeners.galleryImages) return;
    state.listeners.galleryImages = onSnapshot(query(collection(db, galleryImagesColPath)), snapshot => {
        const epoch = getEpochMs('galleryImages');
        state.galleryImages = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(img => {
                if (img.isDeleted) return false;
                const ts = img.createdAt?.seconds ? img.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'home') {
            renderHomePage();
        } else if (state.currentPage === 'admin' && state.adminCurrentTab === 'media') {
            renderAdminMediaPage();
        }
    }, error => { console.error("Gallery images listener error:", error); });
}
        
function listenToSiteSettings() {
    if(state.listeners.siteSettings) return;
    state.listeners.siteSettings = onSnapshot(doc(db, siteSettingsDocPath), (docSnap) => {
        if (docSnap.exists()) {
            const incoming = docSnap.data();
            if (!incoming.visibilityEpochs) incoming.visibilityEpochs = {};
            // Enforce business rule in local state: sales GST mirrors registration
            const enforcedIsGstEnabled = !!incoming.merchantGstRegistered;
            const prevEpochs = { ...(state.siteSettings?.visibilityEpochs || {}) };
            state.siteSettings = { ...state.siteSettings, ...incoming, isGstEnabled: enforcedIsGstEnabled };
            refreshAdminState();

            // If orders epoch changed, re-filter in-memory arrays immediately to hide legacy docs
            const newOrdersEpoch = state.siteSettings.visibilityEpochs?.orders || 0;
            if ((prevEpochs.orders || 0) !== newOrdersEpoch) {
                // Re-filter user orders
                if (Array.isArray(state.orders)) {
                    const beforeIds = new Set(state.orders.map(o => o.id));
                    state.orders = state.orders.filter(o => {
                        if (o?.isDeleted) return false;
                        const ts = o?.orderDate?.seconds ? o.orderDate.seconds * 1000 : 0;
                        return ts >= newOrdersEpoch;
                    });
                    const afterIds = new Set(state.orders.map(o => o.id));
                    // Unsubscribe overlays for orders no longer present
                    if (state.userOrderPublicUnsubs) {
                        for (const [id, unsub] of Object.entries(state.userOrderPublicUnsubs)) {
                            if (!afterIds.has(id)) { try { unsub(); } catch {} delete state.userOrderPublicUnsubs[id]; }
                        }
                    }
                }
                // Re-filter admin allOrders
                if (Array.isArray(state.allOrders)) {
                    state.allOrders = state.allOrders.filter(o => {
                        if (o?.isDeleted) return false;
                        const ts = o?.orderDate?.seconds ? o.orderDate.seconds * 1000 : 0;
                        return ts >= newOrdersEpoch;
                    });
                }
                if (state.currentPage === 'orders' || (state.currentPage === 'admin')) {
                    renderApp();
                }
            }
        }
        renderTopBars();
    }, error => {
        console.error("Site settings listener error:", error);
    });
}

function listenToTestimonials() {
    if (state.listeners.testimonials) return;
    const q = query(collection(db, testimonialsColPath), where("approved", "==", true));
    state.listeners.testimonials = onSnapshot(q, snapshot => {
        const epoch = getEpochMs('testimonials');
        state.testimonials = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(t => {
                if (t.isDeleted) return false;
                const ts = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'home' || state.currentPage === 'testimonials') {
            renderApp();
        }
    }, error => { console.error("Testimonials listener error:", error); });
}

function listenToAllTestimonials() {
    if (state.listeners.allTestimonials) state.listeners.allTestimonials();
    state.listeners.allTestimonials = onSnapshot(query(collection(db, testimonialsColPath)), snapshot => {
        const epoch = getEpochMs('testimonials');
        state.allTestimonials = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(t => {
                if (t.isDeleted) return false;
                const ts = t.createdAt?.seconds ? t.createdAt.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'testimonials') {
            renderAdminTestimonialsList();
        }
    }, error => {
        console.error("Admin testimonials listener error:", error);
    });
}

function listenToAllPurchases() {
    if (state.listeners.allPurchases) state.listeners.allPurchases();
    // **MODIFIED:** Listen to ALL purchases, including deleted ones, for comprehensive internal records/logic
    state.listeners.allPurchases = onSnapshot(query(collection(db, purchasesColPath)), snapshot => {
        const epoch = getEpochMs('purchases');
        state.allPurchases = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => {
                // Include deleted purchases so dropdowns and reuse logic can access their invoice numbers.
                if (p.isDeleted) return true;
                // Visibility should consider documents created after the epoch as well as
                // those whose invoice/purchaseDate is recent. This lets newly-created
                // purchases (even with an older invoice date) show up in admin UI.
                const tsPurchaseDate = p.purchaseDate?.seconds ? p.purchaseDate.seconds * 1000 : 0;
                const tsCreatedAt = p.createdAt?.seconds ? p.createdAt.seconds * 1000 : 0;
                return (tsPurchaseDate >= epoch) || (tsCreatedAt >= epoch);
            });
        if (state.currentPage === 'admin' && (state.adminCurrentTab === 'purchases' || state.adminCurrentTab === 'reports')) {
            renderApp();
        }
    }, error => {
        console.error("Admin purchases listener error:", error);
    });
}
        
function listenToAllLocalSales() {
    if (state.listeners.allLocalSales) state.listeners.allLocalSales();
    state.listeners.allLocalSales = onSnapshot(query(collection(db, localSalesColPath)), snapshot => {
        const epoch = getEpochMs('localSales');
        state.allLocalSales = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(s => {
                if (s.isDeleted) return false;
                const ts = s.saleDate?.seconds ? s.saleDate.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'reports') {
            renderApp();
        }
    }, error => {
        console.error("Admin local sales listener error:", error);
    });
}

function listenToAllSalesReturns() {
    if (state.listeners.allSalesReturns) state.listeners.allSalesReturns();
    state.listeners.allSalesReturns = onSnapshot(query(collection(db, salesReturnsColPath)), snapshot => {
        const epoch = getEpochMs('salesReturns');
        state.allSalesReturns = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(r => {
                if (r.isDeleted) return false;
                const ts = r.returnDate?.seconds ? r.returnDate.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'reports') {
            renderAdminBillingPage();
        }
    }, error => {
        console.error("Admin sales returns listener error:", error);
    });
}

function listenToAllPurchaseReturns() {
    if (state.listeners.allPurchaseReturns) state.listeners.allPurchaseReturns();
    state.listeners.allPurchaseReturns = onSnapshot(query(collection(db, purchaseReturnsColPath)), snapshot => {
        const epoch = getEpochMs('purchaseReturns');
        state.allPurchaseReturns = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(r => {
                if (r.isDeleted) return false;
                const ts = r.returnDate?.seconds ? r.returnDate.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'reports') {
            renderAdminBillingPage();
        }
    }, error => {
        console.error("Admin purchase returns listener error:", error);
    });
}

// --- LEDGER LISTENERS ---
function listenToAllCreditorsLedger() {
    if (state.listeners.allCreditorsLedger) state.listeners.allCreditorsLedger();
    state.listeners.allCreditorsLedger = onSnapshot(query(collection(db, creditorsLedgerColPath)), snapshot => {
        state.allCreditorsLedger = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(e => !e.isDeleted);
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, error => {
        console.error('Admin creditors ledger listener error:', error);
    });
}

// --- PARTY MASTER LISTENERS ---
function listenToSuppliers() {
    if (state.listeners.allSuppliers) state.listeners.allSuppliers();
    const unsubPrimary = onSnapshot(query(collection(db, suppliersColPath)), snapshot => {
        const primary = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
        state.__primarySuppliers = primary;
        // Merge with legacy (if already loaded)
        const legacy = Array.isArray(state.__legacySuppliers) ? state.__legacySuppliers : [];
        const merged = [...primary, ...legacy].reduce((acc, cur) => {
            const key = (cur.name || '').toLowerCase();
            if (!acc._seen.has(key)) { acc._seen.add(key); acc.items.push(cur); }
            return acc;
        }, { _seen: new Set(), items: [] }).items;
        state.allSuppliers = merged;
        if (state.currentPage === 'admin') {
            if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
            if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
        }
    }, err => console.error('Suppliers listener error:', err));

    // Legacy optional listener: guard invalid/old paths to avoid console errors
    let unsubLegacy = () => {};
    if (isValidCollectionPath(suppliersLegacyColPath)) {
        try {
            const legacyCol = collection(db, suppliersLegacyColPath);
            unsubLegacy = onSnapshot(query(legacyCol), snapshot => {
                state.__legacySuppliers = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
                const evt = new Event('legacySuppliersLoaded');
                document.dispatchEvent(evt);
                if (state.currentPage === 'admin') {
                    if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
                    if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
                }
            }, err => console.warn('Suppliers legacy listener error:', err?.message || err));
        } catch (err) {
            console.warn('Suppliers legacy listener error:', err?.message || err);
        }
    }

    // Compose unsubscriber
    state.listeners.allSuppliers = () => { try { unsubPrimary(); } catch {} try { unsubLegacy(); } catch {} };
}

function listenToCustomers() {
    if (state.listeners.allCustomers) state.listeners.allCustomers();
    const unsubPrimary = onSnapshot(query(collection(db, customersColPath)), snapshot => {
        const primary = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
        state.__primaryCustomers = primary;
        const legacy = Array.isArray(state.__legacyCustomers) ? state.__legacyCustomers : [];
        const merged = [...primary, ...legacy].reduce((acc, cur) => {
            const key = (cur.name || '').toLowerCase();
            if (!acc._seen.has(key)) { acc._seen.add(key); acc.items.push(cur); }
            return acc;
        }, { _seen: new Set(), items: [] }).items;
        state.allCustomers = merged;
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, err => console.error('Customers listener error:', err));

    let unsubLegacy = () => {};
    if (isValidCollectionPath(customersLegacyColPath)) {
        try {
            const legacyCol = collection(db, customersLegacyColPath);
            unsubLegacy = onSnapshot(query(legacyCol), snapshot => {
                state.__legacyCustomers = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
                const evt = new Event('legacyCustomersLoaded');
                document.dispatchEvent(evt);
                if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
                    renderAdminLedgersPage();
                }
            }, err => console.warn('Customers legacy listener error:', err?.message || err));
        } catch (err) {
            console.warn('Customers legacy listener error:', err?.message || err);
        }
    }

    state.listeners.allCustomers = () => { try { unsubPrimary(); } catch {} try { unsubLegacy(); } catch {} };
}

function listenToAllDebtorsLedger() {
    if (state.listeners.allDebtorsLedger) state.listeners.allDebtorsLedger();
    state.listeners.allDebtorsLedger = onSnapshot(query(collection(db, debtorsLedgerColPath)), snapshot => {
        state.allDebtorsLedger = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(e => !e.isDeleted);
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, error => {
        console.error('Admin debtors ledger listener error:', error);
    });
}

function listenToAllCashLedger() {
    if (state.listeners.allCashLedger) state.listeners.allCashLedger();
    state.listeners.allCashLedger = onSnapshot(query(collection(db, cashLedgerColPath)), snapshot => {
        state.allCashLedger = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, err => console.error('Cash ledger listener error:', err));
}

function listenToAllBankLedger() {
    if (state.listeners.allBankLedger) state.listeners.allBankLedger();
    state.listeners.allBankLedger = onSnapshot(query(collection(db, bankLedgerColPath)), snapshot => {
        state.allBankLedger = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.isDeleted);
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, err => console.error('Bank ledger listener error:', err));
}

function listenToBanks() {
    if (state.listeners.allBanks) state.listeners.allBanks();
    state.listeners.allBanks = onSnapshot(query(collection(db, banksColPath)), snapshot => {
        state.allBanks = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(b => !b.isDeleted)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        if (state.currentPage === 'admin' && state.adminCurrentTab === 'transactions') {
            renderAdminLedgersPage();
        }
    }, err => console.error('Banks listener error:', err));
}

function listenToCart(userId) {
    if (state.listeners.cart) state.listeners.cart();
    const cartRef = doc(db, `artifacts/${appId}/users/${userId}/cart`, 'user_cart');
    state.listeners.cart = onSnapshot(cartRef, (doc) => {
        state.cart = doc.exists() ? doc.data() : { items: {} };
        renderHeader(); 
        if (state.currentPage === 'cart' || state.currentPage === 'checkout') renderApp();
    });
}

function userProfileDocRef(uid) {
    return doc(db, `artifacts/${appId}/users/${uid}/profile`, 'main');
}

function listenToUserProfile(userId) {
    if (state.listeners.profile) { state.listeners.profile(); state.listeners.profile = null; }
    const ref = userProfileDocRef(userId);
    state.listeners.profile = onSnapshot(ref, (docSnap) => {
        state.userProfile = docSnap.exists() ? docSnap.data() : null;
        if (state.currentPage === 'account' || state.currentPage === 'checkout') {
            renderApp();
        }
    }, (err) => {
        console.warn('Profile listener error:', err?.message || err);
    });
}

function listenToUserOrders(userId) {
    // If an orders listener already exists, unsubscribe it first to avoid stale listeners
    if (state.listeners.orders) {
        try { state.listeners.orders(); } catch (_) {}
        state.listeners.orders = null;
    }
    const userOrdersPath = `artifacts/${appId}/users/${userId}/orders`;
    state.listeners.orders = onSnapshot(query(collection(db, userOrdersPath)), snapshot => {
        const epoch = getEpochMs('orders');
        state.orders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(o => {
                if (o.isDeleted) return false;
                // Extra safety: if userId field exists, ensure it matches the signed-in user
                if (o.userId && o.userId !== userId) return false;
                const ts = o.orderDate?.seconds ? o.orderDate.seconds * 1000 : 0;
                return ts >= epoch;
            });

        // Ensure we mirror the authoritative status from the public order doc even if we can't write to user subcollection
        state.userOrderPublicUnsubs = state.userOrderPublicUnsubs || {};
        const currentIds = new Set(state.orders.map(o => o.id));

        // Unsubscribe listeners for orders no longer present
        for (const [id, unsub] of Object.entries(state.userOrderPublicUnsubs)) {
            if (!currentIds.has(id)) {
                try { unsub(); } catch {}
                delete state.userOrderPublicUnsubs[id];
            }
        }

        // Attach listeners for current orders to mirror status from public collection
        for (const o of state.orders) {
            if (!state.userOrderPublicUnsubs[o.id]) {
                const pubRef = doc(db, ordersColPath, o.id);
                state.userOrderPublicUnsubs[o.id] = onSnapshot(pubRef, (pubSnap) => {
                    if (!pubSnap.exists()) return;
                    const pubData = pubSnap.data();
                    const idx = state.orders.findIndex(ord => ord.id === o.id);
                    if (idx !== -1) {
                        // Overlay status (and optionally other fields in future)
                        state.orders[idx] = { ...state.orders[idx], status: pubData.status };
                        if (state.currentPage === 'orders') renderApp();
                    }
                }, err => {
                    // If public read is denied, we silently skip overlay
                    console.warn('Public order mirror failed for', o.id, err?.message || err);
                });
            }
        }

        if (state.currentPage === 'orders') renderApp();
    });
}

function listenToAllOrders() {
    if (state.listeners.allOrders) state.listeners.allOrders();
    state.listeners.allOrders = onSnapshot(query(collection(db, ordersColPath)), snapshot => {
        const epoch = getEpochMs('orders');
        state.allOrders = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(o => {
                if (o.isDeleted) return false;
                const ts = o.orderDate?.seconds ? o.orderDate.seconds * 1000 : 0;
                return ts >= epoch;
            });
        if (state.currentPage === 'admin') renderApp();
    }, error => {
        console.error("Admin orders listener error:", error);
        showMessage("Error loading all orders for admin.");
    });
}
        
async function updateCart(productId, quantity) {
     if (!state.currentUser || state.currentUser.isAnonymous) {
         showMessage("Please log in to manage your cart.");
         navigateTo('auth');
         return;
     }
    const cartRef = doc(db, `artifacts/${appId}/users/${state.currentUser.uid}/cart`, 'user_cart');
    const newItems = { ...state.cart.items };
    if (quantity > 0) newItems[productId] = { quantity: quantity };
    else delete newItems[productId];
    await setDoc(cartRef, { items: newItems }, { merge: true });
}
        
async function addToCart(productId, quantity = 1) {
    if (!state.currentUser || state.currentUser.isAnonymous) {
        showMessage("Please log in to add items to your cart.");
        navigateTo('auth');
        return;
    }
    const product = state.products.find(p => p.id === productId);
    if (!product || (product.stock || 0) < quantity) {
        showMessage("Sorry, this item is out of stock or not available in the requested quantity.");
        return;
    }
    const currentQuantity = state.cart.items[productId]?.quantity || 0;
    const newQuantity = currentQuantity + quantity;
    await updateCart(productId, newQuantity);
    showMessage("Item added to cart!");
}

// --- ADMIN PRODUCT GROUP HANDLERS ---
function resetGroupForm() {
    const form = document.getElementById('groupForm');
    if (!form) return;
    form.reset();
    document.getElementById('groupId').value = '';
    const submitBtn = document.getElementById('groupFormSubmitBtn');
    document.getElementById('groupFormTitle').textContent = 'Add New Product Group';
    submitBtn.textContent = 'Add Group';
    submitBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
    document.getElementById('groupFormCancelBtn').classList.add('hidden');
}

async function handleGroupFormSubmit(e) {
    e.preventDefault();
    const groupId = document.getElementById('groupId').value;
    const groupName = document.getElementById('groupName').value;
    if (!groupName) return;

    const groupData = { name: groupName };

    try {
        if (groupId) {
            const oldGroup = state.productGroups.find(g => g.id === groupId);
            if (oldGroup && oldGroup.name !== groupName) {
                const batch = writeBatch(db);
                const q = query(collection(db, productsColPath), where("productGroup", "==", oldGroup.name));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach((doc) => {
                    batch.update(doc.ref, { productGroup: groupName });
                });
                await batch.commit();
            }
            await setDoc(doc(db, productGroupsColPath, groupId), groupData);
            showMessage('Product group updated successfully!');
        } else {
            await addDoc(collection(db, productGroupsColPath), { ...groupData, createdAt: serverTimestamp() });
            showMessage('Product group added successfully!');
        }
        resetGroupForm();
    } catch (error) {
        console.error("Error saving product group:", error);
        showMessage("Failed to save product group.");
    }
}

function handleEditGroupClick(e) {
    const btn = e.currentTarget;
    const groupId = btn.dataset.id;
    const groupName = btn.dataset.name;
    
    document.getElementById('groupId').value = groupId;
    document.getElementById('groupName').value = groupName;

    const submitBtn = document.getElementById('groupFormSubmitBtn');
    document.getElementById('groupFormTitle').textContent = 'Edit Product Group';
    submitBtn.textContent = 'Update Group';
    submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
    submitBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
    document.getElementById('groupFormCancelBtn').classList.remove('hidden');
    document.getElementById('groupFormTitle').scrollIntoView({ behavior: 'smooth' });
}

async function handleDeleteGroupClick(e) {
    const btn = e.currentTarget;
    const groupId = btn.dataset.id;
    
    try {
        const groupToDelete = state.productGroups.find(g => g.id === groupId);
        if (groupToDelete) {
             const batch = writeBatch(db);
             const q = query(collection(db, productsColPath), where("productGroup", "==", groupToDelete.name));
             const querySnapshot = await getDocs(q);
             querySnapshot.forEach((doc) => {
                  batch.update(doc.ref, { productGroup: "" }); // Set to empty string
             });
             await batch.commit();
        }

        await deleteDoc(doc(db, productGroupsColPath, groupId));
        showMessage('Product group deleted and products updated.');
    } catch (error) {
        console.error("Error deleting group:", error);
        showMessage('Failed to delete product group.');
    }
}


function attachAdminListeners() {
    // Helper function to reset the product form
    function resetProductForm() {
        const form = document.getElementById('productForm');
        if (!form) return;
        form.reset();
        document.getElementById('productId').value = '';
        document.getElementById('avgPurchasePriceDisplay').textContent = 'N/A';
        document.getElementById('lastPurchasePriceDisplay').textContent = 'N/A';
        const submitBtn = document.getElementById('productFormSubmitBtn');
        document.getElementById('productFormTitle').textContent = 'Add New Product';
        submitBtn.textContent = 'Add Product';
        submitBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        document.getElementById('productFormCancelBtn').classList.add('hidden');
    }

    // Helper function to reset the slide form
    function resetSlideForm() {
        const form = document.getElementById('slideForm');
        if (!form) return;
        form.reset();
        document.getElementById('slideId').value = '';
        const submitBtn = document.getElementById('slideFormSubmitBtn');
        document.getElementById('slideFormTitle').textContent = 'Add New Hero Slide';
        submitBtn.textContent = 'Add Slide';
        submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
        submitBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        document.getElementById('slideFormCancelBtn').classList.add('hidden');
    }
    
    // Product form submission
    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const productId = document.getElementById('productId').value;
            const gstPercentageEl = document.getElementById('gstPercentage');
            const productData = {
                name: document.getElementById('productName').value,
                description: document.getElementById('productDescription').value,
                salePrice: parseFloat(document.getElementById('salePrice').value) || 0,
                gstPercentage: gstPercentageEl ? parseInt(gstPercentageEl.value) : 0,
                category: document.getElementById('productCategory').value,
                productGroup: document.getElementById('productGroup').value,
                image: document.getElementById('productImage').value,
            };

            try {
                if (productId) {
                    productData.updatedAt = serverTimestamp();
                    await setDoc(doc(db, productsColPath, productId), productData, { merge: true });
                    showMessage('Product updated successfully!');
                } else {
                    productData.createdAt = serverTimestamp();
                    productData.purchasePrice = 0;
                    productData.lastPurchasePrice = 0;
                    productData.stock = 0;
                    await addDoc(collection(db, productsColPath), productData);
                    showMessage('Product added successfully!');
                }
                resetProductForm();
            } catch (error) {
               console.error("Error saving product:", error);
               showMessage("Failed to save product.");
            }
        });
    }
    
    // Product form cancel button
    const productFormCancelBtn = document.getElementById('productFormCancelBtn');
    if (productFormCancelBtn) {
       productFormCancelBtn.addEventListener('click', resetProductForm);
    }

    // Inline Add Product Group (from product form)
    const showNewGroupBtn = document.getElementById('showNewProductGroupBtn');
    const newGroupRow = document.getElementById('newProductGroupRow');
    const newGroupNameInput = document.getElementById('newProductGroupName');
    const addGroupInlineBtn = document.getElementById('addProductGroupInlineBtn');
    const cancelNewGroupBtn = document.getElementById('cancelNewProductGroupBtn');
    if (showNewGroupBtn && newGroupRow) {
        showNewGroupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            newGroupRow.classList.toggle('hidden');
            if (!newGroupRow.classList.contains('hidden')) {
                // focus input
                setTimeout(() => newGroupNameInput && newGroupNameInput.focus(), 50);
            }
        });
    }
    if (cancelNewGroupBtn && newGroupRow) {
        cancelNewGroupBtn.addEventListener('click', (e) => { e.preventDefault(); newGroupRow.classList.add('hidden'); if (newGroupNameInput) newGroupNameInput.value = ''; });
    }
    if (addGroupInlineBtn) {
        addGroupInlineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = (newGroupNameInput?.value || '').trim();
            if (!name) { showMessage('Enter a group name.'); return; }
            // Prevent duplicates (case-insensitive)
            const exists = (state.productGroups || []).some(g => (g.name || '').trim().toLowerCase() === name.toLowerCase());
            if (exists) { showMessage('A product group with this name already exists.'); return; }
            try {
                // Ensure there's no existing group with the same name in Firestore
                try {
                    const q = query(collection(db, productGroupsColPath), where('name', '==', name));
                    const existing = await getDocs(q);
                    if (existing && !existing.empty) {
                        // sync state from canonical source and select existing
                        const snap = await getDocs(collection(db, productGroupsColPath));
                        const allGroups = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
                        const seen = {};
                        state.productGroups = allGroups.filter(g => {
                            const k = (g.name || '').toString().trim().toLowerCase();
                            if (!k) return false;
                            if (seen[k]) return false;
                            seen[k] = true;
                            return true;
                        });
                        const sel = document.getElementById('productGroup');
                        if (sel) sel.innerHTML = '<option value="">None</option>' + (state.productGroups || []).map(g => `<option value="${(g.id||g.name)}">${(g.name||g.id)}</option>`).join('');
                        const found = existing.docs[0];
                        const foundName = found.data().name;
                        sel.value = state.productGroups.find(g => (g.name||'').trim().toLowerCase() === foundName.trim().toLowerCase())?.id || '';
                        showMessage('A product group with this name already exists. Selected existing group.');
                        if (newGroupNameInput) newGroupNameInput.value = '';
                        if (newGroupRow) newGroupRow.classList.add('hidden');
                        return;
                    }
                } catch (qerr) {
                    // if query fails, continue with optimistic add
                    console.warn('Product group existence check failed:', qerr);
                }

                const ref = await addDoc(collection(db, productGroupsColPath), { name, createdAt: serverTimestamp() });
                // Optimistically update state & select
                state.productGroups = [{ id: ref.id, name }, ...(state.productGroups || [])];
                const sel = document.getElementById('productGroup');
                if (sel) {
                    // After adding, re-sync canonical productGroups from Firestore
                    try {
                        const snap = await getDocs(collection(db, productGroupsColPath));
                        // map and dedupe by name (case-insensitive) to avoid duplicates persisted earlier
                        const allGroups = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
                        const seen = {};
                        state.productGroups = allGroups.filter(g => {
                            const k = (g.name || '').toString().trim().toLowerCase();
                            if (!k) return false;
                            if (seen[k]) return false;
                            seen[k] = true;
                            return true;
                        });
                        // rebuild select using IDs as values
                        sel.innerHTML = '<option value="">None</option>' + (state.productGroups || []).map(g => `<option value="${(g.id||g.name)}">${(g.name||g.id)}</option>`).join('');
                        sel.value = state.productGroups.find(g => (g.name||'') .trim().toLowerCase() === name.toLowerCase())?.id || name;
                    } catch (e) {
                        // fallback to optimistic update
                        const opt = document.createElement('option'); opt.value = name; opt.text = name; sel.appendChild(opt); sel.value = name;
                    }
                }
                showMessage('Product group added.');
                if (newGroupNameInput) newGroupNameInput.value = '';
                if (newGroupRow) newGroupRow.classList.add('hidden');
                // If admin product/groups tab is active, refresh it so the new group appears in lists
                try {
                    if (state.currentPage === 'admin') {
                        if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage();
                        else if (state.adminCurrentTab === 'products') renderAdminProductList();
                    }
                } catch (e) { /* non-fatal */ }
            } catch (err) {
                console.error('Failed to add product group:', err);
                showMessage('Failed to add product group.');
            }
        });
    }

    // Inline Add Product Group (from New Product modal)
    const showModalNewGroupBtn = document.getElementById('showModalNewProductGroupBtn');
    const modalNewGroupRow = document.getElementById('modalNewProductGroupRow');
    const modalNewGroupNameInput = document.getElementById('modalNewProductGroupName');
    const modalAddGroupBtn = document.getElementById('modalAddProductGroupInlineBtn');
    const modalCancelNewGroupBtn = document.getElementById('modalCancelNewProductGroupBtn');
    const modalProductGroupSel = document.getElementById('modalProductGroup');
    if (showModalNewGroupBtn && modalNewGroupRow) {
        showModalNewGroupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modalNewGroupRow.classList.toggle('hidden');
            if (!modalNewGroupRow.classList.contains('hidden')) {
                setTimeout(() => modalNewGroupNameInput && modalNewGroupNameInput.focus(), 50);
            }
        });
    }
    if (modalCancelNewGroupBtn && modalNewGroupRow) {
        modalCancelNewGroupBtn.addEventListener('click', (e) => { e.preventDefault(); modalNewGroupRow.classList.add('hidden'); if (modalNewGroupNameInput) modalNewGroupNameInput.value = ''; });
    }
    if (modalAddGroupBtn) {
        modalAddGroupBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = (modalNewGroupNameInput?.value || '').trim();
            if (!name) { showMessage('Enter a group name.'); return; }
            const exists = (state.productGroups || []).some(g => (g.name || '').trim().toLowerCase() === name.toLowerCase());
            if (exists) { showMessage('A product group with this name already exists.'); return; }
            try {
                const ref = await addDoc(collection(db, productGroupsColPath), { name, createdAt: serverTimestamp() });
                // Update state and modal select
                state.productGroups = [{ id: ref.id, name }, ...(state.productGroups || [])];
                    if (modalProductGroupSel) {
                        try {
                            const snap = await getDocs(collection(db, productGroupsColPath));
                            const allGroups = snap.docs.map(d => ({ id: d.id, name: d.data().name }));
                            const seen2 = {};
                            state.productGroups = allGroups.filter(g => {
                                const k = (g.name || '').toString().trim().toLowerCase();
                                if (!k) return false;
                                if (seen2[k]) return false;
                                seen2[k] = true;
                                return true;
                            });
                            modalProductGroupSel.innerHTML = '<option value="">— Select group —</option>' + (state.productGroups || []).map(g => `<option value="${(g.id||g.name)}">${(g.name||g.id)}</option>`).join('');
                            modalProductGroupSel.value = state.productGroups.find(g => (g.name||'').trim().toLowerCase() === name.toLowerCase())?.id || '';
                        } catch (e) {
                            // fallback to optimistic append
                            const opt = document.createElement('option'); opt.value = name; opt.text = name; modalProductGroupSel.appendChild(opt); modalProductGroupSel.value = name;
                        }
                    }
                showMessage('Product group added.');
                if (modalNewGroupNameInput) modalNewGroupNameInput.value = '';
                if (modalNewGroupRow) modalNewGroupRow.classList.add('hidden');
                try {
                    if (state.currentPage === 'admin') {
                        if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage();
                        else if (state.adminCurrentTab === 'products') renderAdminProductList();
                    }
                } catch (e) { /* non-fatal */ }
            } catch (err) {
                console.error('Failed to add product group (modal):', err);
                showMessage('Failed to add product group.');
            }
        });
    }

    // Slide form submission
    const slideForm = document.getElementById('slideForm');
    if (slideForm) {
       slideForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const slideId = document.getElementById('slideId').value;
            const slideData = {
                headline: document.getElementById('slideHeadline').value,
                subtitle: document.getElementById('slideSubtitle').value,
                imageUrl: document.getElementById('slideImageUrl').value,
                buttonText: document.getElementById('slideButtonText').value,
                buttonLink: document.getElementById('slideButtonLink').value,
            };

            try {
                if (slideId) {
                    await setDoc(doc(db, slidesColPath, slideId), slideData, { merge: true });
                    showMessage('Slide updated successfully!');
                } else {
                    await addDoc(collection(db, slidesColPath), { ...slideData, createdAt: serverTimestamp() });
                    showMessage('Slide added successfully!');
                }
                resetSlideForm();
            } catch (error) {
               console.error("Error saving slide:", error);
               showMessage("Failed to save slide.");
            }
        });
    }

    // Slide form cancel button
    const slideFormCancelBtn = document.getElementById('slideFormCancelBtn');
    if (slideFormCancelBtn) {
       slideFormCancelBtn.addEventListener('click', resetSlideForm);
    }

            const settingsForm = document.getElementById('settingsForm');
    if(settingsForm) {
       settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Saving settings...');
            // Read settings inputs defensively: some deployments may omit certain inputs
            const scrollingBarTextEl = document.getElementById('scrollingBarText');
            const scrollingBarVisibleEl = document.getElementById('scrollingBarVisible');
            const merchantGstRegisteredEl = document.getElementById('merchantGstRegistered');
            const merchantGstinEl = document.getElementById('merchantGstin');
            const merchantStateCodeEl = document.getElementById('merchantStateCode');
            const businessAddressEl = document.getElementById('businessAddress');

                // Enforce uppercase for merchant GSTIN input (if present)
                try { enforceUppercaseInput(merchantGstinEl); } catch(_) {}
                // Ensure a textual feedback element exists for merchant GSTIN and attach validation styling
                try {
                    let feedbackEl = document.getElementById('merchantGstinFeedback');
                    if (!feedbackEl && merchantGstinEl && merchantGstinEl.parentNode) {
                        feedbackEl = document.createElement('div');
                        feedbackEl.id = 'merchantGstinFeedback';
                        feedbackEl.setAttribute('data-testid', 'merchantGstinFeedback');
                        feedbackEl.setAttribute('role', 'status');
                        feedbackEl.setAttribute('aria-live', 'polite');
                        feedbackEl.setAttribute('data-validation-state', '');
                        feedbackEl.className = 'text-xs text-red-600 mt-1 hidden';
                        merchantGstinEl.parentNode.insertBefore(feedbackEl, merchantGstinEl.nextSibling);
                    }
                    attachGstinValidation(merchantGstinEl, feedbackEl);
                } catch(_) {}

            const newSettings = {
                scrollingBarText: (scrollingBarTextEl?.value) || '',
                isScrollingBarVisible: !!(scrollingBarVisibleEl?.checked),
                merchantGstRegistered: !!(merchantGstRegisteredEl?.checked),
                // --- UPDATED: Save new GST fields ---
                merchantGstin: (merchantGstRegisteredEl?.checked ? ((merchantGstinEl?.value || '').toString().trim().toUpperCase()) : ''),
                merchantStateCode: (merchantStateCodeEl?.value || ''),
                businessAddress: (businessAddressEl?.value || ''),
                // ------------------------------------
            };
            const adminEmailsInput = document.getElementById('adminEmails');
            const adminUidsInput = document.getElementById('adminUids');
            newSettings.adminEmails = adminEmailsInput ? normalizeList(adminEmailsInput.value).map(email => email.toLowerCase()) : [];
            newSettings.adminUids = adminUidsInput ? normalizeList(adminUidsInput.value) : [];
            try {
                // Enforce sales GST based on registration (no separate toggle)
                const payload = { ...newSettings, isGstEnabled: !!newSettings.merchantGstRegistered };
                // Collect invoice format settings from injected UI (if present)
                try {
                    const fmt_sales = document.getElementById('fmt_sales')?.value || '';
                    const fmt_purchases = document.getElementById('fmt_purchases')?.value || '';
                    const fmt_salesReturns = document.getElementById('fmt_salesReturns')?.value || '';
                    const fmt_purchaseReturns = document.getElementById('fmt_purchaseReturns')?.value || '';
                    const fmt_localSales = document.getElementById('fmt_localSales')?.value || '';
                    const invoicePrefixEl = document.getElementById('invoicePrefix');
                    const invoicePrefixVal = invoicePrefixEl ? (invoicePrefixEl.value || '') : '';
                    payload.invoiceFormats = {
                        sales: fmt_sales,
                        purchases: fmt_purchases,
                        salesReturns: fmt_salesReturns,
                        purchaseReturns: fmt_purchaseReturns,
                        localSales: fmt_localSales
                    };
                    if (invoicePrefixVal) payload.invoicePrefix = invoicePrefixVal;
                } catch (_) {}
                // If master password fields present and a new password was provided, compute and save its SHA-256 hash
                try {
                    const mpEl = document.getElementById('masterPassword');
                    const mpConfirmEl = document.getElementById('masterPasswordConfirm');
                    if (mpEl && (mpEl.value || '').toString().trim().length > 0) {
                        const pwd = mpEl.value.toString();
                        const conf = mpConfirmEl ? (mpConfirmEl.value || '').toString() : '';
                        if (pwd !== conf) { showMessage('Master password and confirmation do not match.'); return; }
                        try {
                            // Require recent phone verification (2FA) before saving a new master password
                            const verified = state.masterPasswordPhoneVerified && (Date.now() - (state.masterPasswordPhoneVerifiedAt || 0) < (5 * 60 * 1000));
                            if (!verified) { showMessage('Please verify your admin phone via the "Send OTP" button before setting a new master password.'); return; }
                            const hash = await sha256Hex(pwd);
                            payload.masterResetPasswordHash = hash;
                        } catch (err) {
                            console.error('Failed to hash master password', err);
                            showMessage('Failed to process master password.');
                            return;
                        }
                    }
                } catch (_) {}
                // If user password fields present and a new password was provided, require master password and save its SHA-256 hash
                try {
                    const upEl = document.getElementById('userPassword');
                    const upConfirmEl = document.getElementById('userPasswordConfirm');
                    if (upEl && (upEl.value || '').toString().trim().length > 0) {
                        const pwd = upEl.value.toString();
                        const conf = upConfirmEl ? (upConfirmEl.value || '').toString() : '';
                        if (pwd !== conf) { showMessage('User password and confirmation do not match.'); return; }
                        try {
                            // Require master password verification before setting user password
                            const verified = await verifyMasterPassword('set user password');
                            if (!verified) { showMessage('Master password verification required to set user password.'); return; }
                            const hash = await sha256Hex(pwd);
                            payload.userPasswordHash = hash;
                        } catch (err) {
                            console.error('Failed to hash user password', err);
                            showMessage('Failed to process user password.');
                            return;
                        }
                    }
                } catch (_) {}
                await setDoc(doc(db, siteSettingsDocPath), payload, { merge: true });
                showMessage("Settings saved successfully!");
                console.log('Settings saved:', payload);
                // Keep local state in sync immediately
                state.siteSettings = { ...state.siteSettings, ...payload };
                // Clear any master password inputs from the form for security
                try { const mp = document.getElementById('masterPassword'); const mpc = document.getElementById('masterPasswordConfirm'); if (mp) mp.value = ''; if (mpc) mpc.value = ''; } catch(_) {}
                try { const up = document.getElementById('userPassword'); const upc = document.getElementById('userPasswordConfirm'); if (up) up.value = ''; if (upc) upc.value = ''; } catch(_) {}
                refreshAdminState();
                // Reflect GSTIN input disabled state by registration
                const gstinEl = document.getElementById('merchantGstin');
                if (gstinEl) {
                    if (!payload.merchantGstRegistered) {
                        gstinEl.value = '';
                        gstinEl.disabled = true;
                        gstinEl.title = 'Disabled when not GST registered';
                    } else {
                        gstinEl.disabled = false;
                        gstinEl.title = '';
                    }
                }
            } catch (error) {
               console.error("Error saving settings: ", error);
               showMessage("Failed to save settings.");
            }
        });
    }


            const merchantGstRegisteredToggle = document.getElementById('merchantGstRegistered');
            if (merchantGstRegisteredToggle) {
               merchantGstRegisteredToggle.addEventListener('change', async (e) => {
                    const isReg = e.target.checked;
                    try {
                        const payload = { merchantGstRegistered: isReg, isGstEnabled: !!isReg };
                        // When unregistered, clear GSTIN value
                        const gstinEl = document.getElementById('merchantGstin');
                        if (!isReg) {
                            payload.merchantGstin = '';
                            if (gstinEl) {
                                gstinEl.value = '';
                                gstinEl.disabled = true;
                                gstinEl.title = 'Disabled when not GST registered';
                            }
                        } else if (gstinEl) {
                            gstinEl.disabled = false;
                            gstinEl.title = '';
                        }
                        await setDoc(doc(db, siteSettingsDocPath), payload, { merge: true });
                        showMessage(`Merchant GST registration is now ${isReg ? 'ON' : 'OFF'}.`);
                        // Update local state quickly to reflect constraints
                        state.siteSettings = { ...state.siteSettings, ...payload };
                        // No separate GST sales toggle in UI anymore
                    } catch (error) {
                        console.error("Error updating merchant GST registration: ", error);
                        showMessage("Failed to update merchant GST registration.");
                    }
                });
            }

        // Inject a merchant state select into the settings form if not present
        try {
            const gstinEl = document.getElementById('merchantGstin');
            if (gstinEl) {
                // Only insert once
                if (!document.getElementById('merchantStateCode')) {
                    const wrapper = document.createElement('div');
                    const options = ['<option value="">-- Select State --</option>', ...GST_STATE_CODES.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`)].join('');
                    wrapper.innerHTML = `<label for="merchantStateCode" class="block text-sm font-medium text-gray-700 mb-1">Home State</label><select id="merchantStateCode" class="w-full px-4 py-2 border border-gray-300 rounded-md">${options}</select><p class="text-xs text-gray-500 mt-1">Select your business's home state for correct CGST/SGST vs IGST splitting.</p>`;
                    gstinEl.parentNode.insertBefore(wrapper, gstinEl.nextSibling);
                    // Set current selection from state if available
                    const sel = document.getElementById('merchantStateCode');
                    if (sel) {
                        sel.value = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '') || '';
                    }
                }
            }
        } catch (e) { /* non-fatal */ }

        // Inject master password inputs into Settings form (if not present).
        // Only add to the Settings tab/form to avoid appearing in other admin tabs (e.g., Orders).
        try {
                    if (!document.getElementById('masterPassword')) {
                const settingsFormEl = document.getElementById('settingsForm');
                if (settingsFormEl) {
                    const adminUidsEl = settingsFormEl.querySelector('#adminUids');
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = `
                        <div style="margin-top:8px;">
                            <label for="masterPassword" class="block text-sm font-medium text-gray-700 mb-1">Master Password (set/change)</label>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div class="relative">
                                    <input id="masterPassword" type="password" placeholder="New master password (leave blank to keep)" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                                    <button type="button" id="toggleMasterPasswordBtn" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600">Show</button>
                                </div>
                                <div class="relative">
                                    <input id="masterPasswordConfirm" type="password" placeholder="Confirm new password" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                                    <button type="button" id="toggleMasterPasswordConfirmBtn" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600">Show</button>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mt-1">If set, this password will be required for destructive admin actions (deletes, master reset). Leaving it blank keeps the current value.</p>
                            <div class="mt-3">
                                <div class="text-xs text-gray-600 mb-1">2FA for master password change will send an OTP to the admin mobile number:</div>
                                <div class="flex items-center gap-2 mb-2">
                                    <input id="adminPhoneDisplay" type="text" value="+919745009119" readonly class="px-3 py-2 border rounded bg-gray-50 text-sm" />
                                    <button id="sendMasterPasswordOtpBtn" type="button" class="px-3 py-2 bg-blue-600 text-white rounded text-sm">Send OTP</button>
                                    <span id="masterPasswordOtpStatus" class="text-xs text-gray-500 ml-2">Not verified</span>
                                </div>
                                <div id="recaptcha-container-masterpw" class="mt-2"></div>
                            <div id="recaptchaDiagnostic" class="text-xs text-gray-500 mt-2">reCAPTCHA: unknown · auth.settings: unknown</div>
                            </div>
                        </div>
                    `;
                    if (adminUidsEl && adminUidsEl.parentNode) adminUidsEl.parentNode.insertBefore(wrapper, adminUidsEl.nextSibling);
                    else settingsFormEl.appendChild(wrapper);
                }
            }
        } catch (e) { /* non-fatal */ }

            // Inject user password inputs into Settings form (if not present).
            try {
                if (!document.getElementById('userPassword')) {
                    const settingsFormEl = document.getElementById('settingsForm');
                    if (settingsFormEl) {
                        const adminUidsEl = settingsFormEl.querySelector('#adminUids');
                        const wrapper = document.createElement('div');
                        wrapper.innerHTML = `
                            <div style="margin-top:8px;">
                                <label for="userPassword" class="block text-sm font-medium text-gray-700 mb-1">User Password (for authorising edits/deletes)</label>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div class="relative">
                                        <input id="userPassword" type="password" placeholder="New user password (leave blank to keep)" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                                        <button type="button" id="toggleUserPasswordBtn" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600">Show</button>
                                    </div>
                                    <div class="relative">
                                        <input id="userPasswordConfirm" type="password" placeholder="Confirm new user password" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                                        <button type="button" id="toggleUserPasswordConfirmBtn" class="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-600">Show</button>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500 mt-1">This password is used to authorize edits/deletes of older entries. Admin (master) password will be requested to change it.</p>
                            </div>
                        `;
                        if (adminUidsEl && adminUidsEl.parentNode) adminUidsEl.parentNode.insertBefore(wrapper, adminUidsEl.nextSibling);
                        else settingsFormEl.appendChild(wrapper);
                    }
                }
            } catch (e) { /* non-fatal */ }

        

    // Wire Send OTP button (if present) for master password 2FA
    try {
        const sendBtn = document.getElementById('sendMasterPasswordOtpBtn');
        if (sendBtn) sendBtn.addEventListener('click', (ev) => { ev.preventDefault(); sendMasterPasswordOtp(); });
        // Reflect any existing verification state
        const statusEl = document.getElementById('masterPasswordOtpStatus');
        if (statusEl && state.masterPasswordPhoneVerified && (Date.now() - (state.masterPasswordPhoneVerifiedAt || 0) < (5 * 60 * 1000))) {
            statusEl.textContent = 'Verified ✓';
        }

        // Wire show/hide toggles for master password fields
        try {
            const toggleMain = document.getElementById('toggleMasterPasswordBtn');
            const toggleConfirm = document.getElementById('toggleMasterPasswordConfirmBtn');
            const mp = document.getElementById('masterPassword');
            const mpc = document.getElementById('masterPasswordConfirm');
            if (toggleMain && mp) toggleMain.addEventListener('click', () => { mp.type = mp.type === 'password' ? 'text' : 'password'; toggleMain.textContent = mp.type === 'password' ? 'Show' : 'Hide'; });
            if (toggleConfirm && mpc) toggleConfirm.addEventListener('click', () => { mpc.type = mpc.type === 'password' ? 'text' : 'password'; toggleConfirm.textContent = mpc.type === 'password' ? 'Show' : 'Hide'; });
            // Wire show/hide toggles for user password fields (if present)
            try {
                const toggleUser = document.getElementById('toggleUserPasswordBtn');
                const toggleUserConfirm = document.getElementById('toggleUserPasswordConfirmBtn');
                const up = document.getElementById('userPassword');
                const upc = document.getElementById('userPasswordConfirm');
                if (toggleUser && up) toggleUser.addEventListener('click', () => { up.type = up.type === 'password' ? 'text' : 'password'; toggleUser.textContent = up.type === 'password' ? 'Show' : 'Hide'; });
                if (toggleUserConfirm && upc) toggleUserConfirm.addEventListener('click', () => { upc.type = upc.type === 'password' ? 'text' : 'password'; toggleUserConfirm.textContent = upc.type === 'password' ? 'Show' : 'Hide'; });
            } catch(_){}
        } catch(_){}
    } catch (_) {}

    const scrollingBarToggle = document.getElementById('scrollingBarVisible');
    if (scrollingBarToggle) {
       scrollingBarToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            const text = document.getElementById('scrollingBarText').value;
            try {
                await setDoc(doc(db, siteSettingsDocPath), { 
                    isScrollingBarVisible: isChecked,
                    scrollingBarText: text
                }, { merge: true });
                showMessage(`Scrolling bar settings updated.`);
            } catch (error) {
               console.error("Error updating scrolling bar settings: ", error);
               showMessage("Failed to update settings.");
            }
        });
    }

    const addGalleryImageBtn = document.getElementById('addGalleryImageBtn');
    if(addGalleryImageBtn) {
       addGalleryImageBtn.addEventListener('click', async () => {
            const imageUrlInput = document.getElementById('galleryImageUrl');
            const imageUrl = imageUrlInput.value;
            if (!imageUrl) return;
            try {
                await addDoc(collection(db, galleryImagesColPath), {
                    imageUrl: imageUrl,
                    createdAt: serverTimestamp()
                });
                imageUrlInput.value = '';
                showMessage("Gallery image added!");
            } catch (error) {
               console.error("Error adding gallery image: ", error);
                showMessage("Could not add image.");
            }
        });
    }
    
    // Attach listeners for App Reset controls (admin only)
    const resetSelectedBtn = document.getElementById('resetSelectedBtn');
    const masterResetBtn = document.getElementById('masterResetBtn');
    function collectResetFlags() {
        return {
            products: !!document.getElementById('reset_products')?.checked,
            productGroups: !!document.getElementById('reset_productGroups')?.checked,
            slides: !!document.getElementById('reset_slides')?.checked,
            gallery: !!document.getElementById('reset_gallery')?.checked,
            testimonials: !!document.getElementById('reset_testimonials')?.checked,
            purchases: !!document.getElementById('reset_purchases')?.checked,
            suppliers: !!document.getElementById('reset_suppliers')?.checked,
            customers: !!document.getElementById('reset_customers')?.checked,
            banks: !!document.getElementById('reset_banks')?.checked,
            creditors: !!document.getElementById('reset_creditors')?.checked,
            debtors: !!document.getElementById('reset_debtors')?.checked,
            cash: !!document.getElementById('reset_cash')?.checked,
            bank: !!document.getElementById('reset_bank')?.checked,
            localSales: !!document.getElementById('reset_localSales')?.checked,
            orders: !!document.getElementById('reset_orders')?.checked,
            carts: !!document.getElementById('reset_carts')?.checked,
            siteSettings: !!document.getElementById('reset_siteSettings')?.checked,
            counters: !!document.getElementById('reset_counters')?.checked,
        };
    }

    if (resetSelectedBtn) {
        resetSelectedBtn.addEventListener('click', async () => {
            try {
                const flags = collectResetFlags();
                if (!Object.values(flags).some(Boolean)) {
                    showMessage('Select at least one data bucket to reset.');
                    return;
                }
                if (!confirm('Are you sure? This will permanently modify or delete the selected data.')) return;
                const ok = await verifyMasterPassword('perform the selected reset');
                if (!ok) return;
                resetSelectedBtn.disabled = true;
                showMessage('Resetting selected data — please wait...');
                const result = await resetSelectedData(flags);
                resetSelectedBtn.disabled = false;
                if (result) {
                    // Build a compact summary toast from per-bucket results when available
                    const lines = (result.results||[]).map(r => `${r.label}: ${r.status}${r.error ? ' ('+r.error+')' : ''}`);
                    if (result.ok) {
                        showToast('Selected reset — summary', lines.length ? lines : ['Completed successfully']);
                    } else {
                        showToast('Selected reset — partial/failed', lines.length ? lines : ['Completed with errors — check console']);
                        console.warn('Selected reset completed with errors:', result.errors || result);
                    }
                } else {
                    showMessage('Selected reset completed.');
                }
            } catch (e) {
                console.error('resetSelectedBtn handler error', e);
                showMessage('Selected reset failed. See console for details.');
                resetSelectedBtn.disabled = false;
            }
        });
    }

    if (masterResetBtn) {
        masterResetBtn.addEventListener('click', async () => {
            try {
                if (!confirm('MASTER RESET will attempt to clear all primary app data (products, orders, purchases, etc.). This is irreversible. Continue?')) return;
                const ok = await verifyMasterPassword('perform a master reset');
                if (!ok) return;
                masterResetBtn.disabled = true;
                showMessage('Performing master reset — this may take several minutes...');
                const result = await resetAllData();
                masterResetBtn.disabled = false;
                if (result) {
                    const lines = (result.results||[]).map(r => `${r.label}: ${r.status}${r.error ? ' ('+r.error+')' : ''}`);
                    if (result.ok) {
                        showToast('Master reset — summary', lines.length ? lines : ['Completed successfully'], { ttl: 8000 });
                        // Also show a modal confirmation so the admin sees the completion explicitly
                        try {
                            const msg = lines && lines.length ? ('Master reset completed successfully.\n' + lines.join('\n')) : 'Master reset completed successfully.';
                            showMessage(msg);
                        } catch (_) { /* ignore */ }
                    } else {
                        showToast('Master reset — partial/failed', lines.length ? lines : ['Completed with errors — check console'], { ttl: 10000 });
                        console.warn('Master reset completed with errors:', result.errors || result);
                    }
                } else {
                    showMessage('Master reset completed.');
                }
            } catch (e) {
                console.error('masterResetBtn handler error', e);
                showMessage('Master reset failed. See console for details.');
                masterResetBtn.disabled = false;
            }
        });
    }

    // Master reset UI and runtime cleanup removed. The admin template no
    // longer contains dangerous controls and there is no runtime cleanup.
    
    

    // Bank master add/delete handlers (Billing Settings)
    const bankMasterForm = document.getElementById('bankMasterForm');
    if (bankMasterForm) {
        bankMasterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('bankName')?.value || '').trim();
            const accountNumber = (document.getElementById('bankAccountNumber')?.value || '').trim();
            const ifsc = (document.getElementById('bankIfsc')?.value || '').trim();
            const address = (document.getElementById('bankAddress')?.value || '').trim();
            const notes = (document.getElementById('bankNotes')?.value || '').trim();
            if (!name) { showMessage('Please enter a bank name.'); return; }
            const submitBtn = document.getElementById('bankMasterSubmitBtn') || bankMasterForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.textContent : '';
            try {
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
                // If editing an existing bank, update it instead of creating
                if (state.bankEditingId) {
                    const id = state.bankEditingId;
                    await updateDoc(doc(db, banksColPath, id), { name, accountNumber, ifsc, address, notes });
                    // update local state immediately
                    state.allBanks = (state.allBanks || []).map(b => b.id === id ? ({ ...b, name, accountNumber, ifsc, address, notes }) : b);
                    showMessage('Bank account updated.');
                    state.bankEditingId = null;
                    // reset submit button label and cancel visibility
                    try { document.getElementById('bankMasterCancelBtn').style.display = 'none'; } catch(_){}
                    try { submitBtn.textContent = 'Add Bank Account'; } catch(_){}
                    bankMasterForm.reset();
                    // Re-render the admin page so the Billing Settings tab (and bank table) refreshes immediately
                    renderAdminPage();
                } else {
                    const ref = await addDoc(collection(db, banksColPath), { name, accountNumber, ifsc, address, notes, isDeleted: false, createdAt: serverTimestamp() });
                    // optimistic UI update: add immediately to state and re-render
                    const newBank = { id: ref.id, name, accountNumber, ifsc, address, notes, isDeleted: false };
                    // Merge into state.allBanks but avoid duplicates if a snapshot update also arrives
                    try {
                        const existing = Array.isArray(state.allBanks) ? state.allBanks : [];
                        const merged = existing.filter(b => b.id !== newBank.id).concat([newBank]);
                        state.allBanks = merged.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
                    } catch (_) {
                        state.allBanks = (state.allBanks || []).concat([newBank]).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
                    }
                    showMessage('Bank account added.');
                    bankMasterForm.reset();
                    // Re-render the admin page so the Billing Settings tab (and bank table) refreshes immediately
                    renderAdminPage();
                }
            } catch (err) {
                console.error('Failed to add bank account', err);
                showMessage('Failed to add bank account.');
            } finally {
                if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Add Bank Account'; }
            }
        });
        // Wire the popular banks dropdown to autofill the bank name
        try {
            const existingBanksDropdown = document.getElementById('existingBanksDropdown');
            if (existingBanksDropdown) {
                existingBanksDropdown.addEventListener('change', (ev) => {
                    const val = (ev.target.value || '').trim();
                    try {
                        const nameEl = document.getElementById('bankName');
                        const ifscEl = document.getElementById('bankIfsc');
                        if (val && val !== 'Other') {
                            if (nameEl) nameEl.value = val;
                            // Clear IFSC to let user fill the exact code for their branch
                            if (ifscEl) ifscEl.value = '';
                            // Focus account number for quicker entry
                            const accEl = document.getElementById('bankAccountNumber');
                            if (accEl) accEl.focus();
                        } else if (val === 'Other' || !val) {
                            if (nameEl) nameEl.value = '';
                            if (ifscEl) ifscEl.value = '';
                            const nameFocus = document.getElementById('bankName');
                            if (nameFocus) nameFocus.focus();
                        }
                    } catch (_) {}
                });
            }
        } catch (_) {}
    }

    

    // Ledger modal helpers: open a modal for quick manual ledger entries instead of using prompt().
    function openLedgerEntryModal(target, mode) {
        try {
            let modal = document.getElementById('ledgerEntryModal');
            // If modal does not exist (removed from re-render areas), create it and append to body
            if (!modal) {
                const tpl = `
                <div id="ledgerEntryModal" role="dialog" aria-modal="true" aria-hidden="true" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden">
                    <div class="bg-white p-6 rounded-md w-full max-w-md" role="document">
                        <h3 id="ledgerEntryModalTitle" class="text-lg font-semibold mb-2">Add Ledger Entry</h3>
                        <form id="ledgerEntryForm" class="space-y-3" aria-labelledby="ledgerEntryModalTitle">
                            <input type="hidden" id="ledgerEntryTarget" />
                            <div class="grid grid-cols-1 gap-2">
                                <label class="text-sm">Type</label>
                                <select id="ledgerEntryType" class="border rounded p-2">
                                    <option value="debit">Debit</option>
                                    <option value="credit">Credit</option>
                                </select>
                                <label class="text-sm">Amount (₹)</label>
                                <input id="ledgerEntryAmount" type="number" step="0.01" min="0" class="border rounded p-2" aria-label="Amount" />
                                <label class="text-sm">Date</label>
                                <input id="ledgerEntryDate" type="date" class="border rounded p-2" value="${new Date().toISOString().split('T')[0]}" />
                                <label class="text-sm mt-1">Posting time</label>
                                <div id="ledgerEntryTimeDisplay" class="text-sm text-gray-700 mt-1">Posting time: ${getLocalTimeHHMMSS()}</div>
                                <div id="ledgerEntryBankRow" class="hidden">
                                    <label class="text-sm">Bank Account</label>
                                    <select id="ledgerEntryBankAccount" class="border rounded p-2">
                                        <option value="">Main Bank</option>
                                    </select>
                                </div>
                                <label class="text-sm">Notes</label>
                                <input id="ledgerEntryNotes" type="text" class="border rounded p-2" placeholder="Optional notes" />
                            </div>
                            <div class="flex justify-end gap-2">
                                <button type="button" id="ledgerEntryCancelBtn" class="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                                <button type="submit" id="ledgerEntrySubmitBtn" class="px-4 py-2 bg-blue-600 text-white rounded">Save</button>
                            </div>
                        </form>
                    </div>
                </div>`;
                const wrapper = document.createElement('div');
                wrapper.innerHTML = tpl.trim();
                document.body.appendChild(wrapper.firstElementChild);
                modal = document.getElementById('ledgerEntryModal');

                // Wire cancel button
                document.getElementById('ledgerEntryCancelBtn')?.addEventListener('click', () => { closeLedgerEntryModal(); });

                // Wire form submit handler (same logic as previous inline handler)
                document.getElementById('ledgerEntryForm')?.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const submitBtn = document.getElementById('ledgerEntrySubmitBtn');
                    const addBtns = [document.getElementById('addCashDebitBtn'), document.getElementById('addCashCreditBtn'), document.getElementById('addBankDebitBtn'), document.getElementById('addBankCreditBtn')];
                    const originalText = submitBtn ? submitBtn.textContent : '';
                    try {
                        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving...'; }
                        addBtns.forEach(b => { try { if (b) b.disabled = true; } catch(_){} });

                        const target = (document.getElementById('ledgerEntryTarget')?.value || 'cash');
                        const type = (document.getElementById('ledgerEntryType')?.value || 'debit');
                        const raw = (document.getElementById('ledgerEntryAmount')?.value || '').toString();
                        const amount = parseFloat(raw.replace(/,/g, '')) || 0;
                        if (amount <= 0) { showMessage('Please enter a positive amount.'); return; }
                        const notes = (document.getElementById('ledgerEntryNotes')?.value || '').trim();
                        // Combine selected date with current local system time (including seconds)
                        const date = parseDateWithNow('ledgerEntryDate');
                        if (target === 'cash') {
                            await addDoc(collection(db, cashLedgerColPath), { date, refType: 'Manual', refId: '', notes, debit: type === 'debit' ? amount : 0, credit: type === 'credit' ? amount : 0, isDeleted: false, createdAt: serverTimestamp() });
                        } else {
                            const bankAccount = (document.getElementById('ledgerEntryBankAccount')?.value || (state.bankAccountFilter || 'Main Bank'));
                            await addDoc(collection(db, bankLedgerColPath), { date, refType: 'Manual', refId: '', bankAccount, notes, debit: type === 'debit' ? amount : 0, credit: type === 'credit' ? amount : 0, isDeleted: false, createdAt: serverTimestamp() });
                        }
                        showToast('Ledger entry saved', [`${type === 'debit' ? 'Debit' : 'Credit'} ₹${amount.toFixed(2)} recorded`], { ttl: 4000 });
                        closeLedgerEntryModal();
                        renderAdminLedgersPage();
                    } catch (err) {
                        console.error('Ledger entry save failed', err);
                        showMessage('Failed to add ledger entry.');
                    } finally {
                        try { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalText || 'Save'; } } catch(_){ }
                        try { addBtns.forEach(b => { if (b) b.disabled = false; }); } catch(_){ }
                    }
                });
            }

            // populate and show
            document.getElementById('ledgerEntryTarget').value = target;
            document.getElementById('ledgerEntryType').value = mode === 'debit' ? 'debit' : 'credit';
            document.getElementById('ledgerEntryAmount').value = '';
            document.getElementById('ledgerEntryNotes').value = (mode === 'debit') ? (target === 'cash' ? 'Manual cash receipt' : 'Manual bank receipt') : (target === 'cash' ? 'Manual cash payment' : 'Manual bank payment');
            document.getElementById('ledgerEntryDate').value = new Date().toISOString().split('T')[0];
            try {
                const tDisp = document.getElementById('ledgerEntryTimeDisplay');
                if (tDisp) {
                    tDisp.textContent = `Posting time: ${getLocalTimeHHMMSS()}`;
                }
            } catch(_) {}
            const bankRow = document.getElementById('ledgerEntryBankRow');
            if (bankRow) bankRow.classList.toggle('hidden', target !== 'bank');
            // Populate bank accounts into the select from state.allBanks
            try {
                const bankSel = document.getElementById('ledgerEntryBankAccount');
                if (bankSel) {
                    bankSel.innerHTML = '<option value="">Main Bank</option>' + ((state.allBanks||[]).map(b=>`<option value="${(b.name||'').replace(/"/g,'&quot;')}">${(b.name||'').replace(/</g,'&lt;')}</option>`).join(''));
                    if (state.bankAccountFilter && state.bankAccountFilter !== 'All' && target === 'bank') bankSel.value = state.bankAccountFilter;
                }
            } catch (_) {}

            // Accessibility & focus management
            try {
                modal.setAttribute('aria-hidden', 'false');
                modal._previousActive = document.activeElement;
                document.getElementById('ledgerEntryAmount')?.focus();
                const trap = (e) => {
                    if (e.key === 'Tab') {
                        const focusable = modal.querySelectorAll('a[href], button, textarea, input, select');
                        if (!focusable.length) return;
                        const first = focusable[0];
                        const last = focusable[focusable.length - 1];
                        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                    } else if (e.key === 'Escape') { closeLedgerEntryModal(); }
                };
                modal._trapHandler = trap;
                document.addEventListener('keydown', trap);
            } catch (_) {}
            modal.classList.remove('hidden');
        } catch (err) { console.error('openLedgerEntryModal error', err); }
    }

// Expose for test/debug fallbacks and other callers
try { window.openLedgerEntryModal = openLedgerEntryModal; } catch (_) {}

// Global fallback: if delegated handlers didn't attach for any reason, ensure quick-add buttons still open the modal.
try {
    document.body.addEventListener('click', (ev) => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('button') : ev.target;
        if (!btn || !btn.id) return;
        const id = btn.id;
        if (id === 'addCashDebitBtn') { ev.preventDefault(); try { openLedgerEntryModal('cash','debit'); } catch(_){} }
        if (id === 'addCashCreditBtn') { ev.preventDefault(); try { openLedgerEntryModal('cash','credit'); } catch(_){} }
        if (id === 'addBankDebitBtn') { ev.preventDefault(); try { openLedgerEntryModal('bank','debit'); } catch(_){} }
        if (id === 'addBankCreditBtn') { ev.preventDefault(); try { openLedgerEntryModal('bank','credit'); } catch(_){} }
    });
} catch (_) {}

// Global delegated handler for bank edit/delete (works even if admin-specific listeners failed to attach)
try {
    document.body.addEventListener('click', async (ev) => {
        try {
            const editBtn = ev.target && ev.target.closest ? ev.target.closest('.edit-bank-btn') : null;
            if (editBtn) {
                ev.preventDefault();
                if (!(state.currentUser && !state.currentUser.isAnonymous && state.isAdmin)) { showMessage('Not authorized to edit bank accounts.'); return; }
                const id = editBtn.dataset && editBtn.dataset.id;
                if (!id) return;
                const bank = (state.allBanks || []).find(b => b.id === id);
                if (!bank) return;
                document.getElementById('bankName').value = bank.name || '';
                document.getElementById('bankAccountNumber').value = bank.accountNumber || '';
                document.getElementById('bankIfsc').value = bank.ifsc || '';
                try { document.getElementById('bankAddress').value = bank.address || ''; } catch(_){}
                try { document.getElementById('bankNotes').value = bank.notes || ''; } catch(_){}
                state.bankEditingId = id;
                const submitBtn = document.getElementById('bankMasterSubmitBtn'); if (submitBtn) submitBtn.textContent = 'Save Changes';
                try { document.getElementById('bankMasterCancelBtn').style.display = 'inline-block'; } catch(_){}
                try { document.getElementById('bankAccountNumber').focus(); } catch(_){}
                return;
            }

            const delBtn = ev.target && ev.target.closest ? ev.target.closest('.delete-bank-btn') : null;
            if (delBtn) {
                ev.preventDefault();
                if (!(state.currentUser && !state.currentUser.isAnonymous && state.isAdmin)) { showMessage('Not authorized to delete bank accounts.'); return; }
                const id = delBtn.dataset && delBtn.dataset.id;
                if (!id) return;
                if (!confirm('Delete this bank account? This cannot be undone.')) return;
                try {
                    // Require master password before allowing a destructive delete
                    const allowed = await verifyMasterPassword('delete this bank account');
                    if (!allowed) return;
                    delBtn.disabled = true;
                    await deleteDoc(doc(db, banksColPath, id));
                    state.allBanks = (state.allBanks || []).filter(b => b.id !== id);
                    // Re-render admin area so the Billing Settings table reflects deletion immediately
                    renderAdminPage();
                    showMessage('Bank account deleted.');
                } catch (err) {
                    console.error('Failed to delete bank account', err);
                    showMessage('Failed to delete bank account.');
                } finally { try { delBtn.disabled = false; } catch(_){} }
                return;
            }
        } catch (_) {}
    });
} catch (_) {}

    function closeLedgerEntryModal() {
        try {
            const modal = document.getElementById('ledgerEntryModal');
            if (!modal) return;
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            // remove trap handler
            try { if (modal._trapHandler) document.removeEventListener('keydown', modal._trapHandler); } catch(_) {}
            // restore focus if possible
            try { if (modal._previousActive && typeof modal._previousActive.focus === 'function') modal._previousActive.focus(); } catch(_) {}
        } catch(_) {}
    }

    // NOTE: modal wiring (cancel + submit) happens when the modal is created inside openLedgerEntryModal.

    // NOTE: The event listeners for .admin-order-status-selector are now handled inside renderAdminOrderList to ensure they are re-attached after filtering/rendering.

    // Pagination event delegation & persistence (attach once)
    if (!state.adminPaginationEventsAttached) {
        // Click handlers for Prev/Next/First/Last buttons
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest && e.target.closest('button');
            if (!btn || !btn.id) return;
            const id = btn.id;
            switch (id) {
                case 'cashPrevBtn': e.preventDefault(); state.cashPage = Math.max(1, (state.cashPage || 1) - 1); renderAdminLedgersPage(); break;
                case 'cashNextBtn': e.preventDefault(); state.cashPage = (state.cashPage || 1) + 1; renderAdminLedgersPage(); break;
                case 'cashFirstBtn': e.preventDefault(); state.cashPage = 1; renderAdminLedgersPage(); break;
                case 'cashLastBtn': e.preventDefault(); state.cashPage = Number.MAX_SAFE_INTEGER; renderAdminLedgersPage(); break; // render will clamp

                case 'bankPrevBtn': e.preventDefault(); state.bankPage = Math.max(1, (state.bankPage || 1) - 1); renderAdminLedgersPage(); break;
                case 'bankNextBtn': e.preventDefault(); state.bankPage = (state.bankPage || 1) + 1; renderAdminLedgersPage(); break;
                case 'bankFirstBtn': e.preventDefault(); state.bankPage = 1; renderAdminLedgersPage(); break;
                case 'bankLastBtn': e.preventDefault(); state.bankPage = Number.MAX_SAFE_INTEGER; renderAdminLedgersPage(); break;

                case 'creditorsPrevBtn': e.preventDefault(); state.creditorsPage = Math.max(1, (state.creditorsPage || 1) - 1); renderAdminLedgersPage(); break;
                case 'creditorsNextBtn': e.preventDefault(); state.creditorsPage = (state.creditorsPage || 1) + 1; renderAdminLedgersPage(); break;
                case 'creditorsFirstBtn': e.preventDefault(); state.creditorsPage = 1; renderAdminLedgersPage(); break;
                case 'creditorsLastBtn': e.preventDefault(); state.creditorsPage = Number.MAX_SAFE_INTEGER; renderAdminLedgersPage(); break;

                case 'debtorsPrevBtn': e.preventDefault(); state.debtorsPage = Math.max(1, (state.debtorsPage || 1) - 1); renderAdminLedgersPage(); break;
                case 'debtorsNextBtn': e.preventDefault(); state.debtorsPage = (state.debtorsPage || 1) + 1; renderAdminLedgersPage(); break;
                case 'debtorsFirstBtn': e.preventDefault(); state.debtorsPage = 1; renderAdminLedgersPage(); break;
                case 'debtorsLastBtn': e.preventDefault(); state.debtorsPage = Number.MAX_SAFE_INTEGER; renderAdminLedgersPage(); break;
                default: break;
            }
        });

        // Change handlers for page inputs and page-size selectors
        document.body.addEventListener('change', (e) => {
            const el = e.target;
            if (!el || !el.id) return;
            const id = el.id;
            // Page input fields
            if (id === 'cashPageInput') { let v = parseInt(el.value || '1') || 1; state.cashPage = Math.max(1, v); renderAdminLedgersPage(); return; }
            if (id === 'bankPageInput') { let v = parseInt(el.value || '1') || 1; state.bankPage = Math.max(1, v); renderAdminLedgersPage(); return; }
            if (id === 'creditorsPageInput') { let v = parseInt(el.value || '1') || 1; state.creditorsPage = Math.max(1, v); renderAdminLedgersPage(); return; }
            if (id === 'debtorsPageInput') { let v = parseInt(el.value || '1') || 1; state.debtorsPage = Math.max(1, v); renderAdminLedgersPage(); return; }

            // Page size selects (persist preference)
            const persist = (k, v) => { try { localStorage.setItem(`tiaras.ledger.${k}PageSize_${appId}`, String(v)); } catch (e) {} };
            if (id === 'cashPageSizeSel') { const v = parseInt(el.value) || 10; state.cashPageSize = v; state.cashPage = 1; persist('cash', v); renderAdminLedgersPage(); return; }
            if (id === 'bankPageSizeSel') { const v = parseInt(el.value) || 10; state.bankPageSize = v; state.bankPage = 1; persist('bank', v); renderAdminLedgersPage(); return; }
            // Sorting selects for ledgers
            if (id === 'cashSortSel') { try { const [k,d] = (el.value||'date:desc').split(':'); state.cashSort = { key: k||'date', dir: d||'desc' }; state.cashPage = 1; renderAdminLedgersPage(); } catch(_){}; return; }
            if (id === 'bankSortSel') { try { const [k,d] = (el.value||'date:desc').split(':'); state.bankSort = { key: k||'date', dir: d||'desc' }; state.bankPage = 1; renderAdminLedgersPage(); } catch(_){}; return; }
            if (id === 'creditorsPageSizeSel') { const v = parseInt(el.value) || 10; state.creditorsPageSize = v; state.creditorsPage = 1; persist('creditors', v); renderAdminLedgersPage(); return; }
            if (id === 'debtorsPageSizeSel') { const v = parseInt(el.value) || 10; state.debtorsPageSize = v; state.debtorsPage = 1; persist('debtors', v); renderAdminLedgersPage(); return; }
        });

        state.adminPaginationEventsAttached = true;
    }

    // Time entry toggle handler removed - time pickers are always enabled

}
        
// --- REPORTING HELPERS ---
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error('Table not found for export');
        return;
    }

    let csv = [];
    const rows = table.querySelectorAll('tr');

    for (const row of rows) {
        const rowData = [];
        const cols = row.querySelectorAll('td, th');
        for (const col of cols) {
            let data = col.innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s)/gm, ' ');
            data = data.replace(/"/g, '""');
            rowData.push(`"${data}"`);
        }
        csv.push(rowData.join(','));
    }

    const csvContent = "data:text/csv;charset=utf-8," + csv.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
   link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- MASTER RESET HELPERS ---
// Developer master password verification
function _abToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    const hex = [];
    for (let i = 0; i < bytes.length; i++) {
        const h = bytes[i].toString(16).padStart(2, '0');
        hex.push(h);
    }
    return hex.join('');
}

async function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error('Secure hashing not supported in this environment');
    }
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return _abToHex(digest);
}

async function verifyMasterPassword(actionLabel = 'proceed') {
    try {
        let hash = state?.siteSettings?.masterResetPasswordHash;
        // If siteSettings not yet loaded in state, try a one-off read from Firestore emulator/DB
        if (!hash || typeof hash !== 'string') {
            try {
                const snap = await getDoc(doc(db, siteSettingsDocPath));
                if (snap && snap.exists()) {
                    const d = snap.data();
                    if (d && typeof d.masterResetPasswordHash === 'string') {
                        // merge into local state for future calls
                        state.siteSettings = { ...state.siteSettings, ...d };
                        hash = d.masterResetPasswordHash;
                    }
                }
            } catch (e) {
                console.warn('verifyMasterPassword: fallback getDoc failed', e);
            }
        }
        if (!hash || typeof hash !== 'string') {
            showMessage('Master password not configured. Contact developer.');
            return false;
        }
        // Use inline modal prompt for better UX
        const pwd = await showMasterPasswordModal(actionLabel);
        if (!pwd) return false;
        const pwdHash = await sha256Hex(pwd);
        if (pwdHash !== hash) {
            showMessage('Incorrect master password.');
            return false;
        }
        return true;
    } catch (err) {
        console.error('verifyMasterPassword error:', err);
        showMessage('Unable to verify master password.');
        return false;
    }
}

// Show an inline modal to collect the master password from the user.
// Returns the entered password string, or null if cancelled.
function showMasterPasswordModal(actionLabel = 'proceed') {
    return new Promise((resolve) => {
        try {
            let modal = document.getElementById('masterPasswordModal');
            if (!modal) {
                const tpl = `
                <div id="masterPasswordModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                    <div class="bg-white p-6 rounded-md w-full max-w-md">
                        <h3 id="masterPasswordModalTitle" class="text-lg font-semibold mb-2">Confirm action</h3>
                        <p id="masterPasswordModalMsg" class="text-sm text-gray-700 mb-4">Enter master password to ${actionLabel}.</p>
                        <div class="space-y-3">
                            <input id="masterPasswordModalInput" type="password" class="w-full px-3 py-2 border rounded" placeholder="Master password" />
                            <div class="flex justify-end gap-2">
                                <button id="masterPasswordModalCancel" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                                <button id="masterPasswordModalOk" class="px-3 py-2 bg-red-600 text-white rounded">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                const wrap = document.createElement('div');
                wrap.innerHTML = tpl.trim();
                document.body.appendChild(wrap.firstElementChild);
                modal = document.getElementById('masterPasswordModal');
            }
            // Update message
            try { document.getElementById('masterPasswordModalMsg').textContent = `Enter master password to ${actionLabel}.`; } catch(_){}
            const input = document.getElementById('masterPasswordModalInput');
            const ok = document.getElementById('masterPasswordModalOk');
            const cancel = document.getElementById('masterPasswordModalCancel');
            // Add show/hide toggle for modal password input
            try {
                const existingToggle = document.getElementById('toggleMasterPasswordModalBtn');
                if (!existingToggle) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.id = 'toggleMasterPasswordModalBtn';
                    btn.className = 'ml-2 text-sm text-gray-600';
                    btn.textContent = 'Show';
                    if (input && input.parentNode) {
                        const wrap = document.createElement('div'); wrap.className = 'flex items-center';
                        input.parentNode.insertBefore(wrap, input);
                        wrap.appendChild(input);
                        wrap.appendChild(btn);
                    }
                    btn.addEventListener('click', () => {
                        try {
                            input.type = input.type === 'password' ? 'text' : 'password';
                            btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
                        } catch(_){}
                    });
                }
            } catch(_){}
            const cleanup = () => {
                try { ok.removeEventListener('click', onOk); } catch(_){}
                try { cancel.removeEventListener('click', onCancel); } catch(_){}
                try { document.removeEventListener('keydown', onKey); } catch(_){}
                try { modal.classList.add('hidden'); } catch(_){}
            };
            const onOk = () => {
                const v = (input && input.value) ? input.value : null;
                cleanup();
                if (input) input.value = '';
                resolve(v);
            };
            const onCancel = () => { cleanup(); if (input) input.value = ''; resolve(null); };
            const onKey = (e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onOk(); };
            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKey);
            modal.classList.remove('hidden');
            try { input.focus(); } catch(_){}
        } catch (err) {
            console.error('showMasterPasswordModal error', err);
            resolve(null);
        }
    });
}
// --- User password verification helpers ---
async function verifyUserPassword(actionLabel = 'proceed') {
    try {
        let hash = state?.siteSettings?.userPasswordHash;
        if (!hash || typeof hash !== 'string') {
            try {
                const snap = await getDoc(doc(db, siteSettingsDocPath));
                if (snap && snap.exists()) {
                    const d = snap.data();
                    if (d && typeof d.userPasswordHash === 'string') {
                        state.siteSettings = { ...state.siteSettings, ...d };
                        hash = d.userPasswordHash;
                    }
                }
            } catch (e) {
                console.warn('verifyUserPassword: fallback getDoc failed', e);
            }
        }
        if (!hash || typeof hash !== 'string') {
            showMessage('User password not configured. Contact admin.');
            return false;
        }
        const pwd = await showUserPasswordModal(actionLabel);
        if (!pwd) return false;
        const pwdHash = await sha256Hex(pwd);
        if (pwdHash !== hash) {
            showMessage('Incorrect user password.');
            return false;
        }
        return true;
    } catch (err) {
        console.error('verifyUserPassword error:', err);
        showMessage('Unable to verify user password.');
        return false;
    }
}

function showUserPasswordModal(actionLabel = 'proceed') {
    return new Promise((resolve) => {
        try {
            let modal = document.getElementById('userPasswordModal');
            if (!modal) {
                const tpl = `
                <div id="userPasswordModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                    <div class="bg-white p-6 rounded-md w-full max-w-md">
                        <h3 id="userPasswordModalTitle" class="text-lg font-semibold mb-2">Confirm action</h3>
                        <p id="userPasswordModalMsg" class="text-sm text-gray-700 mb-4">Enter user password to ${actionLabel}.</p>
                        <div class="space-y-3">
                            <input id="userPasswordModalInput" type="password" class="w-full px-3 py-2 border rounded" placeholder="User password" />
                            <div class="flex justify-end gap-2">
                                <button id="userPasswordModalCancel" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                                <button id="userPasswordModalOk" class="px-3 py-2 bg-blue-600 text-white rounded">Confirm</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                const wrap = document.createElement('div');
                wrap.innerHTML = tpl.trim();
                document.body.appendChild(wrap.firstElementChild);
                modal = document.getElementById('userPasswordModal');
            }
            try { document.getElementById('userPasswordModalMsg').textContent = `Enter user password to ${actionLabel}.`; } catch(_){}
            const input = document.getElementById('userPasswordModalInput');
            const ok = document.getElementById('userPasswordModalOk');
            const cancel = document.getElementById('userPasswordModalCancel');
            const cleanup = () => {
                try { ok.removeEventListener('click', onOk); } catch(_){ }
                try { cancel.removeEventListener('click', onCancel); } catch(_){ }
                try { document.removeEventListener('keydown', onKey); } catch(_){ }
                try { modal.classList.add('hidden'); } catch(_){ }
            };
            const onOk = () => { const v = (input && input.value) ? input.value : null; cleanup(); if (input) input.value = ''; resolve(v); };
            const onCancel = () => { cleanup(); if (input) input.value = ''; resolve(null); };
            const onKey = (e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onOk(); };
            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKey);
            modal.classList.remove('hidden');
            try { input.focus(); } catch(_){}
        } catch (err) { console.error('showUserPasswordModal error', err); resolve(null); }
    });
}

// --- OTP (Phone) helpers for master-password change 2FA ---
async function initRecaptchaForMasterPhone() {
    try {
        if (window._tiarasMasterPwRecaptcha) return window._tiarasMasterPwRecaptcha;
        let containerEl = document.getElementById('recaptcha-container-masterpw');
        if (!containerEl) {
            // If settings form is available, append there; otherwise append to body
            const settingsForm = document.getElementById('settingsForm');
            containerEl = document.createElement('div');
            containerEl.id = 'recaptcha-container-masterpw';
            containerEl.className = 'mt-2';
            if (settingsForm) settingsForm.appendChild(containerEl);
            else document.body.appendChild(containerEl);
        }

        // Ensure grecaptcha script is loaded. Firebase's RecaptchaVerifier requires the
        // global `grecaptcha` to be present. If it's not, inject the script and wait.
        const ensureGrecaptcha = async () => {
            if (window.grecaptcha) return true;
            // If a recaptcha script is already present but grecaptcha not yet ready, wait.
            const existing = Array.from(document.getElementsByTagName('script')).find(s => s.src && s.src.includes('recaptcha'));
            if (!existing) {
                const s = document.createElement('script');
                s.src = 'https://www.google.com/recaptcha/api.js?render=explicit';
                s.async = true; s.defer = true;
                document.head.appendChild(s);
            }
            // Wait for grecaptcha to appear (poll up to ~6s)
            const deadline = Date.now() + 6000;
            while (!window.grecaptcha && Date.now() < deadline) {
                await new Promise(r => setTimeout(r, 200));
            }
            return !!window.grecaptcha;
        };

        const grecaptchaReady = await ensureGrecaptcha();
        if (!grecaptchaReady) {
            console.warn('grecaptcha did not load within timeout; RecaptchaVerifier may fail.');
        }
        console.info('initRecaptchaForMasterPhone: grecaptchaReady=', !!window.grecaptcha, 'auth.settings present=', !!(auth && auth.settings));
        try {
            const diag = document.getElementById('recaptchaDiagnostic');
            if (diag) diag.textContent = `reCAPTCHA: ${!!window.grecaptcha} · auth.settings: ${!!(auth && auth.settings)}`;
        } catch(_){}

        // Custom grecaptcha-based ApplicationVerifier wrapper.
        // This avoids using the SDK's `RecaptchaVerifier` which in some environments
        // attempts to read deep auth internals and throws. The object returned here
        // implements the minimal ApplicationVerifier interface expected by
        // `signInWithPhoneNumber` / `linkWithPhoneNumber`.
        const createGreCaptchaAppVerifier = (container, opts = {}) => {
            if (!window.grecaptcha) return null;
            const siteKey = opts.siteKey || window.__recaptcha_site_key || (state && state.siteSettings && state.siteSettings.recaptchaSiteKey);
            if (!siteKey) return null;
            // ensure container is an element we can render into
            const renderContainer = (typeof container === 'string') ? document.getElementById(container) : container;
            if (!renderContainer) return null;

            // Clear previous widget if present
            try { if (renderContainer._grecaptchaWidgetId !== undefined) { try { grecaptcha.reset(renderContainer._grecaptchaWidgetId); } catch(_){} } } catch(_){}

            // Render the widget
            let widgetId = null;
            try {
                widgetId = grecaptcha.render(renderContainer, {
                    sitekey: siteKey,
                    size: opts.size === 'normal' ? 'normal' : 'invisible',
                    badge: opts.badge || 'bottomright',
                    callback: function(token) {
                        // store last token and resolve any pending verify
                        renderContainer._lastGreCaptchaToken = token;
                        if (renderContainer._pendingVerifyResolve) {
                            try { renderContainer._pendingVerifyResolve(token); } catch(_){}
                            renderContainer._pendingVerifyResolve = null;
                            renderContainer._pendingVerifyReject = null;
                        }
                    },
                    'expired-callback': function() {
                        renderContainer._lastGreCaptchaToken = null;
                    }
                });
                renderContainer._grecaptchaWidgetId = widgetId;
            } catch (e) {
                console.warn('grecaptcha.render failed', e);
                return null;
            }

            const appVerifier = {
                type: 'recaptcha',
                verify: () => {
                    return new Promise((resolve, reject) => {
                        try {
                            // If we already have a recent token, resolve immediately
                            if (renderContainer._lastGreCaptchaToken) return resolve(renderContainer._lastGreCaptchaToken);
                            // set pending resolvers so callback can resolve
                            renderContainer._pendingVerifyResolve = resolve;
                            renderContainer._pendingVerifyReject = reject;
                            // Execute the invisible challenge; for visible widgets the user will trigger it.
                            try {
                                grecaptcha.execute(widgetId).catch(err => {
                                    // some grecaptcha builds don't return a promise; ignore
                                });
                            } catch (e) {
                                // Older grecaptcha may not support promise-returning execute
                                try { grecaptcha.execute(widgetId); } catch (ee) { reject(ee); }
                            }
                            // Timeout after 60s
                            setTimeout(() => {
                                if (renderContainer._pendingVerifyResolve) {
                                    renderContainer._pendingVerifyResolve = null;
                                    renderContainer._pendingVerifyReject = null;
                                    reject(new Error('reCAPTCHA verify timeout'));
                                }
                            }, 60000);
                        } catch (e) { reject(e); }
                    });
                },
                clear: () => {
                    try { if (renderContainer._grecaptchaWidgetId !== undefined) grecaptcha.reset(renderContainer._grecaptchaWidgetId); } catch(_){}
                }
            };

            return appVerifier;
        };

        // Defensive: ensure `auth.settings` exists so RecaptchaVerifier doesn't throw
        // when reading `appVerificationDisabledForTesting` (some SDK builds expect it).
        try {
            if (typeof auth !== 'undefined' && (!auth.settings || typeof auth.settings !== 'object')) {
                try { auth.settings = auth.settings || {}; } catch (_) {}
            }
        } catch (_) {}

        // First attempt: use our custom grecaptcha-based verifier which avoids SDK
        // internals reading auth internals at construction time.
        try {
            const customVerifier = createGreCaptchaAppVerifier(containerEl, { size: 'invisible', siteKey: window.__recaptcha_site_key });
            if (customVerifier) {
                window._tiarasMasterPwRecaptcha = customVerifier;
                return customVerifier;
            }
            // If custom verifier couldn't be created (e.g., grecaptcha blocked),
            // do NOT attempt to construct the SDK RecaptchaVerifier because some
            // SDK builds read deep auth internals synchronously and throw. Instead
            // return null and let callers display a clear diagnostic and fallback.
            console.warn('createGreCaptchaAppVerifier returned null; grecaptcha may be blocked or siteKey missing. Skipping SDK RecaptchaVerifier to avoid runtime errors.');
            return null;
        } catch (e) {
            console.warn('createGreCaptchaAppVerifier failed, skipping SDK RecaptchaVerifier to avoid runtime errors', e);
            return null;
        }

        // Try invisible reCAPTCHA first for smoother UX. If rendering fails (often due to
        // grecaptcha not yet available or local dev domain issues), fall back to a visible
        // checkbox so the admin can complete verification.
        // Defensive deep-setting: some Firebase SDK builds expect nested `settings` on
        // internal delegate objects (auth._delegate, auth._auth). Ensure those exist
        // so RecaptchaVerifier constructor does not throw when reading
        // appVerificationDisabledForTesting.
        try {
            if (typeof auth !== 'undefined' && auth) {
                try { if (!auth.settings || typeof auth.settings !== 'object') auth.settings = auth.settings || {}; } catch(_){}
                try { if (!('appVerificationDisabledForTesting' in auth.settings)) auth.settings.appVerificationDisabledForTesting = false; } catch(_){}
                try { if (auth._delegate && (!auth._delegate.settings || typeof auth._delegate.settings !== 'object')) auth._delegate.settings = auth._delegate.settings || {}; } catch(_){}
                try { if (auth._delegate && !('appVerificationDisabledForTesting' in auth._delegate.settings)) auth._delegate.settings.appVerificationDisabledForTesting = false; } catch(_){}
                try { if (auth._auth && (!auth._auth.settings || typeof auth._auth.settings !== 'object')) auth._auth.settings = auth._auth.settings || {}; } catch(_){}
                try { if (auth._auth && !('appVerificationDisabledForTesting' in auth._auth.settings)) auth._auth.settings.appVerificationDisabledForTesting = false; } catch(_){}
            }
        } catch(_) {}
        let verifier = null;
        try {
            // Create RecaptchaVerifier without passing `auth` here to avoid SDK internals
            // trying to read nested auth.settings during construction. The verifier can
            // still be passed to signInWithPhoneNumber/linkWithPhoneNumber later along
            // with the real `auth` object.
            verifier = new RecaptchaVerifier(containerEl, { size: 'invisible' });
            // Attempt to render; some environments may throw synchronously
            const renderResult = verifier.render();
            if (renderResult && typeof renderResult.then === 'function') {
                renderResult.catch((err) => {
                    console.warn('Invisible reCAPTCHA render failed, falling back to visible:', err);
                    try {
                        verifier.clear && verifier.clear();
                    } catch(_){}
                    // fallback to visible checkbox
                    verifier = new RecaptchaVerifier(containerEl, { size: 'normal' });
                    try { verifier.render().catch(() => {}); } catch(_){}
                    window._tiarasMasterPwRecaptcha = verifier;
                });
            }
        } catch (err) {
            console.warn('initRecaptchaForMasterPhone: invisible render error, switching to visible:', err);
            // If the error indicates auth.settings missing, attempt a defensive set on internal delegate
            try {
                if (auth && typeof auth === 'object') {
                    try { auth.settings = auth.settings || {}; } catch (_) {}
                    try { if (auth._delegate && !auth._delegate.settings) auth._delegate.settings = auth._delegate.settings || {}; } catch (_) {}
                }
            } catch (_) {}
            try { if (verifier && verifier.clear) verifier.clear(); } catch(_){ }
            try {
                verifier = new RecaptchaVerifier(containerEl, { size: 'normal' });
                try { verifier.render().catch(() => {}); } catch(_){ }
            } catch (vErr) {
                console.error('initRecaptchaForMasterPhone: failed to create visible RecaptchaVerifier:', vErr);
                // Return null so callers can show a helpful message instead of throwing
                return null;
            }
        }

        window._tiarasMasterPwRecaptcha = verifier;
        return verifier;
    } catch (err) {
        console.error('initRecaptchaForMasterPhone error', err);
        return null;
    }
}

function showOtpModal(title = 'Enter OTP') {
    return new Promise((resolve) => {
        try {
            let modal = document.getElementById('masterPasswordOtpModal');
            if (!modal) {
                const tpl = `
                <div id="masterPasswordOtpModal" class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 hidden" role="dialog" aria-modal="true">
                    <div class="bg-white p-6 rounded-md w-full max-w-sm">
                        <h3 id="masterPasswordOtpModalTitle" class="text-lg font-semibold mb-2">${title}</h3>
                        <p class="text-sm text-gray-700 mb-3">Enter the 6-digit OTP sent to your admin mobile.</p>
                        <div class="space-y-3">
                            <input id="masterPasswordOtpInput" type="text" inputmode="numeric" maxlength="10" class="w-full px-3 py-2 border rounded" placeholder="OTP" />
                            <div class="flex justify-end gap-2">
                                <button id="masterPasswordOtpCancel" class="px-3 py-2 bg-gray-200 rounded">Cancel</button>
                                <button id="masterPasswordOtpOk" class="px-3 py-2 bg-blue-600 text-white rounded">Verify</button>
                            </div>
                        </div>
                    </div>
                </div>`;
                const wrap = document.createElement('div'); wrap.innerHTML = tpl.trim(); document.body.appendChild(wrap.firstElementChild);
                modal = document.getElementById('masterPasswordOtpModal');
            }
            const input = document.getElementById('masterPasswordOtpInput');
            const ok = document.getElementById('masterPasswordOtpOk');
            const cancel = document.getElementById('masterPasswordOtpCancel');
            const cleanup = () => { try { ok.removeEventListener('click', onOk); } catch(_){} try { cancel.removeEventListener('click', onCancel); } catch(_){} try { document.removeEventListener('keydown', onKey); } catch(_){} try { modal.classList.add('hidden'); } catch(_){} };
            const onOk = () => { const v = input && input.value ? input.value.trim() : null; cleanup(); if (input) input.value = ''; resolve(v); };
            const onCancel = () => { cleanup(); if (input) input.value = ''; resolve(null); };
            const onKey = (e) => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') onOk(); };
            ok.addEventListener('click', onOk);
            cancel.addEventListener('click', onCancel);
            document.addEventListener('keydown', onKey);
            modal.classList.remove('hidden');
            try { input.focus(); } catch(_){}
        } catch (err) { console.error('showOtpModal error', err); resolve(null); }
    });
}

async function sendMasterPasswordOtp() {
    try {
        const phoneEl = document.getElementById('adminPhoneDisplay');
        const statusEl = document.getElementById('masterPasswordOtpStatus');
        if (statusEl) statusEl.textContent = 'Sending...';
        if (!phoneEl) { showMessage('Admin phone element missing.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
        const phone = (phoneEl.value || '').toString().trim();
        if (!phone) { showMessage('Invalid admin phone number configured.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }

        // Require that the current user is signed in (we will link the phone to their account)
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
            showMessage('Please sign in as an admin user before verifying the admin phone.'); if (statusEl) statusEl.textContent = 'Not verified'; return;
        }

        // Developer local/emulator shortcut: when running on localhost or when the
        // Auth emulator is in use (appVerificationDisabledForTesting), skip grecaptcha
        // and use a dev OTP printed to the console. This avoids RecaptchaVerifier issues
        // during local development.
        const hostname = (window && window.location && window.location.hostname) || '';
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        const emulatorBypass = !!(auth && (auth.appVerificationDisabledForTesting || (auth.settings && auth.settings.appVerificationDisabledForTesting)));
        if (isLocal || emulatorBypass) {
            // Generate a 6-digit OTP, store temporarily in state with TTL, and prompt user.
            const otp = String(Math.floor(100000 + Math.random() * 900000));
            state._masterPwdDevOtp = otp;
            state._masterPwdDevOtpExpiry = Date.now() + (5 * 60 * 1000);
            console.info('DEV MODE: Master password OTP (valid 5m):', otp);
            if (statusEl) statusEl.textContent = 'OTP sent (dev mode)';
            showMessage('DEV OTP generated and printed to console for local testing.');
            const code = await showOtpModal('Verify admin phone (dev)');
            if (!code) { showMessage('OTP verification cancelled.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
            if (Date.now() > (state._masterPwdDevOtpExpiry || 0)) { showMessage('OTP expired. Please try again.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
            if (code.trim() === state._masterPwdDevOtp) {
                state.masterPasswordPhoneVerified = true;
                state.masterPasswordPhoneVerifiedAt = Date.now();
                if (statusEl) statusEl.textContent = 'Verified ✓ (dev)';
                showMessage('Phone verified (dev). You may now save the new master password.');
                return true;
            } else {
                showMessage('OTP incorrect.');
                if (statusEl) statusEl.textContent = 'Not verified';
                return false;
            }
        }

        const verifier = await initRecaptchaForMasterPhone();
        if (!verifier) {
            console.error('sendMasterPasswordOtp: RecaptchaVerifier not available. grecaptcha=', !!window.grecaptcha, 'auth=', auth);
            const help = 'Failed to initialize reCAPTCHA. Common causes: adblocker blocking grecaptcha, reCAPTCHA not configured for this domain, or Firebase Phone Auth not enabled. Check browser console for details.';
            showMessage(help);
            if (statusEl) {
                statusEl.textContent = 'reCAPTCHA init failed - check console';
                statusEl.title = 'Check console for recaptcha and auth details';
            }
            // Offer a temporary dev-mode fallback (insecure) to continue testing: generate OTP printed to console.
            try {
                const allow = window.confirm('reCAPTCHA initialization failed. Do you want to use a temporary in-browser OTP (shown in console) for testing? This is insecure and should only be used for local/dev testing.');
                if (!allow) return;
                const otp = String(Math.floor(100000 + Math.random() * 900000));
                state._masterPwdDevOtp = otp;
                state._masterPwdDevOtpExpiry = Date.now() + (5 * 60 * 1000);
                console.info('FALLBACK DEV OTP (use only for testing):', otp);
                if (statusEl) statusEl.textContent = 'OTP sent (fallback dev)';
                const code = await showOtpModal('Verify admin phone (fallback dev)');
                if (!code) { showMessage('OTP verification cancelled.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
                if (Date.now() > (state._masterPwdDevOtpExpiry || 0)) { showMessage('OTP expired. Please try again.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
                if (code.trim() === state._masterPwdDevOtp) {
                    state.masterPasswordPhoneVerified = true;
                    state.masterPasswordPhoneVerifiedAt = Date.now();
                    if (statusEl) statusEl.textContent = 'Verified ✓ (fallback)';
                    showMessage('Phone verified (fallback). You may now save the new master password.');
                    return true;
                } else {
                    showMessage('OTP incorrect.');
                    if (statusEl) statusEl.textContent = 'Not verified';
                    return false;
                }
            } catch (e) {
                console.error('fallback dev OTP flow failed', e);
                return;
            }
        }

        // Attempt to proactively get a verification token with a short timeout.
        let gotToken = false;
        try {
            console.debug('sendMasterPasswordOtp: attempting verifier.verify() with 10s timeout');
            const token = await Promise.race([
                verifier.verify(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('verify timeout')), 10000))
            ]);
            console.debug('sendMasterPasswordOtp: verifier.verify returned token length=', token ? token.length : 0);
            gotToken = !!token;
        } catch (verErr) {
            console.warn('sendMasterPasswordOtp: verifier.verify failed or timed out', verErr);
            // If verify failed (possibly invisible recaptcha blocked), try a visible widget so the user can click.
            try {
                console.debug('sendMasterPasswordOtp: attempting to recreate visible grecaptcha widget');
                const visible = createGreCaptchaAppVerifier(document.getElementById('recaptcha-container-masterpw'), { size: 'normal', siteKey: window.__recaptcha_site_key });
                if (visible) {
                    window._tiarasMasterPwRecaptcha = visible;
                    // Wait for user to click and complete the visible widget (verify will resolve when token arrives)
                    try {
                        const token2 = await Promise.race([
                            visible.verify(),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('visible verify timeout')), 120000))
                        ]);
                        console.debug('sendMasterPasswordOtp: visible.verify returned token length=', token2 ? token2.length : 0);
                        gotToken = !!token2;
                    } catch (vErr) {
                        console.warn('sendMasterPasswordOtp: visible verifier failed', vErr);
                    }
                } else {
                    console.warn('sendMasterPasswordOtp: visible grecaptcha verifier could not be created');
                }
            } catch (vv) {
                console.error('sendMasterPasswordOtp: error attempting visible grecaptcha verifier', vv);
            }
        }

        if (!gotToken) {
            console.error('sendMasterPasswordOtp: could not obtain grecaptcha token; offering fallback. grecaptcha=', !!window.grecaptcha);
            try {
                const allow = window.confirm('reCAPTCHA initialization failed. Do you want to use a temporary in-browser OTP (shown in console) for testing? This is insecure and should only be used for local/dev testing.');
                if (!allow) return;
                const otp = String(Math.floor(100000 + Math.random() * 900000));
                state._masterPwdDevOtp = otp;
                state._masterPwdDevOtpExpiry = Date.now() + (5 * 60 * 1000);
                console.info('FALLBACK DEV OTP (use only for testing):', otp);
                if (statusEl) statusEl.textContent = 'OTP sent (fallback dev)';
                const code = await showOtpModal('Verify admin phone (fallback dev)');
                if (!code) { showMessage('OTP verification cancelled.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
                if (Date.now() > (state._masterPwdDevOtpExpiry || 0)) { showMessage('OTP expired. Please try again.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }
                if (code.trim() === state._masterPwdDevOtp) {
                    state.masterPasswordPhoneVerified = true;
                    state.masterPasswordPhoneVerifiedAt = Date.now();
                    if (statusEl) statusEl.textContent = 'Verified ✓ (fallback)';
                    showMessage('Phone verified (fallback). You may now save the new master password.');
                    return true;
                } else {
                    showMessage('OTP incorrect.');
                    if (statusEl) statusEl.textContent = 'Not verified';
                    return false;
                }
            } catch (e) {
                console.error('fallback dev OTP flow failed', e);
                return;
            }
        }

        let confirmationResult;
        try {
            // Prefer linking the phone to the existing signed-in user to avoid changing auth state
            confirmationResult = await linkWithPhoneNumber(auth.currentUser, phone, verifier);
        } catch (linkErr) {
            // If linking fails (e.g., already linked or not supported), fallback to send SMS via signInWithPhoneNumber
            try {
                confirmationResult = await signInWithPhoneNumber(auth, phone, verifier);
            } catch (signErr) {
                console.error('Failed to send OTP (link and sign-in attempts failed)', linkErr, signErr);
                showMessage('Failed to send OTP. Check the Firebase Phone Auth configuration and reCAPTCHA.');
                if (statusEl) statusEl.textContent = 'Not verified';
                return;
            }
        }

        // Store confirmationResult for later confirmation
        state._masterPwdConfirmationResult = confirmationResult;
        showMessage('OTP sent to ' + phone + '. Please enter the code to verify.');
        if (statusEl) statusEl.textContent = 'OTP sent';

        // Ask user to enter the OTP
        const code = await showOtpModal('Verify admin phone');
        if (!code) { showMessage('OTP verification cancelled.'); if (statusEl) statusEl.textContent = 'Not verified'; return; }

        // Confirm the code
        try {
            const userCred = await confirmationResult.confirm(code);
            // Mark verified in local state (short TTL e.g., 5 minutes)
            state.masterPasswordPhoneVerified = true;
            state.masterPasswordPhoneVerifiedAt = Date.now();
            if (statusEl) statusEl.textContent = 'Verified ✓';
            showMessage('Phone verified successfully. You may now save the new master password.');
            return true;
        } catch (confirmErr) {
            console.error('OTP confirm failed', confirmErr);
            showMessage('OTP is incorrect or expired. Please try again.');
            if (statusEl) statusEl.textContent = 'Not verified';
            return false;
        }
    } catch (err) {
        console.error('sendMasterPasswordOtp error', err);
        showMessage('Failed to send/verify OTP.');
        try { const statusEl = document.getElementById('masterPasswordOtpStatus'); if (statusEl) statusEl.textContent = 'Not verified'; } catch(_){}
        return false;
    }
}
// --- REPORT DATA FETCH (archived/epoch-agnostic) ---
async function fetchReportsDataForRange(startDateStr, endDateStr) {
    try {
        const start = new Date(startDateStr); start.setHours(0,0,0,0);
        const end = new Date(endDateStr); end.setHours(23,59,59,999);

        // Helper to ts range queries
        const ordersQ = query(collection(db, ordersColPath), where('orderDate', '>=', start), where('orderDate', '<=', end));
        const purchasesQ = query(collection(db, purchasesColPath), where('purchaseDate', '>=', start), where('purchaseDate', '<=', end));
        const localSalesQ = query(collection(db, localSalesColPath), where('saleDate', '>=', start), where('saleDate', '<=', end));
        const salesReturnsQ = query(collection(db, salesReturnsColPath), where('returnDate', '>=', start), where('returnDate', '<=', end));
        const purchaseReturnsQ = query(collection(db, purchaseReturnsColPath), where('returnDate', '>=', start), where('returnDate', '<=', end));

        const [ordersSnap, purchasesSnap, localSalesSnap, salesReturnsSnap, purchaseReturnsSnap] = await Promise.all([
            getDocs(ordersQ), getDocs(purchasesQ), getDocs(localSalesQ), getDocs(salesReturnsQ), getDocs(purchaseReturnsQ)
        ]);

        state.reportData.orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reportData.purchases = purchasesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reportData.localSales = localSalesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reportData.salesReturns = salesReturnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reportData.purchaseReturns = purchaseReturnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        state.reportData.lastRange = { start: startDateStr, end: endDateStr };
    } catch (e) {
        console.warn('Report data fetch failed:', e?.message || e);
    }
}

function getReportArrays() {
    if (state.reportsIncludeArchived && state.reportData && state.reportData.lastRange) {
        return {
            orders: state.reportData.orders || [],
            purchases: state.reportData.purchases || [],
            localSales: state.reportData.localSales || [],
            salesReturns: state.reportData.salesReturns || [],
            purchaseReturns: state.reportData.purchaseReturns || [],
        };
    }
    return {
        orders: state.allOrders || [],
        purchases: state.allPurchases || [],
        localSales: state.allLocalSales || [],
        salesReturns: state.allSalesReturns || [],
        purchaseReturns: state.allPurchaseReturns || [],
    };
}

// --- MASTER RESET HELPERS ---
function getEpochMs(key) {
    // Prefer server-provided epoch from site settings, else local storage
    const serverMs = state.siteSettings?.visibilityEpochs?.[key];
    if (typeof serverMs === 'number') return serverMs;
    const local = localStorage.getItem(`tiaras_visibilityEpoch_${appId}_${key}`);
    return local ? parseInt(local, 10) : 0;
}

async function bumpVisibilityEpoch(key) {
    const now = Date.now();
    try {
        const payload = { visibilityEpochs: { [key]: now } };
        await setDoc(doc(db, siteSettingsDocPath), payload, { merge: true });
        // Update local state immediately for UX
        state.siteSettings.visibilityEpochs = {
            ...(state.siteSettings.visibilityEpochs || {}),
            [key]: now,
        };
    } catch (e) {
        // Fallback to local-only epoch if siteSettings write is blocked by rules
        localStorage.setItem(`tiaras_visibilityEpoch_${appId}_${key}`, String(now));
        console.warn('Using local visibility epoch for', key);
    }
}
async function deleteAllDocsInCollection(colPath) {
    const snap = await getDocs(collection(db, colPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        batch.delete(d.ref);
        ops++;
        if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
        }
    }
    if (ops > 0) await batch.commit();
}

// Helper: mark all docs in a collection (soft delete)
async function markAllDocsInCollection(colPath, fields = { isDeleted: true }) {
    const snap = await getDocs(collection(db, colPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        batch.set(d.ref, fields, { merge: true });
        ops++;
        if (ops >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            ops = 0;
        }
    }
    if (ops > 0) await batch.commit();
}

function isPermissionDenied(err) {
    const msg = String(err?.message || '').toLowerCase();
    return err?.code === 'permission-denied' || msg.includes('missing or insufficient permissions');
}

async function deleteAllOrdersAndUserOrders() {
    const snap = await getDocs(collection(db, ordersColPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        const order = d.data();
        // delete public order
        batch.delete(d.ref); ops++;
        if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // Best-effort: attempt to delete user order copies individually, but ignore permission errors
    for (const d of snap.docs) {
        const order = d.data();
        if (order?.userId) {
            const userOrderRef = doc(db, `artifacts/${appId}/users/${order.userId}/orders`, d.id);
            try { await deleteDoc(userOrderRef); } catch (e) { if (!isPermissionDenied(e)) console.info('User order delete non-permission error:', e); }
        }
    }
}

// Soft delete orders and linked user orders
async function markAllOrdersAndUserOrdersDeleted() {
    const snap = await getDocs(collection(db, ordersColPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        const order = d.data();
        batch.set(d.ref, { isDeleted: true }, { merge: true }); ops++;
        if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // Best-effort: try to mark user copies deleted individually; ignore permission-denied
    for (const d of snap.docs) {
        const order = d.data();
        if (order?.userId) {
            const userOrderRef = doc(db, `artifacts/${appId}/users/${order.userId}/orders`, d.id);
            try { await setDoc(userOrderRef, { isDeleted: true }, { merge: true }); } catch (e) { if (!isPermissionDenied(e)) console.info('User order soft-delete non-permission error:', e); }
        }
    }
}

// Public-only order operations to avoid client writes to user subcollections
async function deleteAllPublicOrders() {
    const snap = await getDocs(collection(db, ordersColPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        batch.delete(d.ref); ops++;
        if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
}

async function markAllPublicOrdersDeleted() {
    const snap = await getDocs(collection(db, ordersColPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
        batch.set(d.ref, { isDeleted: true }, { merge: true }); ops++;
        if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
}

// Delete carts for all users (cart doc id: 'user_cart' in users/{uid}/cart/user_cart)
async function deleteAllUserCarts() {
    const usersColPath = `artifacts/${appId}/users`;
    const usersSnap = await getDocs(collection(db, usersColPath));
    let batch = writeBatch(db);
    let ops = 0;
    for (const u of usersSnap.docs) {
        const cartRef = doc(db, `artifacts/${appId}/users/${u.id}/cart`, 'user_cart');
        try {
            batch.delete(cartRef);
        } catch (_) {
            // fallback later in commit
        }
        ops++;
        if (ops >= 450) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) {
        try { await batch.commit(); } catch (e) { if (!isPermissionDenied(e)) throw e; }
    }

    // Fallback: set empty carts (best-effort)
    batch = writeBatch(db);
    ops = 0;
    for (const u of usersSnap.docs) {
        const cartRef = doc(db, `artifacts/${appId}/users/${u.id}/cart`, 'user_cart');
        try { batch.set(cartRef, { items: {} }, { merge: true }); } catch (_) {}
        ops++;
        if (ops >= 450) { try { await batch.commit(); } catch (e) { if (!isPermissionDenied(e)) throw e; } batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) {
        try { await batch.commit(); } catch (e) { if (!isPermissionDenied(e)) throw e; }
    }
}

// resetUserCartsSmart: disabled. User-cart reset functionality removed.
async function resetUserCartsSmart() {
    // No-op to avoid invoking removed server-side reset endpoints.
    return;
}

// Reset only selected data buckets based on flags
async function resetSelectedData(flags) {
    const errors = [];
    const results = []; // collect per-bucket outcomes for UI summary
    const safe = async (label, fn, fallback, epochKey) => {
        try {
            await fn();
            console.info(`${label}: primary delete completed`);
            results.push({ label, status: 'deleted' });
            return;
        } catch (e) {
            // If permission denied, try fallback soft-delete then epoch bump
            if (isPermissionDenied(e)) {
                if (typeof fallback === 'function') {
                    try {
                        await fallback();
                        console.info(`${label}: fallback soft-delete completed`);
                        results.push({ label, status: 'soft-deleted' });
                        return;
                    } catch (e2) {
                        if (!isPermissionDenied(e2)) console.info(`Fallback failed: ${label}`, e2);
                        // continue to epoch bump attempt
                    }
                }
                if (epochKey) {
                    try {
                        await bumpVisibilityEpoch(epochKey);
                        console.info(`${label}: visibility epoch bumped for ${epochKey}`);
                        results.push({ label, status: 'epoch-bumped' });
                        return;
                    } catch (e3) {
                        console.error(`Epoch bump failed for ${label}:`, e3);
                        errors.push({ label, error: e3 });
                        return;
                    }
                }
            }
            console.error(`Selected reset step failed: ${label}`, e);
            errors.push({ label, error: e });
            results.push({ label, status: 'failed', error: String(e && e.message ? e.message : e) });
            return;
        }
    };

    // Collections (with fallbacks)
    if (flags.orders) {
        await safe('Orders', () => deleteAllPublicOrders(), () => markAllPublicOrdersDeleted(), 'orders');
        // Always bump visibility epoch to hide any legacy user-subcollection order copies
        try { await bumpVisibilityEpoch('orders'); } catch (e) { console.warn('orders epoch bump (post-delete) failed', e); }
    }
    if (flags.suppliers) await safe('Suppliers', () => deleteAllDocsInCollection(suppliersColPath), () => markAllDocsInCollection(suppliersColPath), 'suppliers');
    if (flags.customers) await safe('Customers', () => deleteAllDocsInCollection(customersColPath), () => markAllDocsInCollection(customersColPath), 'customers');
    if (flags.products) await safe('Products', () => deleteAllDocsInCollection(productsColPath), () => markAllDocsInCollection(productsColPath), 'products');
    if (flags.productGroups) await safe('Product Groups', () => deleteAllDocsInCollection(productGroupsColPath), () => markAllDocsInCollection(productGroupsColPath), 'productGroups');
    if (flags.slides) await safe('Hero Slides', () => deleteAllDocsInCollection(slidesColPath), () => markAllDocsInCollection(slidesColPath), 'slides');
    if (flags.gallery) await safe('Gallery Images', () => deleteAllDocsInCollection(galleryImagesColPath), () => markAllDocsInCollection(galleryImagesColPath), 'galleryImages');
    if (flags.testimonials) await safe('Testimonials', () => deleteAllDocsInCollection(testimonialsColPath), () => markAllDocsInCollection(testimonialsColPath), 'testimonials');
    if (flags.purchases) await safe('Purchases', () => deleteAllDocsInCollection(purchasesColPath), () => markAllDocsInCollection(purchasesColPath), 'purchases');
    if (flags.localSales) await safe('Local Sales', () => deleteAllDocsInCollection(localSalesColPath), () => markAllDocsInCollection(localSalesColPath), 'localSales');
    if (flags.salesReturns) await safe('Sales Returns', () => deleteAllDocsInCollection(salesReturnsColPath), () => markAllDocsInCollection(salesReturnsColPath), 'salesReturns');
    if (flags.purchaseReturns) await safe('Purchase Returns', () => deleteAllDocsInCollection(purchaseReturnsColPath), () => markAllDocsInCollection(purchaseReturnsColPath), 'purchaseReturns');
    if (flags.creditors) await safe('Creditors Ledger', () => deleteAllDocsInCollection(creditorsLedgerColPath), () => markAllDocsInCollection(creditorsLedgerColPath), 'creditors');
    if (flags.debtors) await safe('Debtors Ledger', () => deleteAllDocsInCollection(debtorsLedgerColPath), () => markAllDocsInCollection(debtorsLedgerColPath), 'debtors');
    // Cash & Bank books
    if (flags.cash) await safe('Cash Book', () => deleteAllDocsInCollection(cashLedgerColPath), () => markAllDocsInCollection(cashLedgerColPath), 'cash');
    if (flags.bank) await safe('Bank Book', () => deleteAllDocsInCollection(bankLedgerColPath), () => markAllDocsInCollection(bankLedgerColPath), 'bank');
    // Party masters
    if (flags.banks) await safe('Banks', () => deleteAllDocsInCollection(banksColPath), () => markAllDocsInCollection(banksColPath), 'banks');
    // User Carts: prefer admin Cloud Function; fallback to client-side best-effort
    if (flags.carts) await safe('User Carts', () => resetUserCartsSmart());

    // Site settings
    if (flags.siteSettings) {
        // Preserve visibilityEpochs to ensure resets remain effective after any subsequent writes
        const preservedEpochs = { ...(state.siteSettings?.visibilityEpochs || {}) };
        const defaultSettings = {
            isScrollingBarVisible: true,
            scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
            isGstEnabled: true,
            merchantGstin: '29ABCDE1234F1Z5',
            businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542',
            visibilityEpochs: preservedEpochs,
        };
        // Use merge: true so we don't blow away server-side fields like visibilityEpochs
        await safe('Site Settings', () => setDoc(doc(db, siteSettingsDocPath), defaultSettings, { merge: true }));
        state.siteSettings = { ...state.siteSettings, ...defaultSettings, visibilityEpochs: preservedEpochs };
    }

    // Counters
    if (flags.counters) {
        await safe('Counters', () => setDoc(doc(db, countersDocPath), {}, { merge: false }));
    }

    renderApp();
    return { ok: errors.length === 0, errors, results };
}

async function resetAllData() {
    const errors = [];
        const results = [];
        const safe = async (label, fn, fallback, epochKey) => {
            try { await fn(); results.push({ label, status: 'deleted' }); }
            catch (e) {
                if (isPermissionDenied(e)) {
                    if (typeof fallback === 'function') {
                        try { await fallback(); results.push({ label, status: 'soft-deleted' }); return; }
                        catch (e2) {
                            // If fallback also permission-denied, attempt epoch bump and treat as handled
                            if (epochKey) { try { await bumpVisibilityEpoch(epochKey); results.push({ label, status: 'epoch-bumped' }); return; } catch (e3) { errors.push({ label, error: e3 }); return; } }
                            // Non-permission error: record
                            errors.push({ label, error: e2 });
                            results.push({ label, status: 'failed', error: String(e2 && e2.message ? e2.message : e2) });
                            return;
                        }
                    }
                    if (epochKey) { try { await bumpVisibilityEpoch(epochKey); results.push({ label, status: 'epoch-bumped' }); return; } catch (e3) { errors.push({ label, error: e3 }); return; } }
                }
                console.error(`Reset step failed: ${label}`, e);
                errors.push({ label, error: e });
                results.push({ label, status: 'failed', error: String(e && e.message ? e.message : e) });
            }
        };

    // Delete or soft-delete high-volume collections first
    await safe('Orders', () => deleteAllPublicOrders(), () => markAllPublicOrdersDeleted(), 'orders');
    // Regardless of delete/soft-delete outcome, bump epoch to hide any historical user order copies
    try { await bumpVisibilityEpoch('orders'); } catch (e) { console.warn('orders epoch bump (post-master-reset) failed', e); }
    await safe('Products', () => deleteAllDocsInCollection(productsColPath), () => markAllDocsInCollection(productsColPath), 'products');
    await safe('Suppliers', () => deleteAllDocsInCollection(suppliersColPath), () => markAllDocsInCollection(suppliersColPath), 'suppliers');
    await safe('Customers', () => deleteAllDocsInCollection(customersColPath), () => markAllDocsInCollection(customersColPath), 'customers');
    // Party masters
    await safe('Banks', () => deleteAllDocsInCollection(banksColPath), () => markAllDocsInCollection(banksColPath), 'banks');
    await safe('Product Groups', () => deleteAllDocsInCollection(productGroupsColPath), () => markAllDocsInCollection(productGroupsColPath), 'productGroups');
    await safe('Hero Slides', () => deleteAllDocsInCollection(slidesColPath), () => markAllDocsInCollection(slidesColPath), 'slides');
    await safe('Gallery Images', () => deleteAllDocsInCollection(galleryImagesColPath), () => markAllDocsInCollection(galleryImagesColPath), 'galleryImages');
    await safe('Testimonials', () => deleteAllDocsInCollection(testimonialsColPath), () => markAllDocsInCollection(testimonialsColPath), 'testimonials');
    await safe('Purchases', () => deleteAllDocsInCollection(purchasesColPath), () => markAllDocsInCollection(purchasesColPath), 'purchases');
    await safe('Creditors Ledger', () => deleteAllDocsInCollection(creditorsLedgerColPath), () => markAllDocsInCollection(creditorsLedgerColPath), 'creditors');
    await safe('Debtors Ledger', () => deleteAllDocsInCollection(debtorsLedgerColPath), () => markAllDocsInCollection(debtorsLedgerColPath), 'debtors');
    await safe('Local Sales', () => deleteAllDocsInCollection(localSalesColPath), () => markAllDocsInCollection(localSalesColPath), 'localSales');
    await safe('Sales Returns', () => deleteAllDocsInCollection(salesReturnsColPath), () => markAllDocsInCollection(salesReturnsColPath), 'salesReturns');
    await safe('Purchase Returns', () => deleteAllDocsInCollection(purchaseReturnsColPath), () => markAllDocsInCollection(purchaseReturnsColPath), 'purchaseReturns');
    // Cash & Bank books
    await safe('Cash Book', () => deleteAllDocsInCollection(cashLedgerColPath), () => markAllDocsInCollection(cashLedgerColPath), 'cash');
    await safe('Bank Book', () => deleteAllDocsInCollection(bankLedgerColPath), () => markAllDocsInCollection(bankLedgerColPath), 'bank');

    // Reset site settings to defaults
    const preservedEpochs = { ...(state.siteSettings?.visibilityEpochs || {}) };
    const defaultSettings = {
        isScrollingBarVisible: true,
        scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
        isGstEnabled: true,
        merchantGstin: '29ABCDE1234F1Z5',
        businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542',
        visibilityEpochs: preservedEpochs,
    };
    // Use merge: true so we don't clear visibilityEpochs or other unrelated settings fields
    await safe('Site Settings', () => setDoc(doc(db, siteSettingsDocPath), defaultSettings, { merge: true }));

    // Clear counters: set empty object instead of delete (often allowed by rules that block delete)
    await safe('Counters', () => setDoc(doc(db, countersDocPath), {}, { merge: false }));

    // Reset local state minimally
    state.cart = { items: {} };
    state.products = [];
    state.productGroups = [];
    state.heroSlides = [];
    state.galleryImages = [];
    state.testimonials = [];
    state.allTestimonials = [];
    state.allSuppliers = [];
    state.allCustomers = [];
    state.orders = [];
    state.allOrders = [];
    state.allPurchases = [];
    state.allLocalSales = [];
    state.allSalesReturns = [];
    state.allPurchaseReturns = [];
    state.siteSettings = { ...state.siteSettings, ...defaultSettings, visibilityEpochs: preservedEpochs };

    renderApp();

    return { ok: errors.length === 0, errors, results };
}

function printReport(reportContainerId, reportTitle) {
    const reportContainer = document.getElementById(reportContainerId);
    if (!reportContainer) {
        console.error('Report container not found for printing');
        return;
    }

    const reportHtml = reportContainer.innerHTML;
    const printWindow = window.open('', '_blank', 'height=600,width=800');

   printWindow.document.write('<html><head><title>' + reportTitle + '</title>');
    printWindow.document.write(`
        <style>
            body { font-family: 'Poppins', sans-serif; margin: 2rem; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            h1, h2, h3 { font-family: 'Playfair Display', serif; }
            .flex, .grid { display: block; } /* Simplify layout for printing */
        </style>
    `);
   printWindow.document.write('</head><body>');
   printWindow.document.write(`<h1>${reportTitle}</h1>`);
    printWindow.document.write(`<p>Date: ${formatDate(new Date())}</p><hr/>`);
   printWindow.document.write(reportHtml);
   printWindow.document.write('</body></html>');

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

function attachReportListeners() {
   document.getElementById('applyDateFilterBtn')?.addEventListener('click', () => {
        state.registerStartDate = document.getElementById('registerStartDate').value;
        state.registerEndDate = document.getElementById('registerEndDate').value;
        if (state.reportsIncludeArchived) {
            const minStart = [state.registerStartDate, state.billingStartDate].filter(Boolean).sort()[0] || state.registerStartDate;
            const maxEnd = [state.registerEndDate, state.billingEndDate].filter(Boolean).sort().slice(-1)[0] || state.registerEndDate;
            fetchReportsDataForRange(minStart, maxEnd).then(() => renderAdminBillingPage());
        } else {
            renderAdminBillingPage();
        }
    });
    
   document.querySelectorAll('.register-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            state.registerFilter = e.currentTarget.dataset.filter;
            renderAdminBillingPage();
        });
    });

   document.getElementById('printRegisterBtn')?.addEventListener('click', () => printReport('registerReportContainer', 'Purchase & Sales Register'));
   document.getElementById('exportRegisterBtn')?.addEventListener('click', () => exportTableToCSV('registerTable', 'purchase-sales-register.csv'));
    
   document.getElementById('printSalesReportBtn')?.addEventListener('click', () => printReport('salesReportContainer', 'Sales Report'));

    document.getElementById('printInventoryBtn')?.addEventListener('click', () => printReport('inventoryReportContainer', 'Inventory Report'));
   document.getElementById('exportInventoryBtn')?.addEventListener('click', () => exportTableToCSV('inventoryTable', 'inventory-report.csv'));

    // Billing controls
        document.getElementById('billingStartDate')?.addEventListener('change', (e) => { state.billingStartDate = e.target.value; const updateReportRangeIfNeeded = () => { if (!state.reportsIncludeArchived) return; const minStart = [state.registerStartDate, state.billingStartDate].filter(Boolean).sort()[0] || state.registerStartDate; const maxEnd = [state.registerEndDate, state.billingEndDate].filter(Boolean).sort().slice(-1)[0] || state.registerEndDate; fetchReportsDataForRange(minStart, maxEnd).then(() => renderAdminBillingPage()); }; updateReportRangeIfNeeded(); renderAdminBillingPage(); });
        document.getElementById('billingEndDate')?.addEventListener('change', (e) => { state.billingEndDate = e.target.value; const updateReportRangeIfNeeded = () => { if (!state.reportsIncludeArchived) return; const minStart = [state.registerStartDate, state.billingStartDate].filter(Boolean).sort()[0] || state.registerStartDate; const maxEnd = [state.registerEndDate, state.billingEndDate].filter(Boolean).sort().slice(-1)[0] || state.registerEndDate; fetchReportsDataForRange(minStart, maxEnd).then(() => renderAdminBillingPage()); }; updateReportRangeIfNeeded(); renderAdminBillingPage(); });
    document.getElementById('billingSearch')?.addEventListener('input', (e) => { state.billingSearchText = e.target.value; renderAdminBillingPage(); });
    document.getElementById('printBillingBtn')?.addEventListener('click', () => printReport('billingContainer', 'Billing & Invoicing'));
    document.getElementById('exportBillingBtn')?.addEventListener('click', () => exportTableToCSV('billingTable', 'billing-report.csv'));

   // Include archived toggles (shared state)
   const updateReportRangeIfNeeded = () => {
       if (!state.reportsIncludeArchived) return;
       const minStart = [state.registerStartDate, state.billingStartDate].filter(Boolean).sort()[0] || state.registerStartDate;
       const maxEnd = [state.registerEndDate, state.billingEndDate].filter(Boolean).sort().slice(-1)[0] || state.registerEndDate;
       try { fetchReportsDataForRange(minStart, maxEnd).then(() => renderAdminBillingPage()); } catch {}
   };
   document.getElementById('includeArchivedToggle')?.addEventListener('change', (e) => {
       state.reportsIncludeArchived = !!e.target.checked;
       if (state.reportsIncludeArchived) updateReportRangeIfNeeded();
       else renderAdminBillingPage();
   });
   document.getElementById('includeArchivedToggleBilling')?.addEventListener('change', (e) => {
       state.reportsIncludeArchived = !!e.target.checked;
       if (state.reportsIncludeArchived) updateReportRangeIfNeeded();
       else renderAdminBillingPage();
   });

   // Register pagination
   document.getElementById('registerPrev')?.addEventListener('click', () => { if (state.registerPage > 1) { state.registerPage--; renderAdminBillingPage(); } });
   document.getElementById('registerNext')?.addEventListener('click', () => { state.registerPage++; renderAdminBillingPage(); });
   document.getElementById('registerPageSize')?.addEventListener('change', (e) => { state.registerPageSize = parseInt(e.target.value) || 25; state.registerPage = 1; renderAdminBillingPage(); });

   // Billing pagination
   document.getElementById('billingPrev')?.addEventListener('click', () => { if (state.billingPage > 1) { state.billingPage--; renderAdminBillingPage(); } });
   document.getElementById('billingNext')?.addEventListener('click', () => { state.billingPage++; renderAdminBillingPage(); });
   document.getElementById('billingPageSize')?.addEventListener('change', (e) => { state.billingPageSize = parseInt(e.target.value) || 25; state.billingPage = 1; renderAdminBillingPage(); });

    // Party-wise ledger controls
    document.getElementById('partyLedgerType')?.addEventListener('change', (e) => {
        try {
            const val = (e.target.value || 'supplier');
            const sel = document.getElementById('partyLedgerSelect');
            if (!sel) return;
            if (val === 'supplier') {
                sel.innerHTML = `<option value="">-- Select Party --</option>` + (state.allSuppliers || []).map(s => { const name = (s.name||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;'); const gst = s.gstin ? (' • ' + s.gstin) : ''; return `<option value="${name}" data-id="${s.id||''}">${name}${gst}</option>`; }).join('');
            } else {
                sel.innerHTML = `<option value="">-- Select Party --</option>` + (state.allCustomers || []).map(c => { const name = (c.name||'').toString().replace(/</g,'&lt;').replace(/>/g,'&gt;'); return `<option value="${name}" data-id="${c.id||''}">${name}</option>`; }).join('');
            }
        } catch (err) { console.error('partyLedgerType change', err); }
    });

    document.getElementById('generatePartyLedgerBtn')?.addEventListener('click', (ev) => {
        try {
            ev.preventDefault();
            const type = (document.getElementById('partyLedgerType')?.value || 'supplier');
            const party = (document.getElementById('partyLedgerSelect')?.value || '').trim();
            if (!party) { showMessage('Please select a party.'); return; }
            const startD = new Date(document.getElementById('partyLedgerStartDate')?.value || state.registerStartDate);
            startD.setHours(0,0,0,0);
            const endD = new Date(document.getElementById('partyLedgerEndDate')?.value || state.registerEndDate);
            endD.setHours(23,59,59,999);

            const entries = [];
            const escape = (v) => (v === null || typeof v === 'undefined') ? '' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            let table = `<div class="text-sm text-gray-500">No entries found for the selected party and date range.</div>`;
            const nameLower = party.toLowerCase();

            // Purchases (supplier) -> debit
            if (type === 'supplier') {
                (state.allPurchases || []).forEach(p => {
                    if (p.isDeleted) return;
                    const d = _toDate(p.purchaseDate);
                    if (!d || d < startD || d > endD) return;
                    const match = ((p.supplierName||'').toString().trim().toLowerCase() === nameLower) || ((p.supplierGstin||'').toString().trim() === (state.allSuppliers.find(s=> (s.name||'').toString().trim().toLowerCase()===nameLower)?.gstin || ''));
                    if (match) entries.push({ date: d, id: p.id, ref: p.invoiceNumber || p.id, type: 'Purchase', details: p.supplierName || '', debit: p.totalAmount || 0, credit: 0 });
                });

                // Ensure dates are proper Date objects and sort
                entries.forEach(e => { if (e && e.date && typeof e.date === 'string') e.date = _toDate(e.date); });
                entries.sort((a,b) => { const da = a && a.date ? (+a.date) : 0; const db = b && b.date ? (+b.date) : 0; return da - db; });

                const rowsHtml = (entries || []).map(e => {
                    return `<tr class="border-t"><td class="p-2">${formatDate(e.date)}</td><td class="p-2">${escape(e.ref)}</td><td class="p-2">${escape(e.type)}</td><td class="p-2">${escape(e.details)}</td><td class="p-2 text-right">${formatMoney(e.debit || 0)}</td><td class="p-2 text-right">${formatMoney(e.credit || 0)}</td></tr>`;
                }).join('');

                table = `<div class="overflow-x-auto"><table id="partyLedgerTable" class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">Date</th><th class="p-2">Ref</th><th class="p-2">Type</th><th class="p-2">Details</th><th class="p-2 text-right">Debit (₹)</th><th class="p-2 text-right">Credit (₹)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
            } else {
                // Customer ledger: sales -> credit
                (state.allOrders || []).forEach(o => {
                    const d = _toDate(o.orderDate);
                    if (!d || d < startD || d > endD) return;
                    const customerName = (o.shippingInfo?.fullName || o.customerName || '').toString().trim().toLowerCase();
                    if (customerName === nameLower) {
                        entries.push({ date: d, id: o.id, ref: o.invoiceNumber || o.id, type: 'Sale', details: o.shippingInfo?.fullName || '', debit: 0, credit: o.totalAmount || 0 });
                    }
                });

                entries.forEach(e => { if (e && e.date && typeof e.date === 'string') e.date = _toDate(e.date); });
                entries.sort((a,b) => { const da = a && a.date ? (+a.date) : 0; const db = b && b.date ? (+b.date) : 0; return da - db; });

                const rowsHtml = (entries || []).map(e => {
                    return `<tr class="border-t"><td class="p-2">${formatDate(e.date)}</td><td class="p-2">${escape(e.ref)}</td><td class="p-2">${escape(e.type)}</td><td class="p-2">${escape(e.details)}</td><td class="p-2 text-right">${formatMoney(e.debit || 0)}</td><td class="p-2 text-right">${formatMoney(e.credit || 0)}</td></tr>`;
                }).join('');

                table = `<div class="overflow-x-auto"><table id="partyLedgerTable" class="w-full text-sm text-left"><thead class="bg-gray-100"><tr><th class="p-2">Date</th><th class="p-2">Ref</th><th class="p-2">Type</th><th class="p-2">Details</th><th class="p-2 text-right">Debit (₹)</th><th class="p-2 text-right">Credit (₹)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
            }

            const out = document.getElementById('partyLedgerResultContainer');
            if (out) out.innerHTML = table;
        } catch (err) { console.error('generatePartyLedger', err); showMessage('Failed to generate ledger.'); }
    });

    document.getElementById('printPartyLedgerBtn')?.addEventListener('click', () => printReport('partyLedgerContainer', 'Party-wise Ledger'));
    document.getElementById('exportPartyLedgerBtn')?.addEventListener('click', () => exportTableToCSV('partyLedgerTable', 'party-ledger.csv'));

    // Inventory pagination
    document.getElementById('inventoryPrev')?.addEventListener('click', () => { if ((state.inventoryPage || 1) > 1) { state.inventoryPage = (state.inventoryPage || 1) - 1; renderAdminBillingPage(); } });
    document.getElementById('inventoryNext')?.addEventListener('click', () => { state.inventoryPage = (state.inventoryPage || 1) + 1; renderAdminBillingPage(); });
    document.getElementById('inventoryPageSize')?.addEventListener('change', (e) => { state.inventoryPageSize = parseInt(e.target.value) || 10; state.inventoryPage = 1; renderAdminBillingPage(); });
}

function renderAdminReturnsPage() {
    const container = document.getElementById('adminReturnsContainer');
    if (!container) return;

    // Sales Return Form
    const salesReturnHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-6">Create Sales Return (Credit Note)</h3>
            <form id="salesReturnForm" class="space-y-6">
                <input type="hidden" id="editingSalesReturnId" value="" />
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Order ID / Invoice #</label>
                        <input type="text" id="salesReturnOrderSearch" class="w-full px-4 py-2 border rounded-md" placeholder="Enter Order ID or Invoice #">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Matched Order</label>
                        <select id="salesReturnOrderSelect" class="w-full px-4 py-2 border rounded-md">
                            <option value="">-- Select Order --</option>
                            ${state.allOrders.map(o => `<option value="${o.id}">${o.invoiceNumber || o.id} - ${o.shippingInfo.fullName} (${formatDate(o.orderDate)})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Local Sale Invoice # (optional)</label>
                        <input type="text" id="salesReturnLocalSaleSearch" class="w-full px-4 py-2 border rounded-md" placeholder="Enter Local Sale ID or Invoice #">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Matched Local Sale</label>
                        <div id="salesReturnLocalSaleInfo" class="text-sm text-gray-500">None</div>
                    </div>
                </div>
                <div class="pt-2">
                    <label class="flex items-center">
                        <input type="checkbox" id="salesReturnIsCredit" class="h-4 w-4 rounded border-gray-300 text-black focus:ring-black">
                        <span class="ml-2 text-sm text-gray-700">Return for a Credit Sale</span>
                    </label>
                </div>
                <div id="salesReturnRefundModeRow" class="pt-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Refund Mode</label>
                    <select id="salesReturnRefundMode" class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        <option value="cash" selected>Cash</option>
                        <option value="bank">Bank</option>
                    </select>
                    <p class="text-xs text-gray-500 mt-1">Shown only when not a credit return. Refund reduces Cash/Bank.</p>
                </div>
                <div id="salesReturnItemsContainer" class="mt-4"></div>
                <div class="flex justify-end items-center gap-4 mt-4">
                    <div class="text-right">
                        <div class="text-sm text-gray-600">Return Total (₹):</div>
                        <div id="salesReturnTotal" class="font-bold text-xl">0.00</div>
                    </div>
                    <button type="submit" class="bg-green-600 text-white font-semibold py-2 px-6 rounded-md hover:bg-green-700">Record Sales Return</button>
                </div>
            </form>
        </div>`;

    // Purchase Return Form
    const purchaseReturnHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-6">Create Purchase Return (Debit Note)</h3>
            <form id="purchaseReturnForm" class="space-y-6">
                <input type="hidden" id="editingPurchaseReturnId" value="" />
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Purchase ID / Invoice #</label>
                        <input type="text" id="purchaseReturnSearch" class="w-full px-4 py-2 border rounded-md" placeholder="Enter Purchase ID or Invoice #">
                    </div>
                    <div class="md:col-span-2">
                        <label class="block text-sm font-medium text-gray-700 mb-1">Matched Purchase</label>
                        <select id="purchaseReturnSelect" class="w-full px-4 py-2 border rounded-md">
                            <option value="">-- Select Purchase --</option>
                            ${state.allPurchases.filter(p => !p.isDeleted).map(p => `<option value="${p.id}">${p.invoiceNumber || p.id} - ${p.supplierName} (${formatDate(p.purchaseDate)})</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="pt-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Settlement Type</label>
                    <div class="flex flex-wrap gap-4 text-sm">
                        <label class="inline-flex items-center gap-2">
                            <input type="radio" name="purchaseReturnSettleType" value="creditors" checked>
                            <span>Adjust against Creditors</span>
                        </label>
                        <label class="inline-flex items-center gap-2">
                            <input type="radio" name="purchaseReturnSettleType" value="cash">
                            <span>Refund - Cash</span>
                        </label>
                        <label class="inline-flex items-center gap-2">
                            <input type="radio" name="purchaseReturnSettleType" value="bank">
                            <span>Refund - Bank</span>
                        </label>
                    </div>
                </div>
                <div id="purchaseReturnItemsContainer" class="mt-4"></div>
                <div class="flex justify-end items-center gap-4 mt-4">
                    <div class="text-right">
                        <div class="text-sm text-gray-600">Return Total (₹):</div>
                        <div id="purchaseReturnTotal" class="font-bold text-xl">0.00</div>
                    </div>
                    <button type="submit" class="bg-blue-600 text-white font-semibold py-2 px-6 rounded-md hover:bg-blue-700">Record Purchase Return</button>
                </div>
            </form>
        </div>`;

    // Sales Returns history (compact)
    const salesReturnsSorted = (state.allSalesReturns || []).slice().sort((a,b) => (_toDate(b.returnDate) - _toDate(a.returnDate)));
    const salesReturnsRows = salesReturnsSorted.slice(0,10).map(r => {
        const dt = _toDate(r.returnDate);
        const party = r.orderShippingName || 'Customer';
        const amount = (r.totalAmount||0).toFixed(2);
        return `<div class="flex items-center justify-between p-3 border rounded-md text-sm">
            <div>
                <div class="font-mono">${r.creditNoteNumber || r.id}</div>
                <div class="text-gray-600">${party} • ${formatDate(dt)} • ₹${amount}</div>
            </div>
            <div class="flex items-center gap-2">
                <button class="edit-sales-return-btn text-xs bg-blue-600 text-white px-3 py-1 rounded-md" data-id="${r.id}">Edit</button>
            </div>
        </div>`;
    }).join('') || '<div class="text-gray-500 text-sm">No sales returns yet.</div>';

    const salesReturnsHistoryHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-2xl font-bold">Recent Sales Returns</h3>
            </div>
            <div id="salesReturnsHistory" class="space-y-2">${salesReturnsRows}</div>
        </div>`;

    // Purchase Returns history (compact)
    const purchaseReturnsSorted = (state.allPurchaseReturns || []).slice().sort((a,b) => (_toDate(b.returnDate) - _toDate(a.returnDate)));
    const purchaseReturnsRows = purchaseReturnsSorted.slice(0,10).map(r => {
        const dt = _toDate(r.returnDate);
        const party = r.supplierName || 'Supplier';
        const amount = (r.totalAmount||0).toFixed(2);
        return `<div class="flex items-center justify-between p-3 border rounded-md text-sm">
            <div>
                <div class="font-mono">${r.debitNoteNumber || r.id}</div>
                <div class="text-gray-600">${party} • ${formatDate(dt)} • ₹${amount}</div>
            </div>
            <div class="flex items-center gap-2">
                <button class="edit-purchase-return-btn text-xs bg-blue-600 text-white px-3 py-1 rounded-md" data-id="${r.id}">Edit</button>
            </div>
        </div>`;
    }).join('') || '<div class="text-gray-500 text-sm">No purchase returns yet.</div>';

    const purchaseReturnsHistoryHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-2xl font-bold">Recent Purchase Returns</h3>
            </div>
            <div id="purchaseReturnsHistory" class="space-y-2">${purchaseReturnsRows}</div>
        </div>`;

    container.innerHTML = salesReturnHTML + salesReturnsHistoryHTML + purchaseReturnHTML + purchaseReturnsHistoryHTML;

    // Attach dynamic behavior
    const orderSelect = document.getElementById('salesReturnOrderSelect');
    const orderSearch = document.getElementById('salesReturnOrderSearch');
    const salesItemsContainer = document.getElementById('salesReturnItemsContainer');

    function buildSalesReturnItems(order) {
        if (!order) { salesItemsContainer.innerHTML = ''; return; }
        const returnedMap = {};
        state.allSalesReturns.filter(r => r.orderId === order.id).forEach(r => {
            r.items.forEach(it => { returnedMap[it.id] = (returnedMap[it.id] || 0) + it.quantity; });
        });
        const html = `
            <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                <div class="col-span-6">Product</div>
                <div class="col-span-2 text-right">Max Qty</div>
                <div class="col-span-2">Return Qty</div>
                <div class="col-span-2 text-right">Amount (₹)</div>
            </div>
            ${order.items.map(item => {
                const maxQty = Math.max(0, item.quantity - (returnedMap[item.id] || 0));
                return `
                    <div class="grid grid-cols-12 gap-4 items-center mb-2">
                        <div class="col-span-6">${item.name}</div>
                        <div class="col-span-2 text-right">${maxQty}</div>
                        <div class="col-span-2"><input type="number" class="sales-return-qty w-full px-2 py-1 border rounded-md" min="0" max="${maxQty}" step="1" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}" data-gst="${item.gstPercentage || 0}" value="0"></div>
                        <div class="col-span-2 text-right text-sm text-gray-700">₹${(0).toFixed(2)}</div>
                    </div>`;
            }).join('')}
        `;
        salesItemsContainer.innerHTML = html;
    }

    orderSearch.addEventListener('input', () => {
        const q = orderSearch.value.trim().toLowerCase();
        if (!q) return;
        const found = state.allOrders.find(o => o.id.toLowerCase() === q || (o.invoiceNumber || '').toLowerCase() === q);
        if (found) {
            orderSelect.value = found.id;
            buildSalesReturnItems(found);
        }
    });
    orderSelect.addEventListener('change', () => {
        const order = state.allOrders.find(o => o.id === orderSelect.value);
        buildSalesReturnItems(order);
    });

    // Local Sale search to default the credit checkbox based on original sale
    const lsSearch = document.getElementById('salesReturnLocalSaleSearch');
    const lsInfo = document.getElementById('salesReturnLocalSaleInfo');
    if (lsSearch) {
        lsSearch.addEventListener('input', () => {
            const q = (lsSearch.value || '').trim().toLowerCase();
            if (!q) { if (lsInfo) lsInfo.textContent = 'None'; return; }
            const sale = (state.allLocalSales || []).find(s => (s.id || '').toLowerCase() === q || ((s.invoiceNumber || '').toLowerCase() === q));
            if (sale) {
                const dt = sale.saleDate?.seconds ? new Date(sale.saleDate.seconds * 1000) : sale.saleDate;
                if (lsInfo) lsInfo.innerHTML = `${sale.invoiceNumber || sale.id} — ${sale.customerName} (${formatDate(dt)}) ${sale.isCreditSale ? '<span class=\"ml-2 text-green-600\">Credit</span>' : '<span class=\"ml-2 text-gray-600\">Cash</span>'}`;
                const cb = document.getElementById('salesReturnIsCredit');
                if (cb) cb.checked = !!sale.isCreditSale;
            } else {
                if (lsInfo) lsInfo.textContent = 'None';
            }
        });
    }

    // Toggle refund mode visibility based on credit checkbox
    const srCreditCb = document.getElementById('salesReturnIsCredit');
    const srRefundRow = document.getElementById('salesReturnRefundModeRow');
    const syncSrRefundVisibility = () => {
        srRefundRow.classList.toggle('hidden', !!srCreditCb.checked);
    };
    srCreditCb.addEventListener('change', syncSrRefundVisibility);
    syncSrRefundVisibility();

    document.getElementById('salesReturnForm').addEventListener('input', (e) => {
        if (!e.target.classList.contains('sales-return-qty')) return;
        const row = e.target.closest('.grid');
        const price = parseFloat(e.target.dataset.price) || 0;
        const qty = Math.max(0, Math.min(parseInt(e.target.value || '0'), parseInt(e.target.max)));
        e.target.value = qty;
        const amount = price * qty;
        row.querySelector('.col-span-2.text-right.text-sm.text-gray-700').textContent = `₹${amount.toFixed(2)}`;
        // recompute total
        let total = 0;
        document.querySelectorAll('.sales-return-qty').forEach(inp => {
            const p = parseFloat(inp.dataset.price) || 0;
            const qv = parseInt(inp.value || '0') || 0;
            total += p * qv;
        });
        document.getElementById('salesReturnTotal').textContent = total.toFixed(2);
    });

    document.getElementById('salesReturnForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const order = state.allOrders.find(o => o.id === orderSelect.value);
        if (!order) { showMessage('Please select an order.'); return; }
        const items = [];
        let subtotal = 0;
        const gstBreakdown = { rates: {}, total: 0 };
        document.querySelectorAll('.sales-return-qty').forEach(inp => {
            const qty = parseInt(inp.value || '0');
            if (qty > 0) {
                const price = parseFloat(inp.dataset.price) || 0;
                const gst = parseInt(inp.dataset.gst) || 0;
                const name = inp.dataset.name;
                const id = inp.dataset.id;
                subtotal += price * qty;
                items.push({ id, name, price, gstPercentage: gst, quantity: qty });
                if (gst > 0) {
                    if (!gstBreakdown.rates[gst]) gstBreakdown.rates[gst] = 0;
                    gstBreakdown.rates[gst] += (price * qty) * (gst / 100);
                    gstBreakdown.total += (price * qty) * (gst / 100);
                }
            }
        });
        if (items.length === 0) { showMessage('No return quantities entered.'); return; }

        const totalAmount = subtotal + gstBreakdown.total;
        const editingSalesReturnId = (document.getElementById('editingSalesReturnId')?.value || '').trim();
        const existingReturn = editingSalesReturnId ? (state.allSalesReturns || []).find(r => r.id === editingSalesReturnId) : null;
        let creditNoteNumber;
        if (editingSalesReturnId) {
            creditNoteNumber = existingReturn?.creditNoteNumber || editingSalesReturnId;
        } else {
            const rawCounter = await getAndIncrementCounter('salesReturns');
            creditNoteNumber = formatInvoiceFromCounter(rawCounter, 'salesReturns');
        }
        const isCreditReturn = !!document.getElementById('salesReturnIsCredit')?.checked;
        const refundMode = isCreditReturn ? null : ((document.getElementById('salesReturnRefundMode')?.value) || 'cash');

        try {
            const batch = writeBatch(db);
            // Stock adjustments: creation vs edit
            if (editingSalesReturnId && existingReturn) {
                const origMap = new Map(); (existingReturn.items || []).forEach(it => { origMap.set(it.id, (origMap.get(it.id)||0) + (it.quantity||0)); });
                const newMap = new Map(); items.forEach(it => { newMap.set(it.id, (newMap.get(it.id)||0) + (it.quantity||0)); });
                const pids = new Set([...origMap.keys(), ...newMap.keys()]);
                for (const pid of pids) {
                    const delta = (newMap.get(pid)||0) - (origMap.get(pid)||0); // Sales return increases stock
                    if (delta !== 0) batch.update(doc(db, productsColPath, pid), { stock: increment(delta) });
                }
            } else {
                // increase stock for returned items (new record)
                items.forEach(it => {
                    const productRef = doc(db, productsColPath, it.id);
                    batch.update(productRef, { stock: increment(it.quantity) });
                });
            }

            const retRef = editingSalesReturnId && existingReturn ? doc(db, salesReturnsColPath, editingSalesReturnId) : doc(collection(db, salesReturnsColPath));
            const retDoc = {
                orderId: order.id,
                userId: order.userId,
                orderInvoiceNumber: order.invoiceNumber,
                orderShippingName: order.shippingInfo.fullName,
                creditNoteNumber,
                items,
                subtotal,
                gstBreakdown,
                totalAmount,
                ...(editingSalesReturnId ? { updatedAt: serverTimestamp() } : { returnDate: serverTimestamp() })
            };
            batch.set(retRef, retDoc, { merge: true });

            // Ledgers: ensure idempotent updates and cleanup of switched modes
            const debtRef = doc(db, debtorsLedgerColPath, (editingSalesReturnId && existingReturn) ? editingSalesReturnId : retRef.id);
            const cashRef = doc(db, cashLedgerColPath, (editingSalesReturnId && existingReturn) ? editingSalesReturnId : retRef.id);
            const bankRef = doc(db, bankLedgerColPath, (editingSalesReturnId && existingReturn) ? editingSalesReturnId : retRef.id);

            if (isCreditReturn) {
                batch.set(debtRef, {
                    partyName: order.shippingInfo.fullName || 'Customer',
                    date: serverTimestamp(),
                    refType: 'Sales Return',
                    refId: (editingSalesReturnId && existingReturn) ? editingSalesReturnId : retRef.id,
                    invoiceNumber: creditNoteNumber,
                    debit: 0,
                    credit: totalAmount,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                // Mark refund ledgers deleted if switching from refund
                batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
            } else {
                // Clear debtors entry if present
                batch.set(debtRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                const payload = {
                    date: serverTimestamp(),
                    refType: 'Sales Return (Refund)',
                    refId: (editingSalesReturnId && existingReturn) ? editingSalesReturnId : retRef.id,
                    invoiceNumber: creditNoteNumber,
                    notes: `To ${order.shippingInfo.fullName || 'Customer'}`,
                    debit: 0,
                    credit: totalAmount,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                };
                if (refundMode === 'bank') {
                    batch.set(bankRef, payload, { merge: true });
                    batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                } else {
                    batch.set(cashRef, payload, { merge: true });
                    batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                }
            }
            await batch.commit();
            showMessage(editingSalesReturnId ? 'Sales return updated.' : 'Sales return recorded (credit note created).');
            // reset form
            orderSelect.value = '';
            salesItemsContainer.innerHTML = '';
            document.getElementById('salesReturnTotal').textContent = '0.00';
            const eId = document.getElementById('editingSalesReturnId'); if (eId) eId.value = '';
        } catch (error) {
            console.error('Error recording sales return:', error);
            showMessage('Failed to record sales return.');
        }
    });

    // Helper to populate Sales Return form from an existing return doc
    function populateSalesReturnFormFromRecord(ret) {
        if (!ret) return;
        const idEl = document.getElementById('editingSalesReturnId'); if (idEl) idEl.value = ret.id;
        // Select the order and rebuild items
        const order = (state.allOrders || []).find(o => o.id === ret.orderId);
        const orderSelectEl = document.getElementById('salesReturnOrderSelect');
        if (order && orderSelectEl) {
            orderSelectEl.value = order.id;
            // Build rows like when selecting an order
            const salesItemsContainer = document.getElementById('salesReturnItemsContainer');
            (function build() {
                const returnedMap = {};
                state.allSalesReturns.filter(r => r.orderId === order.id).forEach(r => {
                    (r.items||[]).forEach(it => { returnedMap[it.id] = (returnedMap[it.id] || 0) + it.quantity; });
                });
                const html = `
                    <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                        <div class="col-span-6">Product</div>
                        <div class="col-span-2 text-right">Max Qty</div>
                        <div class="col-span-2">Return Qty</div>
                        <div class="col-span-2 text-right">Amount (₹)</div>
                    </div>
                    ${order.items.map(item => {
                        const maxQty = Math.max(0, item.quantity - (returnedMap[item.id] || 0));
                        return `
                            <div class="grid grid-cols-12 gap-4 items-center mb-2">
                                <div class="col-span-6">${item.name}</div>
                                <div class="col-span-2 text-right">${maxQty}</div>
                                <div class="col-span-2"><input type="number" class="sales-return-qty w-full px-2 py-1 border rounded-md" min="0" max="${maxQty}" step="1" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}" data-gst="${item.gstPercentage || 0}" value="0"></div>
                                <div class="col-span-2 text-right text-sm text-gray-700">₹${(0).toFixed(2)}</div>
                            </div>`;
                    }).join('')}
                `;
                salesItemsContainer.innerHTML = html;
            })();
            // Fill quantities from return
            (ret.items || []).forEach(it => {
                const inp = document.querySelector(`.sales-return-qty[data-id="${it.id}"]`);
                if (inp) inp.value = it.quantity;
            });
            // Trigger recompute total display
            let total = 0; (ret.items || []).forEach(it => { total += (it.price || 0) * (it.quantity || 0); });
            const totalEl = document.getElementById('salesReturnTotal'); if (totalEl) totalEl.textContent = (total + (ret.gstBreakdown?.total || 0)).toFixed(2);
        }
        // Determine mode from ledgers
        const debt = (state.allDebtorsLedger || []).find(e => e.id === ret.id && !e.isDeleted);
        const cash = (state.allCashLedger || []).find(e => e.id === ret.id && !e.isDeleted);
        const bank = (state.allBankLedger || []).find(e => e.id === ret.id && !e.isDeleted);
        const cb = document.getElementById('salesReturnIsCredit');
        const modeRow = document.getElementById('salesReturnRefundModeRow');
        if (debt) { cb.checked = true; modeRow.classList.add('hidden'); }
        else { cb.checked = false; modeRow.classList.remove('hidden'); document.getElementById('salesReturnRefundMode').value = bank ? 'bank' : 'cash'; }
        document.getElementById('salesReturnForm').scrollIntoView({ behavior: 'smooth' });
    }

    document.querySelectorAll('.edit-sales-return-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            const id = btn.dataset.id;
            const ret = (state.allSalesReturns || []).find(r => r.id === id);
            populateSalesReturnFormFromRecord(ret);
        });
    });

    // Purchase return
    const purchaseSelect = document.getElementById('purchaseReturnSelect');
    const purchaseSearch = document.getElementById('purchaseReturnSearch');
    const purchaseItemsContainer = document.getElementById('purchaseReturnItemsContainer');

    function buildPurchaseReturnItems(purchase) {
        if (!purchase) { purchaseItemsContainer.innerHTML = ''; return; }
        const returnedMap = {};
        state.allPurchaseReturns.filter(r => r.purchaseId === purchase.id).forEach(r => {
            r.items.forEach(it => { returnedMap[it.productId] = (returnedMap[it.productId] || 0) + it.quantity; });
        });
        const html = `
            <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                <div class="col-span-6">Product</div>
                <div class="col-span-2 text-right">Max Qty</div>
                <div class="col-span-2">Return Qty</div>
                <div class="col-span-2 text-right">Amount (₹)</div>
            </div>
            ${purchase.items.map(item => {
                const maxQty = Math.max(0, item.quantity - (returnedMap[item.productId] || 0));
                return `
                    <div class="grid grid-cols-12 gap-4 items-center mb-2">
                        <div class="col-span-6">${item.productName}</div>
                        <div class="col-span-2 text-right">${maxQty}</div>
                        <div class="col-span-2"><input type="number" class="purchase-return-qty w-full px-2 py-1 border rounded-md" min="0" max="${maxQty}" step="1" data-id="${item.productId}" data-name="${item.productName}" data-price="${item.purchasePrice}" value="0"></div>
                        <div class="col-span-2 text-right text-sm text-gray-700">₹${(0).toFixed(2)}</div>
                    </div>`;
            }).join('')}
        `;
        purchaseItemsContainer.innerHTML = html;
    }

    purchaseSearch.addEventListener('input', () => {
        const q = purchaseSearch.value.trim().toLowerCase();
        if (!q) return;
        const found = state.allPurchases.find(p => (!p.isDeleted) && (p.id.toLowerCase() === q || (p.invoiceNumber || '').toLowerCase() === q));
        if (found) {
            purchaseSelect.value = found.id;
            buildPurchaseReturnItems(found);
        }
    });
    purchaseSelect.addEventListener('change', () => {
        const purchase = state.allPurchases.find(p => p.id === purchaseSelect.value);
        buildPurchaseReturnItems(purchase);
    });

    document.getElementById('purchaseReturnForm').addEventListener('input', (e) => {
        if (!e.target.classList.contains('purchase-return-qty')) return;
        const row = e.target.closest('.grid');
        const price = parseFloat(e.target.dataset.price) || 0;
        const qty = Math.max(0, Math.min(parseInt(e.target.value || '0'), parseInt(e.target.max)));
        e.target.value = qty;
        const amount = price * qty;
        row.querySelector('.col-span-2.text-right.text-sm.text-gray-700').textContent = `₹${amount.toFixed(2)}`;
        // recompute total
        let total = 0;
        document.querySelectorAll('.purchase-return-qty').forEach(inp => {
            const p = parseFloat(inp.dataset.price) || 0;
            const qv = parseInt(inp.value || '0') || 0;
            total += p * qv;
        });
        document.getElementById('purchaseReturnTotal').textContent = total.toFixed(2);
    });

    document.getElementById('purchaseReturnForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const purchase = state.allPurchases.find(p => p.id === purchaseSelect.value);
        if (!purchase) { showMessage('Please select a purchase.'); return; }
        const items = [];
        let totalAmount = 0;
        document.querySelectorAll('.purchase-return-qty').forEach(inp => {
            const qty = parseInt(inp.value || '0');
            if (qty > 0) {
                const price = parseFloat(inp.dataset.price) || 0;
                const name = inp.dataset.name;
                const id = inp.dataset.id;
                totalAmount += price * qty;
                items.push({ productId: id, productName: name, purchasePrice: price, quantity: qty });
            }
        });
        if (items.length === 0) { showMessage('No return quantities entered.'); return; }

        const editingPurchaseReturnId = (document.getElementById('editingPurchaseReturnId')?.value || '').trim();
        const existingPR = editingPurchaseReturnId ? (state.allPurchaseReturns || []).find(r => r.id === editingPurchaseReturnId) : null;
        let debitNoteNumber;
        if (editingPurchaseReturnId) {
            debitNoteNumber = existingPR?.debitNoteNumber || editingPurchaseReturnId;
        } else {
            const rawCounter = await getAndIncrementCounter('purchaseReturns');
            debitNoteNumber = formatInvoiceFromCounter(rawCounter, 'purchaseReturns');
        }
        const settleType = (document.querySelector('input[name="purchaseReturnSettleType"]:checked')?.value) || 'creditors';

        try {
            const batch = writeBatch(db);
            // Stock adjustments: creation vs edit (purchase return reduces stock)
            if (editingPurchaseReturnId && existingPR) {
                const origMap = new Map(); (existingPR.items || []).forEach(it => { origMap.set(it.productId, (origMap.get(it.productId)||0) + (it.quantity||0)); });
                const newMap = new Map(); items.forEach(it => { newMap.set(it.productId, (newMap.get(it.productId)||0) + (it.quantity||0)); });
                const pids = new Set([...origMap.keys(), ...newMap.keys()]);
                for (const pid of pids) {
                    const delta = (origMap.get(pid)||0) - (newMap.get(pid)||0); // purchase return originally -qty, so adjust by (orig - new)
                    if (delta !== 0) batch.update(doc(db, productsColPath, pid), { stock: increment(delta) });
                }
            } else {
                items.forEach(it => {
                    const productRef = doc(db, productsColPath, it.productId);
                    batch.update(productRef, { stock: increment(-it.quantity) });
                });
            }

            const retRef = editingPurchaseReturnId && existingPR ? doc(db, purchaseReturnsColPath, editingPurchaseReturnId) : doc(collection(db, purchaseReturnsColPath));
            const retDoc = {
                purchaseId: purchase.id,
                supplierName: purchase.supplierName,
                debitNoteNumber,
                items,
                totalAmount,
                ...(editingPurchaseReturnId ? { updatedAt: serverTimestamp() } : { returnDate: serverTimestamp() }),
            };
            batch.set(retRef, retDoc, { merge: true });

            // Ledgers: creditors (debit) or cash/bank (debit) depending on settleType; cleanup switched docs
            const credRef = doc(db, creditorsLedgerColPath, (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id);
            const cashRef = doc(db, cashLedgerColPath, (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id);
            const bankRef = doc(db, bankLedgerColPath, (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id);

            if (settleType === 'creditors') {
                batch.set(credRef, {
                    partyName: purchase.supplierName || 'Supplier',
                    date: serverTimestamp(),
                    refType: 'Purchase Return',
                    refId: (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id,
                    invoiceNumber: debitNoteNumber,
                    debit: totalAmount,
                    credit: 0,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
                batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
            } else if (settleType === 'cash') {
                batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(cashRef, {
                    date: serverTimestamp(),
                    refType: 'Purchase Return (Refund)',
                    refId: (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id,
                    invoiceNumber: debitNoteNumber,
                    notes: `From ${purchase.supplierName || 'Supplier'}`,
                    debit: totalAmount,
                    credit: 0,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            } else if (settleType === 'bank') {
                batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(bankRef, {
                    date: serverTimestamp(),
                    refType: 'Purchase Return (Refund)',
                    refId: (editingPurchaseReturnId && existingPR) ? editingPurchaseReturnId : retRef.id,
                    invoiceNumber: debitNoteNumber,
                    notes: `From ${purchase.supplierName || 'Supplier'}`,
                    debit: totalAmount,
                    credit: 0,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            await batch.commit();
            showMessage(editingPurchaseReturnId ? 'Purchase return updated.' : 'Purchase return recorded (debit note created).');
            // reset form
            purchaseSelect.value = '';
            purchaseItemsContainer.innerHTML = '';
            document.getElementById('purchaseReturnTotal').textContent = '0.00';
            const eId = document.getElementById('editingPurchaseReturnId'); if (eId) eId.value = '';
        } catch (error) {
            console.error('Error recording purchase return:', error);
            showMessage('Failed to record purchase return.');
        }
    });

    // Helper to populate Purchase Return form from an existing return doc
    function populatePurchaseReturnFormFromRecord(ret) {
        if (!ret) return;
        const idEl = document.getElementById('editingPurchaseReturnId'); if (idEl) idEl.value = ret.id;
        // Select the purchase and rebuild items
        const purchase = (state.allPurchases || []).find(p => p.id === ret.purchaseId);
        const purchaseSelectEl = document.getElementById('purchaseReturnSelect');
        const containerEl = document.getElementById('purchaseReturnItemsContainer');
        if (purchase && purchaseSelectEl) {
            purchaseSelectEl.value = purchase.id;
            (function build() {
                const returnedMap = {};
                state.allPurchaseReturns.filter(r => r.purchaseId === purchase.id).forEach(r => {
                    (r.items||[]).forEach(it => { returnedMap[it.productId] = (returnedMap[it.productId] || 0) + it.quantity; });
                });
                const html = `
                    <div class="grid grid-cols-12 gap-4 text-xs font-bold text-gray-500 mb-2 px-2">
                        <div class="col-span-6">Product</div>
                        <div class="col-span-2 text-right">Max Qty</div>
                        <div class="col-span-2">Return Qty</div>
                        <div class="col-span-2 text-right">Amount (₹)</div>
                    </div>
                    ${purchase.items.map(item => {
                        const maxQty = Math.max(0, item.quantity - (returnedMap[item.productId] || 0));
                        return `
                            <div class="grid grid-cols-12 gap-4 items-center mb-2">
                                <div class="col-span-6">${item.productName}</div>
                                <div class="col-span-2 text-right">${maxQty}</div>
                                <div class="col-span-2"><input type="number" class="purchase-return-qty w-full px-2 py-1 border rounded-md" min="0" max="${maxQty}" step="1" data-id="${item.productId}" data-name="${item.productName}" data-price="${item.purchasePrice}" value="0"></div>
                                <div class="col-span-2 text-right text-sm text-gray-700">₹${(0).toFixed(2)}</div>
                            </div>`;
                    }).join('')}
                `;
                containerEl.innerHTML = html;
            })();
            // Fill quantities
            (ret.items || []).forEach(it => {
                const inp = document.querySelector(`.purchase-return-qty[data-id="${it.productId}"]`);
                if (inp) inp.value = it.quantity;
            });
            // Set settlement type from ledgers
            const cred = (state.allCreditorsLedger || []).find(e => e.id === ret.id && !e.isDeleted);
            const cash = (state.allCashLedger || []).find(e => e.id === ret.id && !e.isDeleted);
            const bank = (state.allBankLedger || []).find(e => e.id === ret.id && !e.isDeleted);
            const val = cred ? 'creditors' : (bank ? 'bank' : 'cash');
            const radio = document.querySelector(`input[name="purchaseReturnSettleType"][value="${val}"]`);
            if (radio) radio.checked = true;
            document.getElementById('purchaseReturnForm').scrollIntoView({ behavior: 'smooth' });
        }
    }

    document.querySelectorAll('.edit-purchase-return-btn').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            const id = btn.dataset.id;
            const ret = (state.allPurchaseReturns || []).find(r => r.id === id);
            populatePurchaseReturnFormFromRecord(ret);
        });
    });
}

document.body.addEventListener('click', async e => {
    const navBtn = e.target.closest('.nav-btn');
    if (navBtn) {
        e.preventDefault();
        const targetPage = navBtn.dataset.page;
        // Capture a lightweight return route before navigating to any invoice-like page
        if (targetPage === 'purchase_invoice' || targetPage === 'invoice' || targetPage === 'local_sale_invoice') {
            state.previousRoute = { page: state.currentPage, adminTab: state.adminCurrentTab };
        }
        navigateTo(targetPage, navBtn.dataset.id, navBtn.dataset.category, navBtn.dataset.group);
    }
    
    const addToCartBtn = e.target.closest('.add-to-cart-btn');
    if(addToCartBtn) { addToCart(addToCartBtn.dataset.id, 1); }
    
    const addToCartBtnDetail = e.target.closest('.add-to-cart-btn-detail');
    if(addToCartBtnDetail) {
        const quantity = document.getElementById('quantitySelector') ? parseInt(document.getElementById('quantitySelector').value) : 1;
       addToCart(addToCartBtnDetail.dataset.id, quantity);
    }

    const removeFromCartBtn = e.target.closest('.remove-from-cart-btn');
    if (removeFromCartBtn) { updateCart(removeFromCartBtn.dataset.id, 0); }

    const logoutBtn = e.target.closest('#logoutBtn');
    if (logoutBtn) { 
        e.preventDefault(); 
        await signOut(auth);
        navigateTo('home');
    }

    const accordionHeader = e.target.closest('.accordion-header');
    if (accordionHeader) {
        const content = accordionHeader.nextElementSibling;
        const icon = accordionHeader.querySelector('i');
        if(content.style.maxHeight) {
            content.style.maxHeight = null;
            if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
            content.style.maxHeight = content.scrollHeight + 'px';
            if (icon) icon.style.transform = 'rotate(180deg)';
        }
    }

    const adminTabBtn = e.target.closest('.admin-tab-btn');
    if (adminTabBtn) {
        e.preventDefault();
        const tab = adminTabBtn.dataset.tab;
        if (tab !== state.adminCurrentTab) {
            state.adminCurrentTab = tab;
            renderAdminPage(); 
        }
    }

    const googleHeaderBtn = e.target.closest('#googleSignInHeaderBtn');
    if (googleHeaderBtn) {
        e.preventDefault();
        try {
            await handleGoogleSignIn();
        } catch (err) {
            showMessage(`Google sign-in failed: ${err?.message || err}`);
        }
    }

    // Edit Product
    const editProductBtn = e.target.closest('.edit-product-btn');
    if (editProductBtn) {
        const productId = editProductBtn.dataset.id;
        const product = state.products.find(p => p.id === productId);
        if (product) {
            document.getElementById('productId').value = product.id;
            document.getElementById('productName').value = product.name;
            document.getElementById('productDescription').value = product.description;
            document.getElementById('salePrice').value = product.salePrice || 0;
             if(document.getElementById('gstPercentage')) {
                  document.getElementById('gstPercentage').value = product.gstPercentage || 0;
             }
            document.getElementById('productCategory').value = product.category;
            document.getElementById('productGroup').value = product.productGroup || '';
            document.getElementById('productImage').value = product.image;

            document.getElementById('avgPurchasePriceDisplay').textContent = product.purchasePrice ? `₹${product.purchasePrice.toFixed(2)}` : 'N/A';
            document.getElementById('lastPurchasePriceDisplay').textContent = product.lastPurchasePrice ? `₹${product.lastPurchasePrice.toFixed(2)}` : 'N/A';
            
            const submitBtn = document.getElementById('productFormSubmitBtn');
            document.getElementById('productFormTitle').textContent = 'Edit Product';
            submitBtn.textContent = 'Update Product';
            submitBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            submitBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
            document.getElementById('productFormCancelBtn').classList.remove('hidden');
            document.getElementById('productFormTitle').scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    // Delete Product
    const deleteProductBtn = e.target.closest('.delete-product-btn');
    if (deleteProductBtn) {
        try {
            await deleteDoc(doc(db, productsColPath, deleteProductBtn.dataset.id));
            showMessage('Product deleted.');
        } catch (error) {
            showMessage('Error deleting product.');
            console.error("Error deleting product:", error);
        }
    }

    // Edit Slide
    const editSlideBtn = e.target.closest('.edit-slide-btn');
    if (editSlideBtn) {
        const slideId = editSlideBtn.dataset.id;
        const slide = state.heroSlides.find(s => s.id === slideId);
        if (slide) {
            document.getElementById('slideId').value = slide.id;
            document.getElementById('slideHeadline').value = slide.headline;
            document.getElementById('slideSubtitle').value = slide.subtitle;
            document.getElementById('slideImageUrl').value = slide.imageUrl;
            document.getElementById('slideButtonText').value = slide.buttonText;
            document.getElementById('slideButtonLink').value = slide.buttonLink;
            
            const submitBtn = document.getElementById('slideFormSubmitBtn');
            document.getElementById('slideFormTitle').textContent = 'Edit Slide';
            submitBtn.textContent = 'Update Slide';
            submitBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
            submitBtn.classList.add('bg-green-600', 'hover:bg-green-700');
            document.getElementById('slideFormCancelBtn').classList.remove('hidden');
            document.getElementById('slideFormTitle').scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    // Delete Slide
    const deleteSlideBtn = e.target.closest('.delete-slide-btn');
    if (deleteSlideBtn) {
        try {
            await deleteDoc(doc(db, slidesColPath, deleteSlideBtn.dataset.id));
            showMessage('Slide deleted.');
        } catch (error) {
            showMessage('Error deleting slide.');
            console.error("Error deleting slide:", error);
        }
    }

    // Delete Gallery Image
    const deleteGalleryImageBtn = e.target.closest('.delete-gallery-image-btn');
    if (deleteGalleryImageBtn) {
        try {
            await deleteDoc(doc(db, galleryImagesColPath, deleteGalleryImageBtn.dataset.id));
            showMessage('Image deleted from gallery.');
        } catch (error) {
            showMessage('Error deleting image.');
            console.error("Error deleting image:", error);
        }
    }

    // Approve Testimonial
    const approveTestimonialBtn = e.target.closest('.approve-testimonial-btn');
    if (approveTestimonialBtn) {
        try {
             const testimonialRef = doc(db, testimonialsColPath, approveTestimonialBtn.dataset.id);
            await updateDoc(testimonialRef, { approved: true });
            showMessage('Testimonial approved.');
        } catch (error) {
            showMessage('Error approving testimonial.');
            console.error("Error approving testimonial:", error);
        }
    }

    // Delete Testimonial
    const deleteTestimonialBtn = e.target.closest('.delete-testimonial-btn');
    if (deleteTestimonialBtn) {
        try {
            await deleteDoc(doc(db, testimonialsColPath, deleteTestimonialBtn.dataset.id));
            showMessage('Testimonial deleted.');
        } catch (error) {
            showMessage('Error deleting testimonial.');
            console.error("Error deleting testimonial:", error);
        }
    }
    
    // **NEW:** Soft Delete Purchase
    const softDeletePurchaseBtn = e.target.closest('.soft-delete-purchase-btn');
    if (softDeletePurchaseBtn) {
        const purchaseId = softDeletePurchaseBtn.dataset.id;
        if (confirm('Are you sure you want to delete this purchase entry? This action cannot be undone and will affect inventory records!')) {
            await softDeletePurchase(purchaseId);
        }
    }
});

document.body.addEventListener('change', e => {
    const quantitySelector = e.target.closest('.cart-quantity-selector');
    if(quantitySelector) {
        const newQuantity = parseInt(quantitySelector.value);
        if (newQuantity > 0) {
           updateCart(quantitySelector.dataset.id, newQuantity);
        }
    }

    const quantityStepper = e.target.closest('.cart-quantity-stepper');
    if (quantityStepper) {
        const input = quantityStepper.parentElement.querySelector('input');
        const currentQuantity = parseInt(input.value);
        const change = parseInt(quantityStepper.dataset.change);
        const newQuantity = currentQuantity + change;
         if (newQuantity > 0) {
           updateCart(input.dataset.id, newQuantity);
        }
    }
});

document.body.addEventListener('submit', async e => {
    if (e.target.id === 'checkoutForm') {
        e.preventDefault();
        const cartProductIds = Object.keys(state.cart.items);
        if (cartProductIds.length === 0) return;

        const items = state.products
            .filter(p => cartProductIds.includes(p.id))
            .map(product => ({
                id: product.id,
                name: product.name,
                price: product.salePrice,
                gstPercentage: product.gstPercentage || 0,
                image: product.image,
                quantity: state.cart.items[product.id].quantity,
                costAtOrder: typeof product.purchasePrice === 'number' ? product.purchasePrice : 0
            }));

        // Check stock before processing
        for (const item of items) {
            const product = state.products.find(p => p.id === item.id);
            if (!product || (product.stock || 0) < item.quantity) {
                showMessage(`Sorry, ${item.name} is out of stock or not available in the requested quantity.`);
                return;
            }
        }

        const shipping = 50.00;
        // Compute GST consistently (supports inclusive/exclusive pricing)
        let gstComputed = { rates: {}, total: 0, subtotalEx: 0, subtotalInc: 0 };
        if (state.siteSettings.isGstEnabled) {
            gstComputed = computeGstForItems(items, !!state.siteSettings.pricesIncludeGst);
        } else {
            const sum = items.reduce((s, it) => s + (it.price * it.quantity), 0);
            gstComputed = { rates: {}, total: 0, subtotalEx: sum, subtotalInc: sum };
        }
        const totalAmount = gstComputed.subtotalInc + shipping;

        let gstInfo = { requested: false };
        if (state.siteSettings.isGstEnabled) {
            const requestGstInvoice = document.getElementById('requestGstInvoice').checked;
            if (requestGstInvoice) {
                const raw = document.getElementById('gstNumber').value || '';
                const gstNum = raw.trim().toUpperCase();
                if (!GSTIN_REGEX.test(gstNum)) {
                    showMessage('Please enter a valid GSTIN (e.g., 29ABCDE1234F1Z5).');
                    return;
                }
                gstInfo = { requested: true, number: gstNum };
            }
        }

        // Validate mobile number (10 digits)
        const phoneRaw = document.getElementById('phone')?.value || '';
        const phone = (phoneRaw || '').replace(/\D/g, '');
        if (phone.length !== 10) {
            showMessage('Please enter a valid 10-digit mobile number.');
            return;
        }

        const shippingInfo = {
            fullName: document.getElementById('fullName').value,
            phone,
            address: document.getElementById('address').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zip: document.getElementById('zip').value,
        };
        
        const rawSalesCounter = await getAndIncrementCounter('sales');
        const invoiceNumber = formatInvoiceFromCounter(rawSalesCounter, 'sales');

        const orderData = {
            userId: state.currentUser.uid,
            customerEmail: state.currentUser.email || '',
            invoiceNumber,
            items,
            subtotal: state.siteSettings.pricesIncludeGst ? gstComputed.subtotalInc : gstComputed.subtotalEx,
            totalAmount,
            shippingInfo,
            gstBreakdown: { rates: gstComputed.rates, total: gstComputed.total },
            gstInfo, // For the customer's GSTIN if provided
            status: 'Pending',
            orderDate: serverTimestamp()
        };

        try {
            // Optionally save shipping info as default profile
            try {
                const saveDefault = document.getElementById('saveAsDefaultAddress')?.checked;
                if (saveDefault) {
                    await setDoc(userProfileDocRef(state.currentUser.uid), {
                        fullName: shippingInfo.fullName,
                        phone: shippingInfo.phone,
                        address: shippingInfo.address,
                        city: shippingInfo.city,
                        state: shippingInfo.state,
                        zip: shippingInfo.zip,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                }
            } catch (e) {
                console.warn('Saving default shipping profile failed (non-blocking):', e?.message || e);
            }

            // Create a public order id first (used as receipt in Razorpay order creation)
            const publicOrderRef = doc(collection(db, ordersColPath));
            const publicOrderId = publicOrderRef.id;

            // Prepare payload for server-side Razorpay order creation (amount in paise)
            const amountPaise = Math.round(totalAmount * 100);
            try {
                const createOrderFn = httpsCallable(functionsSvc, 'createRazorpayOrder');
                const createResp = await createOrderFn({ amountPaise, currency: 'INR', receipt: publicOrderId, notes: { userId: state.currentUser.uid || null } });
                const createData = createResp.data || {};
                if (!createData || !createData.orderId) {
                    throw new Error('Failed to create payment order');
                }

                // Ensure Razorpay checkout script is present
                async function ensureRzp() {
                    if (window.Razorpay) return;
                    await new Promise((resolve, reject) => {
                        const s = document.createElement('script');
                        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
                        s.onload = resolve;
                        s.onerror = () => reject(new Error('Failed to load Razorpay script'));
                        document.head.appendChild(s);
                    });
                }
                await ensureRzp();

                const options = {
                    key: createData.keyId || '',
                    amount: createData.amount || amountPaise,
                    currency: createData.currency || 'INR',
                    name: (state.siteSettings && state.siteSettings.shopName) || 'Tiaras',
                    description: `Order ${publicOrderId}`,
                    order_id: createData.orderId,
                    handler: async function (response) {
                        try {
                            // On successful payment, call server to verify signature and persist the order atomically
                            const verifyFn = httpsCallable(functionsSvc, 'verifyRazorpayPayment');
                            const verifyPayload = {
                                publicOrderId,
                                orderData: Object.assign({}, orderData, { appId }),
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature
                            };
                            const vresp = await verifyFn(verifyPayload);
                            const vdata = vresp.data || {};
                            if (vdata && vdata.ok) {
                                navigateTo('order_success', publicOrderId);
                            } else {
                                console.error('Payment verification failed', vdata);
                                showMessage('Payment succeeded but verification failed. Please contact support.');
                            }
                        } catch (err) {
                            console.error('verifyRazorpayPayment error', err);
                            showMessage('Payment succeeded but server verification failed. Please contact support.');
                        }
                    },
                    prefill: {
                        name: shippingInfo.fullName || '',
                        email: state.currentUser?.email || '',
                        contact: shippingInfo.phone || ''
                    },
                    theme: { color: '#000000' }
                };

                const rzp = new window.Razorpay(options);
                rzp.open();
            } catch (err) {
                console.error('Payment initialization failed', err);
                showMessage('Unable to initialize payment. Please try again or use another payment method.');
            }
        } catch (error) {
            console.error("Error placing order:", error);
            showMessage("There was an issue placing your order. Please try again.");
        }
    }

    if (e.target.id === 'testimonialForm') {
        e.preventDefault();
        const name = document.getElementById('testimonialName').value;
        const message = document.getElementById('testimonialMessage').value;
        const ratingInput = document.querySelector('input[name="rating"]:checked');

        if (!ratingInput) {
            showMessage("Please select a rating.");
            return;
        }
        const rating = parseInt(ratingInput.value);

        const testimonialData = {
            name,
            message,
            rating,
            createdAt: serverTimestamp(),
            approved: false
        };

        try {
            await addDoc(collection(db, testimonialsColPath), testimonialData);
            showMessage("Thank you! Your review has been submitted for approval.");
            e.target.reset();
        } catch (error) {
            console.error("Error submitting testimonial:", error);
            showMessage("Sorry, there was an error submitting your review.");
        }
    }
    
    if (e.target.id === 'accountForm') {
        e.preventDefault();
        if (!state.currentUser || state.currentUser.isAnonymous) { navigateTo('auth'); return; }
        const payload = {
            fullName: document.getElementById('accFullName').value.trim(),
            address: document.getElementById('accAddress').value.trim(),
            city: document.getElementById('accCity').value.trim(),
            state: document.getElementById('accState').value.trim(),
            zip: document.getElementById('accZip').value.trim(),
            phone: document.getElementById('accPhone').value.trim(),
            updatedAt: serverTimestamp(),
        };
        try {
            await setDoc(userProfileDocRef(state.currentUser.uid), payload, { merge: true });
            showMessage('Profile saved.');
        } catch (err) {
            console.error('Saving profile failed:', err);
            showMessage('Failed to save profile.');
        }
    }
    
    if (e.target.id === 'purchaseForm') {
        e.preventDefault();
        const editingId = (document.getElementById('editingPurchaseId')?.value || '').trim();
        const supplierName = document.getElementById('supplierName').value;
        const purchaseDate = document.getElementById('purchaseDate').value;
    // Toggle ON (checked) = Inclusive; OFF = Exclusive
    const pricesIncludeGst = !!(document.getElementById('purchasePricesIncludeGst')?.checked || false);
        const items = [];
        let subtotalEx = 0, gstTotal = 0, subtotalInc = 0;

        // Find supplier object (if available) to determine GST registration status.
        const supplierObj = (state.allSuppliers || []).find(s => ((s.name || '').trim().toLowerCase() === (supplierName || '').trim().toLowerCase()));
        const supplierRegistered = !!(supplierObj && (supplierObj.gstin || '').trim());

        // If an existing supplier is selected, require that it has address and stateCode recorded
        if (supplierObj) {
            if (!supplierObj.address || !supplierObj.stateCode) {
                // Set pending retry so that after the user saves the supplier details we
                // automatically retry submitting the purchase form.
                pendingPurchaseRetryFn = () => {
                    try {
                        // Small delay to allow state updates to propagate
                        setTimeout(() => {
                            const form = document.getElementById('purchaseForm');
                            if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                            pendingPurchaseRetryFn = null;
                        }, 150);
                    } catch (_) { pendingPurchaseRetryFn = null; }
                };
                // Open the edit modal prefilled so user can update missing fields
                try {
                    showPartyEditModal({ type: 'supplier', name: supplierObj.name || '', gstin: supplierObj.gstin || '', address: supplierObj.address || '', docId: supplierObj.id, isGstRegistered: (typeof supplierObj.isGstRegistered !== 'undefined') ? !!supplierObj.isGstRegistered : undefined, stateCode: supplierObj.stateCode || '', pin: supplierObj.pin || '', mobile: supplierObj.mobile || '' });
                } catch (_) {
                    // Fallback: show message
                    pendingPurchaseRetryFn = null;
                    showMessage('Selected supplier is missing address or state. Please update supplier details (address and state) before recording a purchase.');
                }
                return;
            }
        }

        document.querySelectorAll('.purchase-item-row').forEach(row => {
            const productId = row.querySelector('.purchase-product-select').value;
            const productName = row.querySelector('.purchase-product-select').options[row.querySelector('.purchase-product-select').selectedIndex].text;
            const purchasePrice = parseFloat(row.querySelector('.purchase-price').value) || 0;
            const quantity = parseInt(row.querySelector('.purchase-quantity').value) || 0;
            const gstPercentage = getRowGstPercentage(row);

            if (productId && purchasePrice > 0 && quantity > 0) {
                // Store both 'price' (legacy) and 'purchasePrice' (used by costing logic)
                items.push({ productId, productName, purchasePrice: purchasePrice, price: purchasePrice, quantity, gstPercentage });
            }
        });

        if (items.length === 0) {
            showMessage("Please add at least one item to the purchase.");
            return;
        }

        // Determine merchant & supplier state codes for GST splitting
        const merchantStateCode = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '');
    // Prefer explicitly stored supplier.stateCode (from inline add) else derive from GSTIN
    const supplierStateCode = (supplierObj?.stateCode) || getStateCodeFromGstin(supplierObj?.gstin || '');

        // Compute GST for items when supplier is registered; otherwise treat GST as part of cost
        let gstComputed = { total: 0, subtotalEx: 0, subtotalInc: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, rates: {}, intraState: true };
        if (supplierRegistered) {
            gstComputed = computeGstForItems(items.map(it => ({ price: it.price, quantity: it.quantity, gstPercentage: it.gstPercentage })), pricesIncludeGst, merchantStateCode, supplierStateCode);
        } else {
            // No separate GST recorded; subtotal is simple sum of line amounts
            let sEx = 0, sInc = 0;
            items.forEach(it => {
                const line = it.price * it.quantity;
                sEx += line; sInc += line;
            });
            gstComputed = { total: 0, subtotalEx: sEx, subtotalInc: sInc, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, rates: {}, intraState: true };
        }
        // Preserve original invoice number when editing; allow reuse of deleted invoice if selected; else generate
        let invoiceNumber = undefined;
        const deletedSelEl = document.getElementById('deletedInvoiceSelect');
        if (editingId) {
            const original = state.allPurchases.find(p => p.id === editingId);
            invoiceNumber = original?.invoiceNumber || '';
        } else {
            const reusedHiddenEl = document.getElementById('purchaseReusedInvoice');
            const reusedVal = (reusedHiddenEl?.value || '').trim();
            if (reusedVal) {
                invoiceNumber = reusedVal;
            } else if (deletedSelEl && (deletedSelEl.value || '').trim()) {
                invoiceNumber = (deletedSelEl.value || '').trim();
            } else {
                const rawPurchCounter = await getAndIncrementCounter('purchases');
                invoiceNumber = formatInvoiceFromCounter(rawPurchCounter, 'purchases');
            }
        }

        const paymentTypeRadio = (document.querySelector('input[name="purchasePaymentType"]:checked')?.value) || 'credit';
        const payNowAmount = parseFloat(document.getElementById('purchasePayNow')?.value || '0') || 0;
        const payNowMode = (document.getElementById('purchasePaymentMode')?.value) || 'cash';
        const payNowBankAccount = (document.getElementById('purchaseBankAccount')?.value || '').trim();

        // Basic validations for partial settlements
        if (payNowAmount < 0) {
            showMessage('Pay Now amount cannot be negative.');
            return;
        }

    // Compute grand total: always include GST in the stored total amount.
    // If prices include GST already, use subtotalInc; otherwise add computed GST total.
    const tmpTotal = (pricesIncludeGst
        ? +(gstComputed.subtotalInc || 0)
        : +((gstComputed.subtotalEx || 0) + (gstComputed.total || 0)).toFixed(2)
    );
        // If supplier is not GST-registered, require explicit confirmation before saving
        const confirmedEl = document.getElementById('confirmedUnregPurchase');
        if (!supplierRegistered) {
            if (!confirmedEl || (confirmedEl && confirmedEl.value !== '1')) {
                    // Show confirmation modal (with accessibility helpers) and abort save for now
                    try { openModalById && typeof openModalById === 'function' ? openModalById('unregSupplierConfirmModal') : (document.getElementById('unregSupplierConfirmModal')?.classList.remove('hidden')); } catch(_) {}
                return;
            } else {
                // Clear confirmation for subsequent submits
                try { if (confirmedEl) confirmedEl.value = ''; } catch(_){}
            }
        }
        if (payNowAmount > tmpTotal + 0.0001) {
            showMessage('Pay Now cannot exceed the grand total.');
            return;
        }
        if (payNowAmount > 0 && payNowMode === 'bank' && !payNowBankAccount) {
            showMessage('Please select a bank account for Pay Now via Bank.');
            return;
        }

        // Effective total and remainder
        const effectiveTotal = tmpTotal;
        const remainingAfterPayNow = Math.max(0, +(effectiveTotal - payNowAmount).toFixed(2));

        // Effective paymentType stored on document
        const effectivePaymentType = (payNowAmount > 0)
            ? (remainingAfterPayNow > 0 ? 'credit' : (payNowMode === 'bank' ? 'bank' : 'cash'))
            : paymentTypeRadio;

        // Build detailed GST breakdown for persistence (if supplier registered)
        const gstBreakdownToStore = supplierRegistered ? {
            total: +(gstComputed.total || 0).toFixed(2),
            cgst: +(gstComputed.cgstTotal || 0).toFixed(2),
            sgst: +(gstComputed.sgstTotal || 0).toFixed(2),
            igst: +(gstComputed.igstTotal || 0).toFixed(2),
            rates: gstComputed.rates || {},
            intraState: !!gstComputed.intraState
        } : { total: 0, cgst: 0, sgst: 0, igst: 0, rates: {}, intraState: null };

        const purchaseData = {
            supplierName,
            invoiceNumber,
            purchaseDate: new Date(purchaseDate),
            items,
            // Store subtotal as ex-GST for consistency
            subtotal: gstComputed.subtotalEx,
            gstBreakdown: gstBreakdownToStore,
            // record supplier GST details for audit
            supplierGstin: supplierObj?.gstin || null,
            supplierGstRegistered: !!supplierRegistered,
            supplierStateCode: supplierStateCode || null,
            merchantStateCode: merchantStateCode || null,
            // Grand Total rule: Inclusive mode -> inclusive; Exclusive mode -> exclusive
            totalAmount: effectiveTotal,
            pricesIncludeGst,
            paymentType: effectivePaymentType,
            payNow: payNowAmount > 0 ? { amount: payNowAmount, mode: payNowMode, bankAccount: payNowMode === 'bank' ? payNowBankAccount : null } : null,
            // If this purchase is reusing a deleted invoice, record origin
            ...(function(){ try { const hid = document.getElementById('purchaseReusedInvoice'); const rv = (hid?.value || '').trim(); if (rv) { const orig = (state.allPurchases||[]).find(p => (p.invoiceNumber||'') === rv && p.isDeleted); return { reusedFromInvoice: rv, reusedFromPurchaseId: orig ? orig.id : null }; } } catch(_){} return {}; })(),
            // **NEW FIELD:** Mark as not deleted
            isDeleted: false,
            createdAt: serverTimestamp()
        };

        try {
            const batch = writeBatch(db);

            if (editingId) {
                const purchaseRef = doc(db, purchasesColPath, editingId);
                // Adjust stock by delta new - old
                const original = state.allPurchases.find(p => p.id === editingId) || { items: [] };
                const origMap = new Map();
                for (const it of original.items) origMap.set(it.productId, (origMap.get(it.productId) || 0) + it.quantity);
                const newMap = new Map();
                for (const it of items) newMap.set(it.productId, (newMap.get(it.productId) || 0) + it.quantity);
                const pids = new Set([...origMap.keys(), ...newMap.keys()]);
                for (const pid of pids) {
                    const delta = (newMap.get(pid) || 0) - (origMap.get(pid) || 0);
                    if (delta !== 0) {
                        const productRef = doc(db, productsColPath, pid);
                        // If quantity increased in edit, update costing similar to a new purchase for the delta
                        if (delta > 0) {
                            try {
                                const currentProduct = state.products.find(p => p.id === pid) || { stock: 0 };
                                const currentStock = parseFloat(currentProduct.stock) || 0;
                                const currentAvg = (typeof currentProduct.purchasePrice === 'number') ? currentProduct.purchasePrice : (parseFloat(currentProduct.purchasePrice) || 0);
                                // Calculate average price for the newly added quantity (from new items list)
                                let addedQty = 0, addedValue = 0;
                                for (const it of items) {
                                    if (it.productId === pid) {
                                        const q = Number(it.quantity) || 0;
                                        const price = (typeof it.purchasePrice === 'number') ? it.purchasePrice : (parseFloat(it.purchasePrice) || 0);
                                        // Only consider the portion that is the increase; simple heuristic uses item price
                                        addedQty += q;
                                        addedValue += price * q;
                                    }
                                }
                                const addedAvg = addedQty > 0 ? (addedValue / addedQty) : currentAvg;
                                const newStock = currentStock + delta;
                                let newAvg = addedAvg;
                                if (newStock > 0) {
                                    newAvg = ((currentAvg * currentStock) + (addedAvg * delta)) / newStock;
                                }
                                const roundedAvg = Math.round((newAvg + Number.EPSILON) * 100) / 100;
                                const roundedLast = Math.round((addedAvg + Number.EPSILON) * 100) / 100;
                                batch.update(productRef, { stock: increment(delta), purchasePrice: roundedAvg, lastPurchasePrice: roundedLast });
                            } catch (_) {
                                // fallback: just update stock
                                batch.update(productRef, { stock: increment(delta) });
                            }
                        } else {
                            // Quantity decreased on edit: update stock but avoid complex de-weighting of average cost
                            batch.update(productRef, { stock: increment(delta) });
                        }
                    }
                }
                batch.set(purchaseRef, { ...purchaseData, updatedAt: serverTimestamp() }, { merge: true });

                // Auto-post based on Pay Now split or payment type
                const credRef = doc(db, creditorsLedgerColPath, editingId);
                const cashRef = doc(db, cashLedgerColPath, editingId);
                const bankRef = doc(db, bankLedgerColPath, editingId);
                // Immediate (partial) entry doc ids use a suffix to avoid clobbering full-case docs
                const cashImmRef = doc(db, cashLedgerColPath, `${editingId}-immediate`);
                const bankImmRef = doc(db, bankLedgerColPath, `${editingId}-immediate`);

                if (payNowAmount > 0) {
                    // Clear any previous full-case postings for this id
                    batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });

                    // Post immediate amount to cash/bank
                    if (payNowMode === 'cash') {
                        batch.set(cashImmRef, {
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase (Cash, immediate)',
                            refId: editingId,
                            invoiceNumber,
                            notes: `Partial to ${supplierName}`,
                            debit: 0,
                            credit: payNowAmount,
                            isDeleted: false,
                            updatedAt: serverTimestamp(),
                        }, { merge: true });
                        batch.set(bankImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    } else {
                        batch.set(bankImmRef, {
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase (Bank, immediate)',
                            refId: editingId,
                            invoiceNumber,
                            notes: `Partial to ${supplierName}${payNowBankAccount ? ` - ${payNowBankAccount}` : ''}`,
                            debit: 0,
                            credit: payNowAmount,
                            isDeleted: false,
                            updatedAt: serverTimestamp(),
                            bankAccount: payNowBankAccount || null,
                        }, { merge: true });
                        batch.set(cashImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    }

                    // Post remaining to creditors (or clear if none remains)
                    if (remainingAfterPayNow > 0) {
                        batch.set(credRef, {
                            partyName: supplierName,
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase',
                            refId: editingId,
                            invoiceNumber,
                            debit: 0,
                            credit: remainingAfterPayNow,
                            isDeleted: false,
                            updatedAt: serverTimestamp(),
                        }, { merge: true });
                    } else {
                        batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    }
                } else if (effectivePaymentType === 'credit') {
                    // Creditors entry active
                    batch.set(credRef, {
                        partyName: supplierName,
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase',
                        refId: editingId,
                        invoiceNumber,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                    // Ensure cash/bank entries (if any) are marked deleted
                    batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, cashLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, bankLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                } else if (effectivePaymentType === 'cash') {
                    // Cash credit, no creditors
                    batch.set(cashRef, {
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase (Cash)',
                        refId: editingId,
                        invoiceNumber,
                        notes: `To ${supplierName}`,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                    batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(bankRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, cashLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, bankLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                } else if (effectivePaymentType === 'bank') {
                    // Bank credit, no creditors
                    batch.set(bankRef, {
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase (Bank)',
                        refId: editingId,
                        invoiceNumber,
                        notes: `To ${supplierName}`,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        updatedAt: serverTimestamp(),
                    }, { merge: true });
                    batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(cashRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, cashLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                    batch.set(doc(db, bankLedgerColPath, `${editingId}-immediate`), { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                }
            } else {
                const purchaseRef = doc(collection(db, purchasesColPath));
                batch.set(purchaseRef, purchaseData);

                // If user selected a deleted invoice to reuse, attempt a server-side reservation first
                try {
                    const sel = (document.getElementById('purchaseReusedInvoice')?.value || '').trim() || (document.getElementById('deletedInvoiceSelect')?.value || '').trim();
                    if (sel) {
                        const original = (state.allPurchases || []).find(p => (p.invoiceNumber || '') === sel && p.isDeleted);
                        if (original && original.id) {
                            try {
                                // Prefer server-side reservation (transactional). Falls back to client-side batch update when Functions unavailable.
                                if (typeof httpsCallable === 'function' && functionsSvc) {
                                    const reserveFn = httpsCallable(functionsSvc, 'reserveDeletedInvoice');
                                    await reserveFn({ appId, invoiceNumber: sel, newPurchaseId: purchaseRef.id });
                                    // Server will mark original and create the audit record atomically.
                                } else {
                                    // Fallback: mark original and create audit record in the same batch
                                    const origRef = doc(db, purchasesColPath, original.id);
                                    batch.update(origRef, { reused: true, reusedBy: purchaseRef.id, reusedAt: serverTimestamp(), updatedAt: serverTimestamp() });
                                    const auditRef = doc(collection(db, invoiceReusesColPath));
                                    batch.set(auditRef, {
                                        invoiceNumber: sel,
                                        originalPurchaseId: original.id,
                                        newPurchaseId: purchaseRef.id,
                                        reusedBy: (state.currentUser && state.currentUser.uid) || 'system',
                                        reusedAt: serverTimestamp(),
                                        createdAt: serverTimestamp()
                                    });
                                }
                            } catch (e) {
                                console.error('Failed to reserve deleted invoice:', e);
                                showMessage('Failed to reserve deleted invoice. Save aborted.');
                                return;
                            }
                        }
                    }
                } catch (err) { console.error('reserve-deleted-invoice wrapper failed', err); }

                // Increment stock and update costing for new purchase only
                // Update stock, lastPurchasePrice and a simple weighted-average purchasePrice
                for (const item of items) {
                    const productRef = doc(db, productsColPath, item.productId);
                    const currentProduct = state.products.find(p => p.id === item.productId) || { stock: 0 };
                    const currentStock = parseFloat(currentProduct.stock) || 0;
                    const currentAvg = (typeof currentProduct.purchasePrice === 'number') ? currentProduct.purchasePrice : (parseFloat(currentProduct.purchasePrice) || 0);
                    const qty = Number(item.quantity) || 0;
                    const itemPrice = (typeof item.purchasePrice === 'number') ? item.purchasePrice : (parseFloat(item.purchasePrice) || 0);
                    const newStock = currentStock + qty;
                    // Compute new weighted average (if stock weighted available), otherwise fall back to latest price
                    let newAvg = itemPrice;
                    if (newStock > 0) {
                        newAvg = ((currentAvg * currentStock) + (itemPrice * qty)) / newStock;
                    }
                    // Round to two decimals for storage
                    const roundedAvg = Math.round((newAvg + Number.EPSILON) * 100) / 100;
                    const roundedLast = Math.round((itemPrice + Number.EPSILON) * 100) / 100;
                    batch.update(productRef, { stock: newStock, purchasePrice: roundedAvg, lastPurchasePrice: roundedLast });
                }

                // Auto-post based on Pay Now split or payment type
                if (payNowAmount > 0) {
                    // Immediate part
                    if (payNowMode === 'cash') {
                        const cashImmRef = doc(db, cashLedgerColPath, `${purchaseRef.id}-immediate`);
                        batch.set(cashImmRef, {
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase (Cash, immediate)',
                            refId: purchaseRef.id,
                            invoiceNumber,
                            notes: `Partial to ${supplierName}`,
                            debit: 0,
                            credit: payNowAmount,
                            isDeleted: false,
                            createdAt: serverTimestamp(),
                        });
                    } else {
                        const bankImmRef = doc(db, bankLedgerColPath, `${purchaseRef.id}-immediate`);
                        batch.set(bankImmRef, {
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase (Bank, immediate)',
                            refId: purchaseRef.id,
                            invoiceNumber,
                            notes: `Partial to ${supplierName}${payNowBankAccount ? ` - ${payNowBankAccount}` : ''}`,
                            debit: 0,
                            credit: payNowAmount,
                            bankAccount: payNowBankAccount || null,
                            isDeleted: false,
                            createdAt: serverTimestamp(),
                        });
                    }

                    // Remaining part to creditors (if any)
                    if (remainingAfterPayNow > 0) {
                        const credRef = doc(db, creditorsLedgerColPath, purchaseRef.id);
                        batch.set(credRef, {
                            partyName: supplierName,
                            date: purchaseData.purchaseDate,
                            refType: 'Purchase',
                            refId: purchaseRef.id,
                            invoiceNumber,
                            debit: 0,
                            credit: remainingAfterPayNow,
                            isDeleted: false,
                            createdAt: serverTimestamp(),
                        });
                    }
                } else if (effectivePaymentType === 'credit') {
                    const credRef = doc(db, creditorsLedgerColPath, purchaseRef.id);
                    batch.set(credRef, {
                        partyName: supplierName,
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase',
                        refId: purchaseRef.id,
                        invoiceNumber,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        createdAt: serverTimestamp(),
                    });
                } else if (effectivePaymentType === 'cash') {
                    const cashRef = doc(db, cashLedgerColPath, purchaseRef.id);
                    batch.set(cashRef, {
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase (Cash)',
                        refId: purchaseRef.id,
                        invoiceNumber,
                        notes: `To ${supplierName}`,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        createdAt: serverTimestamp(),
                    });
                } else if (effectivePaymentType === 'bank') {
                    const bankRef = doc(db, bankLedgerColPath, purchaseRef.id);
                    batch.set(bankRef, {
                        date: purchaseData.purchaseDate,
                        refType: 'Purchase (Bank)',
                        refId: purchaseRef.id,
                        invoiceNumber,
                        notes: `To ${supplierName}`,
                        debit: 0,
                        credit: purchaseData.totalAmount,
                        isDeleted: false,
                        createdAt: serverTimestamp(),
                    });
                }

                // Optimistic local list add
                try {
                    const optimistic = { id: purchaseRef.id, ...purchaseData, createdAt: { seconds: Math.floor(Date.now()/1000) } };
                    if (!state.allPurchases.some(p => p.id === optimistic.id)) {
                        state.allPurchases.unshift(optimistic);
                    }
                } catch(_) {}
            }

            // Ensure supplier exists in master list
            try { await ensurePartyExists(supplierName, 'supplier'); } catch(_) {}

            await batch.commit();

            // After commit, reset relevant ledger pages so the new posting is visible
            try {
                // New/updated purchase may affect creditors and cash/bank ledgers
                state.creditorsPage = 1;
                if (payNowAmount > 0) {
                    if (payNowMode === 'cash') state.cashPage = 1;
                    else if (payNowMode === 'bank') state.bankPage = 1;
                } else {
                    if (effectivePaymentType === 'cash') state.cashPage = 1;
                    else if (effectivePaymentType === 'bank') state.bankPage = 1;
                    else if (effectivePaymentType === 'credit') state.creditorsPage = 1;
                }
                // If admin is open, refresh ledgers/purchases views
                if (state.currentPage === 'admin') {
                    if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
                    else if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
                }
            } catch (e) { console.warn('post-purchase UI refresh failed', e?.message || e); }

            // Refresh history
            renderPurchaseHistory();

            showMessage(editingId ? 'Purchase updated successfully!' : 'Purchase recorded successfully!');
            e.target.reset();
            const editIdEl = document.getElementById('editingPurchaseId'); if (editIdEl) editIdEl.value = '';
            document.getElementById('purchaseItemsContainer').innerHTML = '';
            addPurchaseItemRow();
        } catch (error) {
                console.error("Error saving purchase:", error);
                showMessage("Failed to save purchase entry.");
        }
    }

    if (e.target.id === 'newProductForm') {
        e.preventDefault();
        const gstPercentageEl = e.target.querySelector('#gstPercentage');
        const productData = {
            name: e.target.querySelector('#productName').value,
            description: e.target.querySelector('#productDescription').value,
            purchasePrice: 0, // This is now calculated
            lastPurchasePrice: 0,
            salePrice: parseFloat(e.target.querySelector('#salePrice').value) || 0,
            stock: 0, // Stock will be added via the purchase entry
            gstPercentage: gstPercentageEl ? parseInt(gstPercentageEl.value) : 0,
            category: e.target.querySelector('#productCategory').value,
            productGroup: (e.target.querySelector('#modalProductGroup') ? e.target.querySelector('#modalProductGroup').value : '') || null,
            image: e.target.querySelector('#productImage').value,
            createdAt: serverTimestamp()
        };

        try {
            const newProdDoc = await addDoc(collection(db, productsColPath), productData);
            showMessage('New product added! You can now select it.');
            
            // Update the select that triggered this
            const lastSelect = window.newProductTriggerSelect;
            if(lastSelect) {
                const newOption = new Option(productData.name, newProdDoc.id);
                newOption.selected = true;
               lastSelect.add(newOption, lastSelect.options[lastSelect.options.length - 1]);
            }

            closeNewProductModal();
        } catch (error) {
            console.error("Error adding new product:", error);
            showMessage("Failed to add new product.");
        }
    }
});
        
const messageModal = document.getElementById('messageModal');
const messageText = document.getElementById('messageText');
const messageOkBtn = document.getElementById('messageOkBtn');

function showMessage(msg) {
    if(!messageModal || !messageText) return;
    messageText.textContent = msg;
    try { document.dispatchEvent(new CustomEvent('app:message', { detail: { message: msg } })); } catch(_) {}
   messageModal.classList.remove('hidden');
    setTimeout(() => {
       messageModal.classList.remove('opacity-0');
       messageModal.querySelector('div').classList.remove('scale-95');
     }, 10);
};

// Small transient toast for admin summaries and short notices
function showToast(title, lines = [], opts = {}) {
    try {
        const containerId = 'appToastContainer';
        let container = document.getElementById(containerId);
        if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'fixed';
            container.style.top = '1rem';
            container.style.right = '1rem';
            container.style.zIndex = 99999;
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = 'app-toast';
        toast.style.background = 'rgba(0,0,0,0.85)';
        toast.style.color = 'white';
        toast.style.padding = '12px 16px';
        toast.style.borderRadius = '8px';
        toast.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
        toast.style.marginTop = '8px';
        toast.style.minWidth = '240px';
        const titleEl = document.createElement('div');
        titleEl.style.fontWeight = '700';
        titleEl.style.marginBottom = lines && lines.length ? '6px' : '0';
        titleEl.textContent = title || '';
        toast.appendChild(titleEl);
        if (lines && lines.length) {
            const ul = document.createElement('ul');
            ul.style.margin = '0';
            ul.style.paddingLeft = '18px';
            ul.style.fontSize = '13px';
            ul.style.lineHeight = '1.25';
            lines.slice(0, 6).forEach(l => {
                const li = document.createElement('li');
                li.textContent = l;
                ul.appendChild(li);
            });
            toast.appendChild(ul);
        }
    const close = document.createElement('button');
    close.textContent = '×';
        close.style.position = 'absolute';
        close.style.top = '6px';
        close.style.right = '8px';
        close.style.background = 'transparent';
        close.style.border = 'none';
        close.style.color = 'white';
        close.style.fontSize = '16px';
        close.style.cursor = 'pointer';
        close.addEventListener('click', () => { try { container.removeChild(toast); } catch(_) {} });
        toast.appendChild(close);
        // If a details payload was provided, render a small Details button
        if (opts.details) {
            const detailsBtn = document.createElement('button');
            detailsBtn.textContent = 'Details';
            detailsBtn.style.marginLeft = '8px';
            detailsBtn.style.background = 'transparent';
            detailsBtn.style.color = 'white';
            detailsBtn.style.border = '1px solid rgba(255,255,255,0.2)';
            detailsBtn.style.padding = '4px 8px';
            detailsBtn.style.borderRadius = '6px';
            detailsBtn.style.cursor = 'pointer';
            detailsBtn.addEventListener('click', () => { showDetailModal(opts.details); });
            toast.appendChild(detailsBtn);
        }
        container.appendChild(toast);
        const ttl = typeof opts.ttl === 'number' ? opts.ttl : 6000;
        setTimeout(() => { try { if (toast.parentNode) toast.parentNode.removeChild(toast); } catch(_) {} }, ttl);
    } catch (e) { console.warn('showToast error', e); }
}

function showDetailModal(details) {
    try {
        const id = 'appDetailModal';
        let modal = document.getElementById(id);
        if (modal) modal.parentNode.removeChild(modal);
        modal = document.createElement('div');
        modal.id = id;
        modal.style.position = 'fixed';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.background = 'rgba(0,0,0,0.6)';
        modal.style.zIndex = 100000;
        const box = document.createElement('div');
        box.style.background = 'white';
        box.style.color = '#111';
        box.style.padding = '18px';
        box.style.borderRadius = '8px';
        box.style.maxWidth = '900px';
        box.style.width = '90%';
        box.style.maxHeight = '80%';
        box.style.overflow = 'auto';
        const title = document.createElement('h3');
        title.textContent = 'Details';
        title.style.marginTop = '0';
        box.appendChild(title);
        const pre = document.createElement('pre');
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.wordBreak = 'break-word';
        pre.style.background = '#f7f7f7';
        pre.style.padding = '12px';
        pre.style.borderRadius = '6px';
        pre.textContent = typeof details === 'string' ? details : JSON.stringify(details, null, 2);
        box.appendChild(pre);
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.style.marginTop = '12px';
        close.addEventListener('click', () => { try { modal.parentNode.removeChild(modal); } catch(_) {} });
        box.appendChild(close);
        modal.appendChild(box);
        document.body.appendChild(modal);
    } catch (e) { console.warn('showDetailModal error', e); }
}

if (messageOkBtn) {
   messageOkBtn.addEventListener('click', () => {
        if(!messageModal) return;
       messageModal.classList.add('opacity-0');
       messageModal.querySelector('div').classList.add('scale-95');
        setTimeout(() => messageModal.classList.add('hidden'), 300);
    });
}
        
async function updateOrderStatus(orderId, userId, status) {
    if (!state.isAdmin) {
        showMessage('Only admin can change order status.');
        return;
    }

    // Preferred path: use callable Cloud Function with Admin privileges
    try {
        const callUpdate = httpsCallable(functionsSvc, 'adminUpdateOrderStatus');
        await callUpdate({ appId, orderId, userId, status });
        showMessage(`Order ${orderId} status updated to ${status}.`);
        return;
    } catch (fnErr) {
        console.warn('Callable adminUpdateOrderStatus failed, falling back to client writes:', fnErr?.message || fnErr);
        // Fallback path: attempt direct client writes (may be blocked by rules)
        const publicOrderRef = doc(db, ordersColPath, orderId);
        const userOrderPath = `artifacts/${appId}/users/${userId}/orders`;
        const userOrderRef = doc(db, userOrderPath, orderId);

        let anySuccess = false;
        const errors = [];

        try {
            await updateDoc(publicOrderRef, { status });
            anySuccess = true;
        } catch (e) {
            errors.push(e);
        }
        try {
            await updateDoc(userOrderRef, { status });
            anySuccess = true;
        } catch (e) {
            errors.push(e);
        }

        if (anySuccess) {
            showMessage(`Order ${orderId} status updated to ${status}.`);
        } else {
            console.error('Error updating order status (fallback failed):', ...errors);
            showMessage('Failed to update order status.');
        }
    }
}

// **NEW:** Soft Delete Purchase Function
async function softDeletePurchase(purchaseId) {
    const purchaseRef = doc(db, purchasesColPath, purchaseId);
    const purchase = state.allPurchases.find(p => p.id === purchaseId);
    if (!purchase) {
        showMessage('Purchase record not found.');
        return;
    }

    try {
        const batch = writeBatch(db);

    // 1. Soft delete the purchase record and record audit info
    batch.update(purchaseRef, { isDeleted: true, cancelledBy: (state.currentUser && state.currentUser.uid) || 'system', cancelledAt: serverTimestamp() });

        // 2. Adjust product stock (restore stock back to inventory)
        // When a purchase (bill) is cancelled we should add the purchased quantities back to stock.
        for (const item of purchase.items || []) {
            const productRef = doc(db, productsColPath, item.productId);
            batch.update(productRef, { stock: increment((item.quantity || 0)) });
        }

        // 3. Mark creditors ledger entry as deleted
        try {
            const credRef = doc(db, creditorsLedgerColPath, purchaseId);
            batch.set(credRef, { isDeleted: true, cancelledBy: (state.currentUser && state.currentUser.uid) || 'system', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
        } catch (_) { /* ignore */ }

        // NOTE: For simplicity, average purchase price is not recalculated as it's complex and prone to errors.
        // A full accounting system would need to reverse the weighted average calculation.
        // We'll leave the purchasePrice field as is for now.

        await batch.commit();
        showMessage(`Purchase ${purchaseId} marked as deleted and stock has been reversed.`);
    } catch (error) {
        console.error("Error soft-deleting purchase:", error);
        showMessage("Failed to delete purchase entry and reverse stock.");
    }
}

// --- AUTHENTICATION & INITIALIZATION ---
function initializeAppAndListeners() {
    let initialAuthResolved = false;
    let publicListenersAttached = false;

    // Handle pending redirect results (from Google fallback) once at startup
    handleAuthRedirectResultOnce();

    onAuthStateChanged(auth, async (user) => {
        if (!user && !initialAuthResolved) {
            initialAuthResolved = true;
            // If running locally and not forcing production, check that the Auth emulator is reachable
            const host = window && window.location && (window.location.hostname || '');
            const shouldCheckEmulator = !__tiaras_forceProd && (host === 'localhost' || host === '127.0.0.1');

            async function pingUrl(url, timeoutMs = 1200) {
                try {
                    const controller = new AbortController();
                    const id = setTimeout(() => controller.abort(), timeoutMs);
                    const res = await fetch(url, { method: 'GET', signal: controller.signal });
                    clearTimeout(id);
                    return res.ok || res.status === 200 || res.status === 404;
                } catch (_) {
                    return false;
                }
            }

            try {
                if (shouldCheckEmulator) {
                    const emuOk = await pingUrl('http://127.0.0.1:9099/');
                    if (!emuOk) {
                        // Inform developer: emulator not running. Suggest starting or using production flag.
                        try { console && console.warn && console.warn('Auth emulator not reachable at http://127.0.0.1:9099'); } catch (_) {}
                        showMessage('Local Firebase emulator not running. Start the emulator (auth, firestore, functions) or open this page with ?useProd=1 to use production Firebase.');
                        return;
                    }
                }

                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } else {
                    await signInAnonymously(auth);
                }
                return;
            } catch (error) {
               console.error("Initial sign-in failed:", error);
               showMessage("Could not connect to the service.");
                return;
            }
        }
        
        initialAuthResolved = true;
        state.currentUser = user;

        if (user && !publicListenersAttached) {
            publicListenersAttached = true;
            listenToProducts();
            listenToProductGroups();
            listenToHeroSlides();
            listenToGalleryImages();
            listenToSiteSettings();
            listenToTestimonials();
            // Party masters can be public
            listenToSuppliers();
            listenToCustomers();
            listenToBanks();
        }

        // Handle user-specific listeners
        ['cart', 'orders', 'profile'].forEach(key => {
            if (state.listeners[key]) {
                try { state.listeners[key](); } catch {}
                state.listeners[key] = null;
            }
        });

        // Reset admin listeners; will reattach if privileges allow
        detachAdminListeners();

        // Cleanup any per-order public mirror listeners for previous user
        if (state.userOrderPublicUnsubs && typeof state.userOrderPublicUnsubs === 'object') {
            for (const [id, unsub] of Object.entries(state.userOrderPublicUnsubs)) {
                try { unsub(); } catch {}
                delete state.userOrderPublicUnsubs[id];
            }
        }


        if (user && !user.isAnonymous) {
            listenToCart(user.uid);
            listenToUserOrders(user.uid);
            listenToUserProfile(user.uid);
        } else {
            state.cart = { items: {} };
            state.orders = [];
            state.allOrders = [];
            state.userProfile = null;
            if (state.listeners.profile) { try { state.listeners.profile(); } catch {} state.listeners.profile = null; }
            state.allSuppliers = [];
            state.allCustomers = [];
        }

        refreshAdminState();
        
        renderApp();
    });
}
        
// --- PURCHASE FORM HELPERS ---
function addPurchaseItemRow() {
    const container = document.getElementById('purchaseItemsContainer');
    if(!container) return;

    const productOptions = state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-4 items-center purchase-item-row';
    row.innerHTML = `
        <div class="col-span-4">
            <select class="purchase-product-select w-full px-4 py-2 border border-gray-300 rounded-md">
                <option value="">Select a Product</option>
                ${productOptions}
                <option value="new" class="text-blue-500 font-bold">+ Add New Product</option>
            </select>
            <div class="purchase-hsn mt-2 w-full px-3 py-2 rounded-md text-sm text-gray-700 hidden" aria-hidden="true">
                <span class="purchase-hsn-label text-xs text-gray-500 mr-2 hidden">HSN / SAC:</span>
                <span class="purchase-hsn-code"></span>
            </div>
        </div>
        <div class="col-span-2">
            <input type="number" class="purchase-price w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Price" step="0.01">
            <div class="avg-price-hint text-xs text-gray-500 mt-1 hidden">
                <span>Avg: ₹<span class="avg-price-val">0.00</span></span>
                <span class="mx-1">•</span>
                <span>Last: ₹<span class="last-price-val">0.00</span></span>
                <span class="relative inline-block ml-2 group align-middle">
                    <i class="fa-solid fa-circle-info text-gray-400 cursor-help" title="Avg: weighted average unit cost across all purchases; Last: unit cost from the most recent purchase."></i>
                    <span class="absolute left-1/2 -translate-x-1/2 mt-1 z-20 hidden group-hover:block bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                        Avg: weighted average unit cost across all purchases; Last: unit cost from the most recent purchase.
                    </span>
                </span>
            </div>
        </div>
        <div class="col-span-2">
            <input type="number" class="purchase-quantity w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Qty">
        </div>
        <div class="col-span-1 purchase-gst-col">
            <div class="flex items-center gap-2">
                <select class="purchase-gst flex-1 px-2 py-2 border border-gray-300 rounded-md">
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18" selected>18%</option>
                    <option value="28">28%</option>
                    <option value="custom">Custom...</option>
                </select>
                <button type="button" class="purchase-gst-custom-btn px-2 py-1 text-xs bg-gray-100 border rounded" title="Add custom GST%">Custom</button>
            </div>
            <input type="number" min="0" step="0.01" class="purchase-gst-custom mt-1 w-full px-2 py-2 border border-gray-300 rounded-md hidden" placeholder="Custom %">
        </div>
        <div class="col-span-2">
            <p class="purchase-item-total text-right font-semibold">0.00</p>
        </div>
        <div class="col-span-1 text-right">
            <button type="button" class="remove-purchase-item-btn text-red-500 hover:text-red-700">&times;</button>
        </div>
    `;
    container.appendChild(row);

    // Ensure GST select editability matches current toggle state for this new row
    const pricesIncludeToggle = document.getElementById('purchasePricesIncludeGst');
    const select = row.querySelector('.purchase-gst');
    const customInput = row.querySelector('.purchase-gst-custom');
        if (select) {
            // Enable GST% editing when in Inclusive mode (toggle ON)
            const enabled = !!(pricesIncludeToggle && pricesIncludeToggle.checked);
            select.disabled = !enabled;
            // Wire change to show/hide custom input
            select.addEventListener('change', (ev) => {
                try {
                    const v = (select.value || '').toString();
                    if (v === 'custom') {
                        if (customInput) {
                            customInput.classList.remove('hidden');
                            customInput.focus();
                        }
                    } else {
                        if (customInput) {
                            customInput.classList.add('hidden');
                        }
                    }
                    updatePurchaseTotal();
                } catch (_) {}
            });

            // Wire explicit Custom button to reveal custom input (helps visibility)
            const customBtn = row.querySelector('.purchase-gst-custom-btn');
            if (customBtn) {
                customBtn.addEventListener('click', () => {
                    try {
                        select.value = 'custom';
                        if (customInput) {
                            customInput.classList.remove('hidden');
                            customInput.focus();
                        }
                        // enable select if disabled so user can change it
                        try { select.disabled = false; } catch(_) {}
                        updatePurchaseTotal();
                    } catch (_) {}
                });
            }
        }
    if (customInput) {
        customInput.addEventListener('input', () => updatePurchaseTotal());
    }
    // After adding the row, move keyboard focus to the new product select so Tab order continues there
    try {
        const productSelect = row.querySelector('.purchase-product-select');
        if (productSelect) { setTimeout(() => { try { productSelect.focus(); } catch(_){} }, 0); }
    } catch(_) {}
}

// Helper: read GST% for a purchase-item row, preferring custom input when present
function getRowGstPercentage(row) {
    try {
        if (!row) return 0;
        const customInput = row.querySelector('.purchase-gst-custom');
        const sel = row.querySelector('.purchase-gst');
        if (customInput && !customInput.classList.contains('hidden')) {
            const v = (customInput.value || '').toString().trim();
            if (v !== '') return parseFloat(v) || 0;
        }
        if (sel) {
            const val = (sel.value || '').toString().trim();
            if (val === 'custom') {
                if (customInput) {
                    const v2 = (customInput.value || '').toString().trim();
                    if (v2 !== '') return parseFloat(v2) || 0;
                }
                return 0;
            }
            return parseFloat(val) || 0;
        }
    } catch (_) {}
    return 0;
}

// Load an existing purchase into the entry form for editing
function loadPurchaseIntoForm(purchaseId) {
    const p = state.allPurchases.find(x => x.id === purchaseId);
    if (!p) { showMessage('Purchase not found'); return; }
    const idEl = document.getElementById('editingPurchaseId');
    if (idEl) idEl.value = purchaseId;
    const supplierEl = document.getElementById('supplierName');
    const dateEl = document.getElementById('purchaseDate');
    const toggleEl = document.getElementById('purchasePricesIncludeGst');
    if (supplierEl) supplierEl.value = p.supplierName || '';
    if (dateEl) {
        try {
            const d = new Date(p.purchaseDate?.seconds ? p.purchaseDate.seconds * 1000 : p.purchaseDate);
            dateEl.value = new Date(d).toISOString().split('T')[0];
        } catch { /* ignore */ }
    }
    if (toggleEl) {
        toggleEl.checked = !!p.pricesIncludeGst;
        setPurchaseGstEnabled(toggleEl.checked);
    }
    const container = document.getElementById('purchaseItemsContainer');
    if (!container) return;
    container.innerHTML = '';
    for (const it of (p.items || [])) {
        addPurchaseItemRow();
        const row = container.lastElementChild;
        const sel = row.querySelector('.purchase-product-select');
        const priceEl = row.querySelector('.purchase-price');
        const qtyEl = row.querySelector('.purchase-quantity');
        const gstEl = row.querySelector('.purchase-gst');
        if (sel) sel.value = it.productId;
        if (priceEl) priceEl.value = (it.purchasePrice || 0).toString();
        if (qtyEl) qtyEl.value = (it.quantity || 0).toString();
        if (gstEl) gstEl.value = String(it.gstPercentage || 0);
        // If the GST% is not one of the preset options, switch select to 'custom' and show custom input
        try {
            const customInput = row.querySelector('.purchase-gst-custom');
            const presetValues = ['0','5','12','18','28'];
            const v = String(it.gstPercentage || 0);
            if (gstEl && !presetValues.includes(v)) {
                gstEl.value = 'custom';
                if (customInput) { customInput.classList.remove('hidden'); customInput.value = v; }
            } else {
                // ensure custom input hidden for preset values
                if (customInput) customInput.classList.add('hidden');
            }
            // trigger change to ensure any listeners run
            try { gstEl.dispatchEvent(new Event('change')); } catch(_) {}
        } catch(_) {}
    }
    updatePurchaseTotal();
    // Scroll to form
    document.getElementById('purchaseForm')?.scrollIntoView({ behavior: 'smooth' });
}

// Enable/disable editing of GST% selects on the purchase form
function setPurchaseGstEnabled(enabled) {
    // Keep header visible always; just disable selects
    document.querySelectorAll('.purchase-item-row .purchase-gst').forEach(sel => {
        sel.disabled = !enabled;
    });
    document.querySelectorAll('.purchase-item-row .purchase-gst-custom').forEach(inp => {
        if (!enabled) {
            // hide custom input when GST editing disabled
            try { inp.classList.add('hidden'); } catch(_) {}
            inp.disabled = true;
        } else {
            inp.disabled = false;
        }
    });
}

function updatePurchaseTotal() {
    // Toggle ON (checked) = Inclusive; OFF = Exclusive
    const pricesIncludeGst = !!(document.getElementById('purchasePricesIncludeGst')?.checked || false);
    // Build items list from rows
    const items = [];
    document.querySelectorAll('.purchase-item-row').forEach(row => {
        const price = parseFloat(row.querySelector('.purchase-price').value) || 0;
    const quantity = parseFloat(row.querySelector('.purchase-quantity').value) || 0;
        const gstPercentage = getRowGstPercentage(row);
        items.push({ price, quantity, gstPercentage });
        // Display per-row total (use inclusive/exclusive display semantics)
        const lineInc = price * quantity;
        row.querySelector('.purchase-item-total').textContent = `${lineInc.toFixed(2)}`;
    });

    // Determine merchant & supplier state codes
    const merchantStateCode = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '');
    const supplierName = (document.getElementById('supplierName')?.value || '').trim();
    const supplierObj = (state.allSuppliers || []).find(s => (s.name || '').trim().toLowerCase() === supplierName.toLowerCase());
    const supplierStateCode = getStateCodeFromGstin(supplierObj?.gstin || '');
    const supplierRegistered = !!(supplierObj && (supplierObj.gstin || '').trim());

    // Calculate totals. Requirement:
    // - Exclusive mode: NO GST calculated (gst = 0). subtotal = sum of (price*qty). grand total = subtotal.
    // - Inclusive mode: GST should be calculated from item GST rates. subtotal = sum of line totals. GST portion = calculated per item and summed. Grand total = subtotal + GST portion.
    let gstComputed = { total: 0, subtotalEx: 0, subtotalInc: 0, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, rates: {}, intraState: true };
    const sumLineTotals = items.reduce((s, it) => s + ((it.price || 0) * (it.quantity || 0)), 0);
    const intraState = (merchantStateCode && supplierStateCode) ? (merchantStateCode === supplierStateCode) : true;

    if (!pricesIncludeGst) {
        // Exclusive mode: do not compute GST
        gstComputed = { total: 0, subtotalEx: sumLineTotals, subtotalInc: sumLineTotals, cgstTotal: 0, sgstTotal: 0, igstTotal: 0, rates: {}, intraState };
    } else {
        // Inclusive mode: compute GST portion from item GST rates
        let totalGst = 0;
        const rates = {};
        items.forEach(it => {
            const line = (it.price || 0) * (it.quantity || 0);
            const rate = Number(it.gstPercentage) || 0;
            if (rate > 0) {
                // Treat entered line amount as EXCLUSIVE of GST for this mode: tax = line * (rate/100)
                const gstPortion = line * (rate / 100);
                totalGst += gstPortion;
                rates[rate] = (rates[rate] || 0) + gstPortion;
            }
        });
        // Split CGST/SGST or IGST based on intraState
        let cgst = 0, sgst = 0, igst = 0;
        if (totalGst > 0) {
            if (intraState) { cgst = totalGst / 2; sgst = totalGst / 2; }
            else { igst = totalGst; }
        }
        gstComputed = { total: totalGst, subtotalEx: sumLineTotals, subtotalInc: sumLineTotals, cgstTotal: cgst, sgstTotal: sgst, igstTotal: igst, rates, intraState };
    }

    // Update subtotal, GST breakdown and grand total in UI
    const labelEl = document.getElementById('purchaseSubtotalLabel');
    const gstEl = document.getElementById('purchaseGst');
    if (pricesIncludeGst) {
        // In Inclusive mode: subtotal = total of all line totals (inclusive amounts)
        // then GST (tax portion) is shown and ADDED on top to compute grand total per request.
        document.getElementById('purchaseSubtotal').textContent = `${(gstComputed.subtotalInc).toFixed(2)}`;
        if (labelEl) { labelEl.textContent = 'Subtotal (Sum of line totals)'; }
    } else {
        document.getElementById('purchaseSubtotal').textContent = `${(gstComputed.subtotalEx).toFixed(2)}`;
        if (labelEl) { labelEl.textContent = 'Subtotal (Excl. GST)'; }
    }

    if (gstEl) {
        if (gstComputed.total > 0) {
            if (gstComputed.igstTotal && gstComputed.igstTotal > 0) {
                gstEl.textContent = `IGST: ₹${gstComputed.igstTotal.toFixed(2)} (Total ₹${gstComputed.total.toFixed(2)})`;
            } else {
                gstEl.textContent = `CGST: ₹${gstComputed.cgstTotal.toFixed(2)} • SGST: ₹${gstComputed.sgstTotal.toFixed(2)} (Total ₹${gstComputed.total.toFixed(2)})`;
            }
        } else {
            gstEl.textContent = `0.00`;
        }
    }

    // Compute grand total: for inclusive mode, add the GST portion on top of the line-totals subtotal
    try {
        const grandTotalEl = document.getElementById('purchaseTotal');
        if (grandTotalEl) {
            if (pricesIncludeGst) {
                const grand = (gstComputed.subtotalInc || 0) + (gstComputed.total || 0);
                grandTotalEl.textContent = `${grand.toFixed(2)}`;
            } else {
                grandTotalEl.textContent = `${(gstComputed.subtotalEx).toFixed(2)}`;
            }
        }
    } catch (_) {}

    const badge = document.getElementById('purchaseModeBadge');
    if (badge) {
        if (pricesIncludeGst) {
            badge.textContent = `Inclusive mode ${gstComputed.intraState ? '• Intra-state' : '• Inter-state'}`;
            badge.classList.remove('bg-gray-100','text-gray-700','border-gray-200');
            badge.classList.add('bg-green-100','text-green-700','border-green-200');
        } else {
            badge.textContent = `Exclusive mode ${gstComputed.intraState ? '• Intra-state' : '• Inter-state'}`;
            badge.classList.remove('bg-green-100','text-green-700','border-green-200');
            badge.classList.add('bg-gray-100','text-gray-700','border-gray-200');
        }
    }
}

function renderPurchaseHistory() {
    const container = document.getElementById('purchaseHistoryContainer');
    if (!container) return;
    
    // **MODIFIED:** Filter to only show NON-DELETED purchases
    const nonDeletedPurchases = (state.allPurchases || []).filter(p => !p.isDeleted);

    // Render header controls: date range and Today quick button
    const todayIso = new Date().toISOString().split('T')[0];
    const headerControls = `
        <div class="mb-4 flex items-center gap-3">
            <label class="text-sm text-gray-600">From</label>
            <input type="date" id="purchaseFromDate" class="px-3 py-2 border rounded" />
            <label class="text-sm text-gray-600">To</label>
            <input type="date" id="purchaseToDate" class="px-3 py-2 border rounded" />
            <button id="purchaseTodayBtn" class="bg-blue-600 text-white px-3 py-2 rounded">Today</button>
            <button id="purchaseApplyDateBtn" class="bg-green-600 text-white px-3 py-2 rounded">Apply</button>
            <button id="purchaseClearDateBtn" class="bg-gray-200 text-gray-700 px-3 py-2 rounded">Clear</button>
        </div>
    `;

    // If there are no purchases, still render header so user can set a range
    if (nonDeletedPurchases.length === 0) {
        container.innerHTML = headerControls + `<p class="text-gray-500 text-center">No purchase history found.</p>`;
        // attach handlers
        try { document.getElementById('purchaseTodayBtn').addEventListener('click', () => { document.getElementById('purchaseFromDate').value = todayIso; document.getElementById('purchaseToDate').value = todayIso; }); } catch(_){}
        try { document.getElementById('purchaseClearDateBtn').addEventListener('click', () => { document.getElementById('purchaseFromDate').value = ''; document.getElementById('purchaseToDate').value = ''; renderPurchaseHistory(); }); } catch(_){}
        try { document.getElementById('purchaseApplyDateBtn').addEventListener('click', () => renderPurchaseHistory()); } catch(_){}
        return;
    }

    const historyHTML = nonDeletedPurchases.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(purchase => `
        <div class="bg-gray-50 p-4 rounded-lg text-sm">
            <div class="flex justify-between items-start mb-2">
                <div>
                   <p><strong>Supplier:</strong> ${purchase.supplierName}</p>
                    <p class="text-xs text-gray-500">Invoice #: ${purchase.invoiceNumber || purchase.id} ${purchase.reusedFromInvoice ? `<span class="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs" title="Reused from ${escapeHtml(purchase.reusedFromInvoice)}">Reused</span>` : ''}</p>
                </div>
                <div class="text-right flex items-center space-x-3">
                    <div>
                        <p class="font-bold">Total (₹): ${(purchase.totalAmount || 0).toFixed(2)}</p>
                        <button data-page="purchase_invoice" data-id="${purchase.id}" class="nav-btn text-xs text-blue-500 hover:underline">View Record</button>
                    </div>
                    <button data-id="${purchase.id}" class="edit-purchase-btn bg-yellow-500 text-white p-2 rounded-full hover:bg-yellow-600 w-8 h-8 flex items-center justify-center" title="Edit Entry"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button data-id="${purchase.id}" class="soft-delete-purchase-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-8 h-8 flex items-center justify-center" title="Delete Entry & Reverse Stock"><i class="fa-solid fa-trash-can-arrow-up text-xs"></i></button>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-2">Date: ${formatDate(purchase.purchaseDate)}</p>
            <details>
                     <summary class="cursor-pointer text-blue-500 text-xs">View Items (${(purchase.items||[]).length})</summary>
                     <ul class="list-disc pl-5 mt-2 text-xs">
                         ${(purchase.items||[]).map(item => `<li>${item.productName || ''} - ${item.quantity || 0} x ${(typeof item.purchasePrice === 'number' ? item.purchasePrice : (parseFloat(item.purchasePrice) || 0)).toFixed(2)}</li>`).join('')}
                     </ul>
            </details>
        </div>
    `).join('');

    // Compose full HTML with header controls
    container.innerHTML = headerControls + historyHTML;

    // Attach control handlers
    try {
        const fromEl = document.getElementById('purchaseFromDate');
        const toEl = document.getElementById('purchaseToDate');
        const todayBtn = document.getElementById('purchaseTodayBtn');
        const applyBtn = document.getElementById('purchaseApplyDateBtn');
        const clearBtn = document.getElementById('purchaseClearDateBtn');
        // default dates: empty
        if (todayBtn) todayBtn.addEventListener('click', () => {
            try { fromEl.value = todayIso; toEl.value = todayIso; applyBtn && applyBtn.click(); } catch(_){}
        });
        if (applyBtn) applyBtn.addEventListener('click', () => {
            try {
                const from = fromEl && fromEl.value ? new Date(fromEl.value) : null;
                const to = toEl && toEl.value ? new Date(toEl.value) : null;
                // inclusive to end of day
                if (from || to) {
                    const filtered = nonDeletedPurchases.filter(p => {
                        try {
                            const pd = _toDate(p.purchaseDate || p.createdAt);
                            if (!pd) return false;
                            if (from && pd < new Date(from.getFullYear(), from.getMonth(), from.getDate(), 0,0,0)) return false;
                            if (to && pd > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23,59,59,999)) return false;
                            return true;
                        } catch(_) { return false; }
                    }).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                    // render filtered list
                    const listHtml = filtered.map(purchase => `
                        <div class="bg-gray-50 p-4 rounded-lg text-sm">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                   <p><strong>Supplier:</strong> ${purchase.supplierName}</p>
                                    <p class="text-xs text-gray-500">Invoice #: ${purchase.invoiceNumber || purchase.id} ${purchase.reusedFromInvoice ? `<span class="ml-2 px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs" title="Reused from ${escapeHtml(purchase.reusedFromInvoice)}">Reused</span>` : ''}</p>
                                </div>
                                <div class="text-right flex items-center space-x-3">
                                    <div>
                                        <p class="font-bold">Total (₹): ${(purchase.totalAmount || 0).toFixed(2)}</p>
                                        <button data-page="purchase_invoice" data-id="${purchase.id}" class="nav-btn text-xs text-blue-500 hover:underline">View Record</button>
                                    </div>
                                    <button data-id="${purchase.id}" class="edit-purchase-btn bg-yellow-500 text-white p-2 rounded-full hover:bg-yellow-600 w-8 h-8 flex items-center justify-center" title="Edit Entry"><i class="fa-solid fa-pen text-xs"></i></button>
                                    <button data-id="${purchase.id}" class="soft-delete-purchase-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-8 h-8 flex items-center justify-center" title="Delete Entry & Reverse Stock"><i class="fa-solid fa-trash-can-arrow-up text-xs"></i></button>
                                </div>
                            </div>
                            <p class="text-xs text-gray-500 mb-2">Date: ${formatDate(purchase.purchaseDate)}</p>
                            <details>
                                     <summary class="cursor-pointer text-blue-500 text-xs">View Items (${(purchase.items||[]).length})</summary>
                                     <ul class="list-disc pl-5 mt-2 text-xs">
                                         ${(purchase.items||[]).map(item => `<li>${item.productName || ''} - ${item.quantity || 0} x ${(typeof item.purchasePrice === 'number' ? item.purchasePrice : (parseFloat(item.purchasePrice) || 0)).toFixed(2)}</li>`).join('')}
                                     </ul>
                            </details>
                        </div>
                    `).join('');
                    // replace history region (after header)
                    const afterHeader = container.querySelectorAll('div')[1];
                    // simpler: set innerHTML keeping header
                    container.innerHTML = headerControls + listHtml;
                    // re-attach handlers recursively
                    try { document.getElementById('purchaseTodayBtn').addEventListener('click', () => { fromEl.value = todayIso; toEl.value = todayIso; applyBtn && applyBtn.click(); }); } catch(_){}
                    try { document.getElementById('purchaseClearDateBtn').addEventListener('click', () => { fromEl.value = ''; toEl.value = ''; renderPurchaseHistory(); }); } catch(_){}
                    // attach edit handlers
                    container.querySelectorAll('.edit-purchase-btn').forEach(btn => { btn.addEventListener('click', () => loadPurchaseIntoForm(btn.dataset.id)); });
                    container.querySelectorAll('.soft-delete-purchase-btn').forEach(btn => { btn.addEventListener('click', () => softDeletePurchase(btn.dataset.id)); });
                    return;
                }
            } catch (e) { console.error('apply date filter error', e); }
        });
        if (clearBtn) clearBtn.addEventListener('click', () => { try { document.getElementById('purchaseFromDate').value = ''; document.getElementById('purchaseToDate').value = ''; renderPurchaseHistory(); } catch(_){} });
    } catch (e) { console.warn('attach purchase history control handlers failed', e); }

    // Attach edit handlers
    container.querySelectorAll('.edit-purchase-btn').forEach(btn => {
        btn.addEventListener('click', () => loadPurchaseIntoForm(btn.dataset.id));
    });
    // Attach soft-delete handlers
    container.querySelectorAll('.soft-delete-purchase-btn').forEach(btn => {
        btn.addEventListener('click', () => softDeletePurchase(btn.dataset.id));
    });
}

// --- LOCAL SALE HELPERS ---
function addLocalSaleItemRow() {
    const container = document.getElementById('localSaleItemsContainer');
    if(!container) return;

    // Show product with its current stock
    const productOptions = state.products.map(p => `<option value="${p.id}">${p.name} (Stock: ${p.stock || 0})</option>`).join('');

    const row = document.createElement('div');
    row.className = 'grid grid-cols-12 gap-4 items-center local-sale-item-row';
    row.innerHTML = `
        <div class="col-span-6">
            <select class="local-sale-product-select w-full px-4 py-2 border border-gray-300 rounded-md">
                <option value="">Select a Product</option>
                ${productOptions}
            </select>
        </div>
        <div class="col-span-2">
            <input type="number" class="local-sale-quantity w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Qty" value="1" min="1">
        </div>
        <div class="col-span-3">
            <p class="local-sale-item-total text-right font-semibold">0.00</p>
        </div>
        <div class="col-span-1 text-right">
            <button type="button" class="remove-local-sale-item-btn text-red-500 hover:text-red-700 text-xl">&times;</button>
        </div>
    `;
    container.appendChild(row);
}

function updateLocalSaleTotals() {
    const rows = Array.from(document.querySelectorAll('.local-sale-item-row'));
    const items = rows.map(row => {
        const productId = row.querySelector('.local-sale-product-select').value;
        const quantity = parseInt(row.querySelector('.local-sale-quantity').value) || 0;
        const product = state.products.find(p => p.id === productId) || {};
        const price = typeof product.salePrice === 'number' ? product.salePrice : 0;
        const gstPercentage = product.gstPercentage || 0;
        const itemTotal = price * quantity; // displayed per-line total (unit x qty)
        row.querySelector('.local-sale-item-total').textContent = `${itemTotal.toFixed(2)}`;
        return { price, quantity, gstPercentage };
    });

    let gstComputed = { rates: {}, total: 0, subtotalEx: 0, subtotalInc: 0 };
    if (state.siteSettings.isGstEnabled) {
        gstComputed = computeGstForItems(items, !!state.siteSettings.pricesIncludeGst);
    } else {
        const sum = items.reduce((s, it) => s + (it.price * it.quantity), 0);
        gstComputed = { rates: {}, total: 0, subtotalEx: sum, subtotalInc: sum };
    }

    const displaySubtotal = state.siteSettings.pricesIncludeGst ? gstComputed.subtotalInc : gstComputed.subtotalEx;
    document.getElementById('localSaleSubtotal').textContent = `${displaySubtotal.toFixed(2)}`;
    const gstBreakdownEl = document.getElementById('localSaleGstBreakdown');
    gstBreakdownEl.innerHTML = Object.keys(gstComputed.rates).map(rate =>
        `<div class="flex justify-between"><span>GST (${rate}%) (₹):</span><span>${gstComputed.rates[rate].toFixed(2)}</span></div>`
    ).join('');
    const total = gstComputed.subtotalInc;
    document.getElementById('localSaleTotal').textContent = `${total.toFixed(2)}`;

    // Update Inclusive/Exclusive badge for Local Sale
    const modeBadge = document.getElementById('localSaleModeBadge');
    if (modeBadge) {
        if (state.siteSettings.pricesIncludeGst) {
            modeBadge.textContent = 'Inclusive mode';
            modeBadge.classList.remove('bg-gray-100','text-gray-700','border-gray-200');
            modeBadge.classList.add('bg-green-100','text-green-700','border-green-200');
        } else {
            modeBadge.textContent = 'Exclusive mode';
            modeBadge.classList.remove('bg-green-100','text-green-700','border-green-200');
            modeBadge.classList.add('bg-gray-100','text-gray-700','border-gray-200');
        }
    }
}

async function handleGenerateLocalInvoice(e) {
    e.preventDefault();
    const items = [];
    let stockError = false;

    document.querySelectorAll('.local-sale-item-row').forEach(row => {
        const productId = row.querySelector('.local-sale-product-select').value;
        const quantity = parseInt(row.querySelector('.local-sale-quantity').value) || 0;
        const product = state.products.find(p => p.id === productId);

        if (product && quantity > 0) {
            if ((product.stock || 0) < quantity) {
                showMessage(`Not enough stock for ${product.name}. Only ${product.stock || 0} available.`);
                stockError = true;
            }
            const item = {
                id: product.id,
                name: product.name,
                price: product.salePrice,
                quantity: quantity,
                gstPercentage: product.gstPercentage || 0,
                costAtSale: typeof product.purchasePrice === 'number' ? product.purchasePrice : 0,
            };
            items.push(item);
        }
    });

    if (stockError) return;
    if (items.length === 0) {
        showMessage("Please add at least one item to the invoice.");
        return;
    }

    // Compute GST consistently for local sale
    let gstComputed = { rates: {}, total: 0, subtotalEx: 0, subtotalInc: 0 };
    if (state.siteSettings.isGstEnabled) {
        gstComputed = computeGstForItems(items, !!state.siteSettings.pricesIncludeGst);
    } else {
        const sum = items.reduce((s, it) => s + (it.price * it.quantity), 0);
        gstComputed = { rates: {}, total: 0, subtotalEx: sum, subtotalInc: sum };
    }
    const totalAmount = gstComputed.subtotalInc;

    let gstInfo = { requested: false, number: '' };
    const isGstInvoice = document.getElementById('localSaleGstInvoice').checked;
    if (isGstInvoice) {
        gstInfo.requested = true;
        const raw = document.getElementById('localSaleGstNumber').value || '';
        const gstNum = raw.trim().toUpperCase();
        if (!GSTIN_REGEX.test(gstNum)) {
            showMessage('Please enter a valid GSTIN (e.g., 29ABCDE1234F1Z5).');
            return;
        }
        gstInfo.number = gstNum;
    }
    
    // Partial payment inputs and validations
    const receiveNowRaw = parseFloat(document.getElementById('localSaleReceiveNow')?.value || '0') || 0;
    const paymentMode = (document.getElementById('localSalePaymentMode')?.value) || 'cash';
    const selectedBank = document.getElementById('localSaleBankAccount')?.value || '';
    if (receiveNowRaw < 0) { showMessage('Receive Now cannot be negative.'); return; }
    if (receiveNowRaw > totalAmount) { showMessage('Receive Now cannot exceed Grand Total.'); return; }
    if (receiveNowRaw > 0 && paymentMode === 'bank' && !selectedBank) { showMessage('Please select a bank account.'); return; }
    const immediateAmount = Math.max(0, Math.min(receiveNowRaw, totalAmount));
    const remainingAmount = Math.max(0, totalAmount - immediateAmount);
    const isCreditSale = remainingAmount > 0 || !!document.getElementById('localSaleIsCredit')?.checked;
    const editingLocalSaleId = (document.getElementById('editingLocalSaleId')?.value || '').trim();
    const existingSale = editingLocalSaleId ? (state.allLocalSales || []).find(s => s.id === editingLocalSaleId) : null;
    let invoiceNumber;
    if (editingLocalSaleId) {
        invoiceNumber = existingSale?.invoiceNumber || editingLocalSaleId;
    } else {
        const rawLocalCounter = await getAndIncrementCounter('localSales');
        invoiceNumber = formatInvoiceFromCounter(rawLocalCounter, 'localSales');
    }

    // Store data for the invoice page and for saving
    const localSaleDocData = {
        invoiceNumber,
        customerName: document.getElementById('customerName').value,
        saleDate: new Date(document.getElementById('saleDate').value),
        items,
        subtotal: state.siteSettings.pricesIncludeGst ? gstComputed.subtotalInc : gstComputed.subtotalEx,
        gstBreakdown: { rates: gstComputed.rates, total: gstComputed.total },
        totalAmount,
        gstInfo,
        paymentMode: immediateAmount>0 ? paymentMode : undefined,
        receivedNow: immediateAmount>0 ? { amount: immediateAmount, mode: paymentMode, bankAccount: (paymentMode==='bank' ? selectedBank : undefined) } : undefined,
        ...(editingLocalSaleId ? { updatedAt: serverTimestamp() } : { createdAt: serverTimestamp() })
    };
    
    state.localSaleData = localSaleDocData; // for immediate navigation

    // Batch write to update stock and save local sale record
    try {
        const batch = writeBatch(db);
        if (editingLocalSaleId && existingSale) {
            // Adjust stock by delta: previous sale decreased stock; delta = (origQty - newQty)
            const origMap = new Map(); (existingSale.items || []).forEach(it => { origMap.set(it.id, (origMap.get(it.id)||0) + (it.quantity||0)); });
            const newMap = new Map(); items.forEach(it => { newMap.set(it.id, (newMap.get(it.id)||0) + (it.quantity||0)); });
            const pids = new Set([...origMap.keys(), ...newMap.keys()]);
            for (const pid of pids) {
                const delta = (origMap.get(pid)||0) - (newMap.get(pid)||0);
                if (delta !== 0) { batch.update(doc(db, productsColPath, pid), { stock: increment(delta) }); }
            }

            const localSaleRef = doc(db, localSalesColPath, editingLocalSaleId);
            batch.set(localSaleRef, { ...localSaleDocData, isCreditSale }, { merge: true });

            // Ledgers: Debtors entry for remaining credit, immediate receipt in cash/bank with stable '-immediate' id
            const debtRef = doc(db, debtorsLedgerColPath, editingLocalSaleId);
            const cashImmRef = doc(db, cashLedgerColPath, `${editingLocalSaleId}-immediate`);
            const bankImmRef = doc(db, bankLedgerColPath, `${editingLocalSaleId}-immediate`);

            if (remainingAmount > 0) {
                batch.set(debtRef, {
                    partyName: localSaleDocData.customerName || 'Customer',
                    date: localSaleDocData.saleDate,
                    refType: 'Local Sale',
                    refId: editingLocalSaleId,
                    invoiceNumber: localSaleDocData.invoiceNumber,
                    debit: remainingAmount,
                    credit: 0,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            } else {
                batch.set(debtRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
            }

            if (immediateAmount > 0) {
                const payload = {
                    date: localSaleDocData.saleDate,
                    refType: 'Local Sale (Receipt)',
                    refId: editingLocalSaleId,
                    invoiceNumber: localSaleDocData.invoiceNumber,
                    notes: `From ${localSaleDocData.customerName || 'Customer'}`,
                    debit: immediateAmount,
                    credit: 0,
                    bankAccount: (paymentMode==='bank' ? selectedBank : undefined),
                    reconciled: false,
                    isDeleted: false,
                    updatedAt: serverTimestamp(),
                };
                if (paymentMode === 'bank') {
                    batch.set(bankImmRef, payload, { merge: true });
                    batch.set(cashImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                } else {
                    batch.set(cashImmRef, payload, { merge: true });
                    batch.set(bankImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                }
            } else {
                // No immediate amount now; clear both immediate entries if present
                batch.set(cashImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
                batch.set(bankImmRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
            }

            await batch.commit();
            state.localSaleData.id = editingLocalSaleId;
            showMessage('Local sale updated successfully.');
            state.previousRoute = { page: state.currentPage, adminTab: state.adminCurrentTab };
            navigateTo('local_sale_invoice', editingLocalSaleId);
        } else {
            // NEW sale path (existing behaviour)
            items.forEach(item => {
                const productRef = doc(db, productsColPath, item.id);
                batch.update(productRef, { stock: increment(-item.quantity) });
            });

            const localSaleRef = doc(collection(db, localSalesColPath));
            batch.set(localSaleRef, { ...localSaleDocData, isCreditSale });

            if (remainingAmount > 0) {
                try { await ensurePartyExists(localSaleDocData.customerName, 'customer'); } catch {}
                const debtRef = doc(db, debtorsLedgerColPath, localSaleRef.id);
                batch.set(debtRef, {
                    partyName: localSaleDocData.customerName || 'Customer',
                    date: localSaleDocData.saleDate,
                    refType: 'Local Sale',
                    refId: localSaleRef.id,
                    invoiceNumber: localSaleDocData.invoiceNumber,
                    debit: remainingAmount,
                    credit: 0,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                });
            }
            if (immediateAmount > 0) {
                const payload = {
                    date: localSaleDocData.saleDate,
                    refType: 'Local Sale (Receipt)',
                    refId: localSaleRef.id,
                    invoiceNumber: localSaleDocData.invoiceNumber,
                    notes: `From ${localSaleDocData.customerName || 'Customer'}`,
                    debit: immediateAmount,
                    credit: 0,
                    bankAccount: (paymentMode==='bank' ? selectedBank : undefined),
                    reconciled: false,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                };
                if (paymentMode === 'bank') {
                    const bankRef = doc(db, bankLedgerColPath, `${localSaleRef.id}-immediate`);
                    batch.set(bankRef, payload);
                } else {
                    const cashRef = doc(db, cashLedgerColPath, `${localSaleRef.id}-immediate`);
                    batch.set(cashRef, payload);
                }
            }

            await batch.commit();
            state.localSaleData.id = localSaleRef.id;
            state.previousRoute = { page: state.currentPage, adminTab: state.adminCurrentTab };
            navigateTo('local_sale_invoice', localSaleRef.id);
        }

    } catch (error) {
        console.error("Error finalizing local sale:", error);
        showMessage("Failed to finalize sale. Invoice not generated.");
    }
}


function openNewProductModal(triggeringSelect) {
    window.newProductTriggerSelect = triggeringSelect; // Save the select element
   const modal = document.getElementById('newProductModal');
   if (!modal) return;
   modal.classList.remove('hidden');
   // Ensure proper display when showing
   if (!modal.classList.contains('flex')) modal.classList.add('flex');
   // Populate product group select from state (if available)
   try {
       const pgSel = document.getElementById('modalProductGroup');
       if (pgSel) {
           // Clear existing options except the placeholder
           pgSel.innerHTML = '<option value="">— Select group —</option>';
           if (Array.isArray(state.productGroups) && state.productGroups.length) {
               state.productGroups.forEach(g => {
                   const opt = document.createElement('option');
                   opt.value = g.name || g.id || g;
                   opt.textContent = g.name || g.id || g;
                   pgSel.appendChild(opt);
               });
               // If first group exists, keep placeholder but don't auto-select; leave user choice
           }
       }
   } catch (e) { /* ignore if state not ready */ }
   // Ensure modal handlers are attached (defensive): this fixes cases where
   // handlers were not bound earlier due to load order. Use a window flag
   // to avoid double-binding.
   try {
       // Rebind modal handlers every time to handle cases where modal DOM
       // nodes are recreated. Use `.onclick` to overwrite prior handlers.
       const showModalNewGroupBtn = document.getElementById('showModalNewProductGroupBtn');
       const modalNewGroupRow = document.getElementById('modalNewProductGroupRow');
       const modalNewGroupNameInput = document.getElementById('modalNewProductGroupName');
       const modalAddGroupBtn = document.getElementById('modalAddProductGroupInlineBtn');
       const modalCancelNewGroupBtn = document.getElementById('modalCancelNewProductGroupBtn');
       const modalProductGroupSel = document.getElementById('modalProductGroup');
       if (showModalNewGroupBtn && modalNewGroupRow) {
           showModalNewGroupBtn.onclick = (ev) => {
               ev.preventDefault();
               modalNewGroupRow.classList.toggle('hidden');
               if (!modalNewGroupRow.classList.contains('hidden')) setTimeout(() => modalNewGroupNameInput && modalNewGroupNameInput.focus(), 50);
           };
       }
       if (modalCancelNewGroupBtn && modalNewGroupRow) {
           modalCancelNewGroupBtn.onclick = (ev) => { ev.preventDefault(); modalNewGroupRow.classList.add('hidden'); if (modalNewGroupNameInput) modalNewGroupNameInput.value = ''; };
       }
       if (modalAddGroupBtn) {
           // ensure enabled
           try { modalAddGroupBtn.disabled = false; modalAddGroupBtn.removeAttribute && modalAddGroupBtn.removeAttribute('disabled'); } catch(_) {}
           modalAddGroupBtn.onclick = async (ev) => {
               try {
                   ev && ev.preventDefault && ev.preventDefault();
                   const name = (modalNewGroupNameInput?.value || '').trim();
                   console.debug('modalAddGroupBtn clicked, name=', name);
                   if (!name) { showMessage('Enter a group name.'); return; }
                   const exists = (state.productGroups || []).some(g => (g.name || '').trim().toLowerCase() === name.toLowerCase());
                   if (exists) { showMessage('A product group with this name already exists.'); return; }
                   showMessage('Adding product group...');
                   const ref = await addDoc(collection(db, productGroupsColPath), { name, createdAt: serverTimestamp() });
                   state.productGroups = [{ id: ref.id, name }, ...(state.productGroups || [])];
                   if (modalProductGroupSel) {
                       // rebuild from state
                       modalProductGroupSel.innerHTML = '<option value="">— Select group —</option>' + (state.productGroups || []).map(g => `<option value="${(g.name||g)}">${(g.name||g)}</option>`).join('');
                       modalProductGroupSel.value = name;
                   }
                   showMessage('Product group added.');
                   if (modalNewGroupNameInput) modalNewGroupNameInput.value = '';
                   if (modalNewGroupRow) modalNewGroupRow.classList.add('hidden');
                   try { if (state.currentPage === 'admin') { if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage(); else if (state.adminCurrentTab === 'products') renderAdminProductList(); } } catch (_) {}
               } catch (err) {
                   console.error('Failed to add product group (modal):', err);
                   showMessage('Failed to add product group.');
               }
           };
       }
   } catch (_) {}
}

function closeNewProductModal() {
    try {
        if (window.newProductTriggerSelect) {
            try {
                const sel = window.newProductTriggerSelect;
                if (sel && typeof sel.value !== 'undefined') {
                    sel.value = '';
                    try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                }
            } catch (_) {}
        }
        window.newProductTriggerSelect = null;
    } catch(_) {}
    const modal = document.getElementById('newProductModal');
   if (!modal) return;
   const form = modal.querySelector('form');
   if (form) { try { form.reset(); } catch(_) {} }
    // Hide and remove display flex to avoid CSS precedence issues
    try { modal.classList.add('hidden'); modal.classList.remove('flex'); } catch(_) { modal.classList.add('hidden'); }
}

document.getElementById('closeNewProductModalBtn').addEventListener('click', closeNewProductModal);
document.getElementById('cancelNewProductBtn').addEventListener('click', closeNewProductModal);
        
initializeAppAndListeners();

// --- ADMIN LEDGERS PAGE RENDERER ---
function renderAdminLedgersPage() {
    const container = document.getElementById('adminLedgersContainer');
    if (!container) return;
    // Ensure UI state bag exists
    state.ui = state.ui || {};

    // Date range filter
    const start = new Date(state.ledgerStartDate); start.setHours(0,0,0,0);
    const end = new Date(state.ledgerEndDate); end.setHours(23,59,59,999);
    const inRange = (d) => {
        const dt = _toDate(d) || new Date(d?.seconds ? d.seconds*1000 : Date.now());
        return dt >= start && dt <= end;
    };

    // Group creditors by supplierName and compute balances (credits - debits)
    const creditorsByParty = {};
    for (const e of (state.allCreditorsLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date))) {
        const name = e.partyName || 'Supplier';
        if (!creditorsByParty[name]) creditorsByParty[name] = { debit: 0, credit: 0 };
        creditorsByParty[name].debit += Number(e.debit || 0);
        creditorsByParty[name].credit += Number(e.credit || 0);
    }
    // Prepare creditors list and paginate (per-pane size)
    const creditorsList = Object.entries(creditorsByParty).map(([name, sums]) => ({ name, debit: sums.debit, credit: sums.credit }));
    const creditorsTotal = creditorsList.length;
    const creditorsPageSize = state.creditorsPageSize || state.ledgerPageSize || 10;
    const creditorsPage = state.creditorsPage || 1;
    const creditorsTotalPages = Math.max(1, Math.ceil(creditorsTotal / creditorsPageSize));
    const creditorsSlice = creditorsList.slice((creditorsPage - 1) * creditorsPageSize, creditorsPage * creditorsPageSize);
    const creditorsRows = (creditorsSlice.length ? creditorsSlice.map(item => {
        const name = item.name;
        const sums = { debit: item.debit, credit: item.credit };
        const bal = (sums.credit - sums.debit);
        // Show GST registration badge when we can find the supplier in master data
        let regBadgeHtml = '';
        try {
            const party = (state.allSuppliers || []).find(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
            if (party) {
                const reg = (typeof party.isGstRegistered !== 'undefined') ? !!party.isGstRegistered : !!((party.gstin || '').trim());
                if (reg) regBadgeHtml = ` <span class="ml-2 text-xs text-green-600 font-medium">GST</span>`;
                else regBadgeHtml = ` <span class="ml-2 text-xs text-orange-600">Not GST</span>`;
            }
        } catch (_) {}
        return `<tr class="border-b text-sm hover:bg-gray-50 cursor-pointer party-row" data-ledger="creditors" data-party="${name.replace(/"/g,'&quot;')}"><td class="p-3">${name}${regBadgeHtml}</td><td class="p-3 text-right">${sums.debit ? sums.debit.toFixed(2) : '-'}</td><td class="p-3 text-right">${sums.credit ? sums.credit.toFixed(2) : '-'}</td><td class="p-3 text-right font-semibold">${bal.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="p-3 text-center text-gray-500">No creditors yet</td></tr>`);
    const creditorsPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${creditorsPageSize===n? 'selected':''}>${n}</option>`).join('');
    const creditorsPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${creditorsSlice.length ? ((creditorsPage - 1) * creditorsPageSize + 1) : 0} - ${((creditorsPage - 1) * creditorsPageSize) + creditorsSlice.length} of ${creditorsTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="creditorsFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${creditorsPage<=1? 'disabled':''}>First</button><button id="creditorsPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${creditorsPage<=1? 'disabled':''}>Prev</button><input id="creditorsPageInput" type="number" min="1" max="${creditorsTotalPages}" value="${creditorsPage}" class="w-14 text-center border rounded p-1" /><button id="creditorsNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${creditorsPage>=creditorsTotalPages? 'disabled':''}>Next</button><button id="creditorsLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${creditorsPage>=creditorsTotalPages? 'disabled':''}>Last</button><select id="creditorsPageSizeSel" class="border rounded p-1 text-sm">${creditorsPageSizeOptions}</select></div></div>`;

    // Group debtors by customerName and compute balances (debits - credits)
    const debtorsByParty = {};
    for (const e of (state.allDebtorsLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date))) {
        const name = e.partyName || 'Customer';
        if (!debtorsByParty[name]) debtorsByParty[name] = { debit: 0, credit: 0 };
        debtorsByParty[name].debit += Number(e.debit || 0);
        debtorsByParty[name].credit += Number(e.credit || 0);
    }
    // Prepare debtors list and paginate (per-pane size)
    const debtorsList = Object.entries(debtorsByParty).map(([name, sums]) => ({ name, debit: sums.debit, credit: sums.credit }));
    const debtorsTotal = debtorsList.length;
    const debtorsPageSize = state.debtorsPageSize || state.ledgerPageSize || 10;
    const debtorsPage = state.debtorsPage || 1;
    const debtorsTotalPages = Math.max(1, Math.ceil(debtorsTotal / debtorsPageSize));
    const debtorsSlice = debtorsList.slice((debtorsPage - 1) * debtorsPageSize, debtorsPage * debtorsPageSize);
    const debtorsRows = (debtorsSlice.length ? debtorsSlice.map(item => {
        const name = item.name;
        const sums = { debit: item.debit, credit: item.credit };
        const bal = (sums.debit - sums.credit);
        // Show GST registration badge when we can find the customer in master data
        let regBadgeHtml = '';
        try {
            const party = (state.allCustomers || []).find(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
            if (party) {
                const reg = (typeof party.isGstRegistered !== 'undefined') ? !!party.isGstRegistered : !!((party.gstin || '').trim());
                if (reg) regBadgeHtml = ` <span class="ml-2 text-xs text-green-600 font-medium">GST</span>`;
                else regBadgeHtml = ` <span class="ml-2 text-xs text-orange-600">Not GST</span>`;
            }
        } catch (_) {}
        return `<tr class="border-b text-sm hover:bg-gray-50 cursor-pointer party-row" data-ledger="debtors" data-party="${name.replace(/"/g,'&quot;')}"><td class="p-3">${name}${regBadgeHtml}</td><td class="p-3 text-right">${sums.debit ? sums.debit.toFixed(2) : '-'}</td><td class="p-3 text-right">${sums.credit ? sums.credit.toFixed(2) : '-'}</td><td class="p-3 text-right font-semibold">${bal.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="p-3 text-center text-gray-500">No debtors yet</td></tr>`);
    const debtorsPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${debtorsPageSize===n? 'selected':''}>${n}</option>`).join('');
    const debtorsPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${debtorsSlice.length ? ((debtorsPage - 1) * debtorsPageSize + 1) : 0} - ${((debtorsPage - 1) * debtorsPageSize) + debtorsSlice.length} of ${debtorsTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="debtorsFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage<=1? 'disabled':''}>First</button><button id="debtorsPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage<=1? 'disabled':''}>Prev</button><input id="debtorsPageInput" type="number" min="1" max="${debtorsTotalPages}" value="${debtorsPage}" class="w-14 text-center border rounded p-1" /><button id="debtorsNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage>=debtorsTotalPages? 'disabled':''}>Next</button><button id="debtorsLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage>=debtorsTotalPages? 'disabled':''}>Last</button><select id="debtorsPageSizeSel" class="border rounded p-1 text-sm">${debtorsPageSizeOptions}</select></div></div>`;

    // Populate quick 'pending' lists in Quick Postings area (prefill forms on action)
    try {
        const pendingSupContainer = document.getElementById('pendingSupplierPayments');
        const pendingCustContainer = document.getElementById('pendingCustomerReceipts');
        if (pendingSupContainer) {
            // use creditorsByParty computed above; balance = credit - debit -> positive means we owe supplier
            const pendingSuppliers = Object.entries(creditorsByParty).map(([name, sums]) => ({ name, balance: (sums.credit - sums.debit) })).filter(p => p.balance > 0);
            if (pendingSuppliers.length) {
                pendingSupContainer.innerHTML = pendingSuppliers.map(p => `
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="font-medium">${p.name}</div>
                            <div class="text-xs text-gray-500">Due: ₹${p.balance.toFixed(2)}</div>
                        </div>
                        <div>
                            <button class="pay-supplier-btn bg-green-600 text-white px-3 py-1 rounded" data-party="${p.name.replace(/"/g,'&quot;')}" data-amount="${p.balance}">Pay</button>
                        </div>
                    </div>
                `).join('');
            } else {
                pendingSupContainer.innerHTML = `<p class="text-gray-500">No pending supplier payments.</p>`;
            }
        }
        if (pendingCustContainer) {
            // debtorsByParty computed above; balance = debit - credit -> positive means customer owes us
            const pendingCustomers = Object.entries(debtorsByParty).map(([name, sums]) => ({ name, balance: (sums.debit - sums.credit) })).filter(p => p.balance > 0);
            if (pendingCustomers.length) {
                pendingCustContainer.innerHTML = pendingCustomers.map(p => `
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="font-medium">${p.name}</div>
                            <div class="text-xs text-gray-500">Outstanding: ₹${p.balance.toFixed(2)}</div>
                        </div>
                        <div>
                            <button class="receive-customer-btn bg-indigo-600 text-white px-3 py-1 rounded" data-party="${p.name.replace(/"/g,'&quot;')}" data-amount="${p.balance}">Receive</button>
                        </div>
                    </div>
                `).join('');
            } else {
                pendingCustContainer.innerHTML = `<p class="text-gray-500">No pending customer receipts.</p>`;
            }
        }

        // Attach click handlers to prefill forms
        document.querySelectorAll('.pay-supplier-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const b = ev.currentTarget;
                const party = b.getAttribute('data-party') || '';
                const amount = b.getAttribute('data-amount') || '';
                const spPartyEl = document.getElementById('spParty');
                const spAmountEl = document.getElementById('spAmount');
                if (spPartyEl) spPartyEl.value = party;
                if (spAmountEl) spAmountEl.value = Number(amount).toFixed(2);
                spAmountEl?.focus();
            });
        });
        document.querySelectorAll('.receive-customer-btn').forEach(btn => {
            btn.addEventListener('click', (ev) => {
                const b = ev.currentTarget;
                const party = b.getAttribute('data-party') || '';
                const amount = b.getAttribute('data-amount') || '';
                const crPartyEl = document.getElementById('crParty');
                const crAmountEl = document.getElementById('crAmount');
                if (crPartyEl) crPartyEl.value = party;
                if (crAmountEl) crAmountEl.value = Number(amount).toFixed(2);
                crAmountEl?.focus();
            });
        });
    } catch (err) {
        console.error('Failed to populate pending lists:', err);
    }

    // Summary balances across filtered range
    const cashInRange = (state.allCashLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date));
    const bankInRangeAll = (state.allBankLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date));
    const cashBalance = cashInRange.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const bankBalance = bankInRangeAll.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);

    // Cash book rows
    // Sorting helpers for ledgers
    function sortLedgerEntries(arr, sortState) {
        const out = Array.isArray(arr) ? arr.slice() : [];
        const key = sortState?.key || 'date';
        const dir = sortState?.dir === 'asc' ? 1 : -1;
        out.sort((a,b) => {
            try {
                const va = (key === 'date') ? (_toDate(a.date)?.getTime() || 0) : (a[key] || '');
                const vb = (key === 'date') ? (_toDate(b.date)?.getTime() || 0) : (b[key] || '');
                if (va < vb) return -1 * dir;
                if (va > vb) return 1 * dir;
                return 0;
            } catch (_) { return 0; }
        });
        return out;
    }

    function toggleLedgerSort(which, key) {
        try {
            const stateKey = which === 'cash' ? 'cashSort' : 'bankSort';
            const s = state[stateKey] || { key: 'date', dir: 'desc' };
            if (s.key === key) s.dir = s.dir === 'asc' ? 'desc' : 'asc'; else { s.key = key; s.dir = 'asc'; }
            state[stateKey] = s;
        } catch (_) {}
    }

    const cashEntries = sortLedgerEntries((state.allCashLedger || []).filter(x => !x.isDeleted), state.cashSort)
        .filter(x => inRange(x.date));
    // Cash pagination (use per-pane size if present)
    const cashPageSize = state.cashPageSize || state.ledgerPageSize || 10;
    const cashPage = state.cashPage || 1;
    const cashTotal = cashEntries.length;
    const cashTotalPages = Math.max(1, Math.ceil(cashTotal / cashPageSize));
    const cashBefore = cashEntries.slice(0, (cashPage - 1) * cashPageSize);
    let cashRun = cashBefore.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const cashSlice = cashEntries.slice((cashPage - 1) * cashPageSize, cashPage * cashPageSize);
    const cashRows = (cashSlice.length ? cashSlice.map(e => {
        const d = formatDateTime(e.date);
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        cashRun += (debit - credit);
    const ref = e.refId || '';
    const notes = e.notes || '';
    const refHtml = ref ? `<button type="button" class="text-blue-600 underline text-sm ref-link" data-ref="${ref}">${ref}</button>` : '';
    return `<tr class="border-b text-sm"><td class="p-2">${d}</td><td class="p-2">${e.refType || ''}</td><td class="p-2">${refHtml}</td><td class="p-2">${notes}</td><td class="p-2 text-right text-green-700">${debit?debit.toFixed(2):'-'}</td><td class="p-2 text-right text-red-600">${credit?credit.toFixed(2):'-'}</td><td class="p-2 text-right font-semibold">${cashRun.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="p-3 text-center text-gray-500">No cash entries in range</td></tr>`);
    const cashPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${cashPageSize===n? 'selected':''}>${n}</option>`).join('');
    const cashPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${cashSlice.length ? ((cashPage - 1) * cashPageSize + 1) : 0} - ${((cashPage - 1) * cashPageSize) + cashSlice.length} of ${cashTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="cashFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage<=1? 'disabled':''}>First</button><button id="cashPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage<=1? 'disabled':''}>Prev</button><input id="cashPageInput" type="number" min="1" max="${cashTotalPages}" value="${cashPage}" class="w-14 text-center border rounded p-1" /><button id="cashNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage>=cashTotalPages? 'disabled':''}>Next</button><button id="cashLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage>=cashTotalPages? 'disabled':''}>Last</button><select id="cashPageSizeSel" class="border rounded p-1 text-sm">${cashPageSizeOptions}</select></div></div>`;

    // Bank book rows with account filter
    const selectedBank = state.bankAccountFilter || 'All';
    const allBankAccounts = (state.allBanks || []).map(b => b.name).filter(Boolean);
    const bankEntries = sortLedgerEntries((state.allBankLedger || []).filter(x => !x.isDeleted), state.bankSort)
        .filter(x => inRange(x.date))
        .filter(x => selectedBank === 'All' ? true : ((x.bankAccount || 'Main Bank') === selectedBank));
    // Bank pagination (use per-pane size if present)
    const bankPageSize = state.bankPageSize || state.ledgerPageSize || 10;
    const bankPage = state.bankPage || 1;
    const bankTotal = bankEntries.length;
    const bankTotalPages = Math.max(1, Math.ceil(bankTotal / bankPageSize));
    const bankBefore = bankEntries.slice(0, (bankPage - 1) * bankPageSize);
    let bankRun = bankBefore.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const bankSlice = bankEntries.slice((bankPage - 1) * bankPageSize, bankPage * bankPageSize);
    const bankRows = (bankSlice.length ? bankSlice.map(e => {
        const d = formatDateTime(e.date);
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        bankRun += (debit - credit);
        const ref = e.refId || '';
        const notes = e.notes || '';
        const acct = e.bankAccount || 'Main Bank';
        const rec = e.reconciled ? '✓' : '';
        return `<tr class="border-b text-sm"><td class="p-2">${d}</td><td class="p-2">${e.refType || ''}</td><td class="p-2">${ref}</td><td class="p-2">${notes}</td><td class="p-2">${acct}</td><td class="p-2 text-center">${rec}</td><td class="p-2 text-right text-green-700">${debit?debit.toFixed(2):'-'}</td><td class="p-2 text-right text-red-600">${credit?credit.toFixed(2):'-'}</td><td class="p-2 text-right font-semibold">${bankRun.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="p-3 text-center text-gray-500">No bank entries in range</td></tr>`);
    const bankPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${bankPageSize===n? 'selected':''}>${n}</option>`).join('');
    const bankPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${bankSlice.length ? ((bankPage - 1) * bankPageSize + 1) : 0} - ${((bankPage - 1) * bankPageSize) + bankSlice.length} of ${bankTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="bankFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${bankPage<=1? 'disabled':''}>First</button><button id="bankPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${bankPage<=1? 'disabled':''}>Prev</button><input id="bankPageInput" type="number" min="1" max="${bankTotalPages}" value="${bankPage}" class="w-14 text-center border rounded p-1" /><button id="bankNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${bankPage>=bankTotalPages? 'disabled':''}>Next</button><button id="bankLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${bankPage>=bankTotalPages? 'disabled':''}>Last</button><select id="bankPageSizeSel" class="border rounded p-1 text-sm">${bankPageSizeOptions}</select></div></div>`;

    // Party Directory filters and lists
    const supSearchVal = state.partySearchSuppliers || '';
    const custSearchVal = state.partySearchCustomers || '';
    const qSup = supSearchVal.trim().toLowerCase();
    const qCust = custSearchVal.trim().toLowerCase();
    const allSuppliersList = (state.allSuppliers || []);
    const allCustomersList = (state.allCustomers || []);
    // filter lists
    const filteredSuppliers = allSuppliersList.filter(s => {
        const n = (s.name || '').toLowerCase();
        const g = (s.gstin || '').toLowerCase();
        return !qSup || n.includes(qSup) || g.includes(qSup);
    });
    const filteredCustomers = allCustomersList.filter(c => {
        const n = (c.name || '').toLowerCase();
        const g = (c.gstin || '').toLowerCase();
        return !qCust || n.includes(qCust) || g.includes(qCust);
    });

    // --- Sorting & Pagination for party tables ---
    // Load persisted sort preferences (per type) from localStorage
    const loadSort = (type) => {
        try { return JSON.parse(localStorage.getItem(`party_sort_${type}`) || 'null'); } catch(_) { return null; }
    };
    const saveSort = (type, cfg) => {
        try { localStorage.setItem(`party_sort_${type}`, JSON.stringify(cfg)); } catch(_) {}
    };

    // pagination state (persist in state.ui)
    state.ui = state.ui || {};
    state.ui.partySuppliersPage = state.ui.partySuppliersPage || 1;
    state.ui.partyCustomersPage = state.ui.partyCustomersPage || 1;
    state.ui.partyPageSize = state.ui.partyPageSize || 25; // default page size

    const applySortAndPaginate = (list, type) => {
        const sortCfg = loadSort(type) || { key: null, dir: 'asc' };
        let arr = Array.isArray(list) ? list.slice() : [];
        if (sortCfg && sortCfg.key) {
            const k = sortCfg.key;
            arr.sort((a,b) => {
                const va = ((a[k] || '') + '').toString().toLowerCase();
                const vb = ((b[k] || '') + '').toString().toLowerCase();
                if (va < vb) return sortCfg.dir === 'asc' ? -1 : 1;
                if (va > vb) return sortCfg.dir === 'asc' ? 1 : -1;
                return 0;
            });
            // Optionally apply sort to internal state arrays for persistence
            try {
                if (type === 'suppliers') state.allSuppliers = arr.slice();
                if (type === 'customers') state.allCustomers = arr.slice();
            } catch (_) {}
        }
        // pagination
        const page = type === 'suppliers' ? (state.ui.partySuppliersPage || 1) : (state.ui.partyCustomersPage || 1);
        const pageSize = state.ui.partyPageSize || 25;
        const total = arr.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const normalizedPage = Math.min(Math.max(1, page), totalPages);
        if (type === 'suppliers') state.ui.partySuppliersPage = normalizedPage; else state.ui.partyCustomersPage = normalizedPage;
        const start = (normalizedPage - 1) * pageSize;
        const slice = arr.slice(start, start + pageSize);
        return { slice, total, totalPages, page: normalizedPage, pageSize };
    };

    const suppliersPaged = applySortAndPaginate(filteredSuppliers, 'suppliers');
    const customersPaged = applySortAndPaginate(filteredCustomers, 'customers');
    const supSort = loadSort('suppliers') || { key: null, dir: 'asc' };
    const custSort = loadSort('customers') || { key: null, dir: 'asc' };
    const suppliersListHTML = (suppliersPaged.slice).map(s=>{ 
        const pid=(state.__primarySuppliers||[]).find(p=>(p.name||'').toLowerCase()===(s.name||'').toLowerCase())?.id||'';
        const n=(s.name||'').replace(/"/g,'&quot;');
        const g=(s.gstin||'').replace(/"/g,'&quot;');
        const a=(s.address||'').replace(/"/g,'&quot;');
        const gstCell = s.gstin ? `<span class="inline-block">${g}</span><button type=\"button\" class=\"copy-gstin-btn text-gray-500 text-xs ml-2\" data-gstin=\"${g}\" title=\"Copy GSTIN\">Copy</button>` : '-';
        const em = (s.email||'').replace(/"/g,'&quot;');
        const emailCell = em ? `<a href=\"mailto:${em}\" class=\"text-sm text-blue-600 underline\">${em}</a>` : '-';
        return `<tr class="border-b text-sm"><td class="p-2 align-top font-medium">${s.name}</td><td class="p-2 align-top text-xs text-gray-600">${gstCell}</td><td class="p-2 align-top text-xs text-gray-700">${emailCell}</td><td class="p-2 align-top text-sm text-gray-700">${s.address? a : '-'}</td><td class="p-2 text-right"><div class="inline-flex items-center justify-end"><button type=\"button\" class=\"text-blue-600 text-xs underline edit-party-btn\" data-type=\"supplier\" data-name=\"${n}\" data-gstin=\"${g}\" data-address=\"${a}\" data-docid=\"${pid}\">Edit</button><button type=\"button\" class=\"text-red-600 text-xs underline ml-3 delete-party-btn\" data-type=\"supplier\" data-name=\"${n}\" data-docid=\"${pid}\">Delete</button></div></td></tr>`;
    }).join('') || `<tr><td colspan="5" class="p-3 text-gray-500">None</td></tr>`;
    const customersListHTML = (customersPaged.slice).map(c=>{ 
        const pid=(state.__primaryCustomers||[]).find(p=>(p.name||'').toLowerCase()===(c.name||'').toLowerCase())?.id||'';
        const n=(c.name||'').replace(/"/g,'&quot;');
        const g=(c.gstin||'').replace(/"/g,'&quot;');
        const a=(c.address||'').replace(/"/g,'&quot;');
        const gstCell = c.gstin ? `<span class="inline-block">${g}</span><button type=\"button\" class=\"copy-gstin-btn text-gray-500 text-xs ml-2\" data-gstin=\"${g}\" title=\"Copy GSTIN\">Copy</button>` : '-';
        const em = (c.email||'').replace(/"/g,'&quot;');
        const emailCell = em ? `<a href=\"mailto:${em}\" class=\"text-sm text-blue-600 underline\">${em}</a>` : '-';
        return `<tr class="border-b text-sm"><td class="p-2 align-top font-medium">${c.name}</td><td class="p-2 align-top text-xs text-gray-600">${gstCell}</td><td class="p-2 align-top text-xs text-gray-700">${emailCell}</td><td class="p-2 align-top text-sm text-gray-700">${c.address? a : '-'}</td><td class="p-2 text-right"><div class="inline-flex items-center justify-end"><button type=\"button\" class=\"text-blue-600 text-xs underline edit-party-btn\" data-type=\"customer\" data-name=\"${n}\" data-gstin=\"${g}\" data-address=\"${a}\" data-docid=\"${pid}\">Edit</button><button type=\"button\" class=\"text-red-600 text-xs underline ml-3 delete-party-btn\" data-type=\"customer\" data-name=\"${n}\" data-docid=\"${pid}\">Delete</button></div></td></tr>`;
    }).join('') || `<tr><td colspan="5" class="p-3 text-gray-500">None</td></tr>`;
    const isAddCollapsed = !!state.ui.partyAddCollapsed;
    const isListCollapsed = !!state.ui.partyListCollapsed;

    container.innerHTML = `
        <div class="grid grid-cols-1 gap-6"> <!-- removed lg:grid-cols-3 -->
        <!-- Ledger Entry Modal is created dynamically and appended to document.body to avoid being replaced during re-renders -->
        <div class="space-y-6"> <!-- removed lg:col-span-2 -->
        <div class="flex items-end gap-4 mb-4">
            <div>
                <label class="block text-sm text-gray-700">Start Date</label>
                <div class="flex items-center gap-2">
                    <input type="date" id="ledgerStartDate" class="border rounded p-2" value="${state.ledgerStartDate}">
                    <label class="text-sm flex items-center"><input type="checkbox" id="ledgerStartToday" class="mr-2" ${state.ledgerStartUseToday ? 'checked' : ''} />Today</label>
                </div>
            </div>
            <div>
                <label class="block text-sm text-gray-700">End Date</label>
                <input type="date" id="ledgerEndDate" class="border rounded p-2" value="${state.ledgerEndDate}">
            </div>
            <button id="applyLedgerDateBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Apply</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-white rounded shadow p-4">
              <div class="text-sm text-gray-500">Cash Balance (in range)</div>
              <div class="text-2xl font-bold">₹${cashBalance.toFixed(2)}</div>
            </div>
            <div class="bg-white rounded shadow p-4">
              <div class="text-sm text-gray-500">Bank Balance (in range)</div>
              <div class="text-2xl font-bold">₹${bankBalance.toFixed(2)}</div>
            </div>
            <div class="bg-white rounded shadow p-4">
              <div class="text-sm text-gray-500">Total Balance (in range)</div>
              <div class="text-2xl font-bold">₹${(cashBalance+bankBalance).toFixed(2)}</div>
            </div>
        </div>
        <div class="flex items-center justify-end gap-2 mb-2">
            <label class="text-sm text-gray-600 mr-2">Reorder:</label>
            <button id="moveCashUpBtn" class="px-2 py-1 border rounded text-sm">Cash ↑</button>
            <button id="moveBankUpBtn" class="px-2 py-1 border rounded text-sm">Bank ↑</button>
        </div>
        <div id="ledgerBooksGrid" class="grid grid-cols-1 gap-8 mb-8">
            <div class="bg-white p-6 rounded-lg shadow">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xl font-bold">Cash Book</h3>
                        <div class="flex items-center gap-2">
                        <button id="addCashDebitBtn" class="px-3 py-1 bg-green-600 text-white text-sm rounded">Add Debit</button>
                        <button id="addCashCreditBtn" class="px-3 py-1 bg-red-600 text-white text-sm rounded">Add Credit</button>
                        
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-xs">
                            <tr>
                                <th class="p-2">Date <select id="cashSortSel" class="ml-2 text-xs border rounded p-1"><option value="date:desc" ${state.cashSort?.key==='date' && state.cashSort?.dir==='desc' ? 'selected':''}>Newest</option><option value="date:asc" ${state.cashSort?.key==='date' && state.cashSort?.dir==='asc' ? 'selected':''}>Oldest</option></select></th>
                                <th class="p-2">Ref Type <select id="cashSortRefTypeSel" class="hidden text-xs"></select></th>
                                <th class="p-2">Ref</th>
                                <th class="p-2">Notes</th>
                                <th class="p-2 text-right">Debit (₹)</th>
                                <th class="p-2 text-right">Credit (₹)</th>
                                <th class="p-2 text-right">Balance (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cashRows}
                        </tbody>
                    </table>
                </div>
                ${cashPaginationHTML}
                <div class="mt-4 text-sm text-gray-600">Opening balance forms moved to <strong>Billing Settings</strong> — use that tab to add cash/bank opening balances.</div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xl font-bold">Bank Book</h3>
                        <div class="flex items-center gap-2">
                        <div class="flex items-center gap-2">
                            <label class="text-xs text-gray-600">Account</label>
                            <select id="bankAccountFilter" class="border rounded p-1 text-sm">
                                <option ${selectedBank==='All'?'selected':''}>All</option>
                                ${allBankAccounts.map(n=>`<option ${selectedBank===n?'selected':''}>${n}</option>`).join('')}
                            </select>
                        </div>
                        <button id="addBankDebitBtn" class="px-3 py-1 bg-green-600 text-white text-sm rounded">Add Debit</button>
                        <button id="addBankCreditBtn" class="px-3 py-1 bg-red-600 text-white text-sm rounded">Add Credit</button>
                        
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-xs">
                            <tr>
                                <th class="p-2">Date <select id="bankSortSel" class="ml-2 text-xs border rounded p-1"><option value="date:desc" ${state.bankSort?.key==='date' && state.bankSort?.dir==='desc' ? 'selected':''}>Newest</option><option value="date:asc" ${state.bankSort?.key==='date' && state.bankSort?.dir==='asc' ? 'selected':''}>Oldest</option></select></th>
                                <th class="p-2">Ref Type</th>
                                <th class="p-2">Ref</th>
                                <th class="p-2">Notes</th>
                                <th class="p-2">Account</th>
                                <th class="p-2 text-center">Rec</th>
                                <th class="p-2 text-right">Debit (₹)</th>
                                <th class="p-2 text-right">Credit (₹)</th>
                                <th class="p-2 text-right">Balance (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${bankRows}
                        </tbody>
                    </table>
                </div>
                ${bankPaginationHTML}
                <!-- Bank opening moved to Billing Settings tab -->
            </div>
        </div>
        <div class="bg-white p-8 rounded-lg shadow-lg mb-8">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-2xl font-bold">Sundry Creditors</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-100 text-xs">
                        <tr>
                            <th class="p-3">Supplier</th>
                            <th class="p-3 text-right">Debit (₹)</th>
                            <th class="p-3 text-right">Credit (₹)</th>
                            <th class="p-3 text-right">Balance (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${creditorsRows}
                    </tbody>
                </table>
            </div>
            ${creditorsPaginationHTML}
        </div>
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-2xl font-bold">Sundry Debtors</h3>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left">
                    <thead class="bg-gray-100 text-xs">
                        <tr>
                            <th class="p-3">Customer</th>
                            <th class="p-3 text-right">Debit (₹)</th>
                            <th class="p-3 text-right">Credit (₹)</th>
                            <th class="p-3 text-right">Balance (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${debtorsRows}
                    </tbody>
                </table>
            </div>
            ${debtorsPaginationHTML}
        </div>
        <!-- Party Directory: Add pane removed. Use directory buttons instead. -->
        <div class="bg-white p-8 rounded-lg shadow-lg mt-6">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-xl font-bold">Party Directory</h3>
                            <div class="flex items-center gap-3">
                                                <button id="partyCompactToggle" class="text-sm text-gray-600 hover:text-gray-800">Compact</button>
                                                <button id="togglePartyList" class="text-sm text-gray-600 hover:text-gray-800">${isListCollapsed?'Expand':'Collapse'}</button>
                                                <button id="addSupplierDirBtn" class="px-3 py-1 bg-green-600 text-white text-sm rounded">Add Supplier</button>
                                                <button id="addCustomerDirBtn" class="px-3 py-1 bg-blue-600 text-white text-sm rounded">Add Customer</button>
                                            </div>
                                    </div>
            <div id="partyListBody" class="${isListCollapsed?'hidden':''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold">Suppliers <span class="text-xs text-gray-500">(${filteredSuppliers.length} / ${allSuppliersList.length})</span></h4>
                        <button id="clearSupplierSearch" class="text-xs text-gray-600 hover:text-gray-800 ${supSearchVal? '' : 'invisible'}">Clear</button>
                    </div>
                    <input type="text" id="supplierSearch" placeholder="Search name or GSTIN" class="border rounded p-2 w-full mb-2" value="${(supSearchVal||'').replace(/\"/g,'&quot;')}">
                                                            <div class="overflow-x-auto">
                                                                <table class="w-full text-left party-table" data-type="suppliers">
                                                                    <thead class="bg-gray-100 text-xs">
                                                                        <tr>
                                                                            <th role="button" tabindex="0" aria-sort="${supSort.key==='name'? (supSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="name">Name <span class="sort-indicator">${supSort.key==='name' ? (supSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${supSort.key==='gstin'? (supSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="gstin">GSTIN <span class="sort-indicator">${supSort.key==='gstin' ? (supSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${supSort.key==='email'? (supSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="email">Email <span class="sort-indicator">${supSort.key==='email' ? (supSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${supSort.key==='address'? (supSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="address">Address <span class="sort-indicator">${supSort.key==='address' ? (supSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th class="p-2 text-right">Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        ${suppliersListHTML}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <div class="flex items-center justify-between mt-2 text-sm text-gray-600">
                                                                <div>Showing ${suppliersPaged.slice.length ? ((suppliersPaged.page - 1) * suppliersPaged.pageSize + 1) : 0} - ${((suppliersPaged.page - 1) * suppliersPaged.pageSize) + suppliersPaged.slice.length} of ${suppliersPaged.total}</div>
                                                                <div class="flex items-center gap-2">
                                                                    <button id="supPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${suppliersPaged.page<=1? 'disabled':''}>Prev</button>
                                                                    <input id="supPageInput" type="number" min="1" max="${suppliersPaged.totalPages}" value="${suppliersPaged.page}" class="w-14 text-center border rounded p-1" />
                                                                    <button id="supNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${suppliersPaged.page>=suppliersPaged.totalPages? 'disabled':''}>Next</button>
                                                                    <select id="supPageSizeSel" class="border rounded p-1 text-sm">
                                                                        ${[10,25,50].map(n=>`<option value="${n}" ${suppliersPaged.pageSize===n? 'selected':''}>${n}</option>`).join('')}
                                                                    </select>
                                                                </div>
                                                            </div>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold">Customers <span class="text-xs text-gray-500">(${filteredCustomers.length} / ${allCustomersList.length})</span></h4>
                        <button id="clearCustomerSearch" class="text-xs text-gray-600 hover:text-gray-800 ${custSearchVal? '' : 'invisible'}">Clear</button>
                    </div>
                    <input type="text" id="customerSearch" placeholder="Search name or GSTIN" class="border rounded p-2 w-full mb-2" value="${(custSearchVal||'').replace(/\"/g,'&quot;')}">
                                                            <div class="overflow-x-auto">
                                                                <table class="w-full text-left party-table" data-type="customers">
                                                                    <thead class="bg-gray-100 text-xs">
                                                                        <tr>
                                                                            <th role="button" tabindex="0" aria-sort="${custSort.key==='name'? (custSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="name">Name <span class="sort-indicator">${custSort.key==='name' ? (custSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${custSort.key==='gstin'? (custSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="gstin">GSTIN <span class="sort-indicator">${custSort.key==='gstin' ? (custSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${custSort.key==='email'? (custSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="email">Email <span class="sort-indicator">${custSort.key==='email' ? (custSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th role="button" tabindex="0" aria-sort="${custSort.key==='address'? (custSort.dir==='asc'?'ascending':'descending') : 'none'}" class="p-2 sortable cursor-pointer" data-key="address">Address <span class="sort-indicator">${custSort.key==='address' ? (custSort.dir==='asc' ? '▲' : '▼') : ''}</span></th>
                                                                            <th class="p-2 text-right">Actions</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        ${customersListHTML}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <div class="flex items-center justify-between mt-2 text-sm text-gray-600">
                                                                <div>Showing ${customersPaged.slice.length ? ((customersPaged.page - 1) * customersPaged.pageSize + 1) : 0} - ${((customersPaged.page - 1) * customersPaged.pageSize) + customersPaged.slice.length} of ${customersPaged.total}</div>
                                                                <div class="flex items-center gap-2">
                                                                    <button id="custPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${customersPaged.page<=1? 'disabled':''}>Prev</button>
                                                                    <input id="custPageInput" type="number" min="1" max="${customersPaged.totalPages}" value="${customersPaged.page}" class="w-14 text-center border rounded p-1" />
                                                                    <button id="custNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${customersPaged.page>=customersPaged.totalPages? 'disabled':''}>Next</button>
                                                                    <select id="custPageSizeSel" class="border rounded p-1 text-sm">
                                                                        ${[10,25,50].map(n=>`<option value="${n}" ${customersPaged.pageSize===n? 'selected':''}>${n}</option>`).join('')}
                                                                    </select>
                                                                </div>
                                                            </div>
                </div>
            </div>
            </div>
        </div>
        <!-- End Party Directory panes -->
        <div class="bg-white p-8 rounded-lg shadow-lg mt-8">
            <h3 class="text-xl font-bold mb-4">Quick Postings</h3>
            <!-- Condensed controls: three buttons that reveal the corresponding form -->
            <div class="mb-4 flex gap-2" role="tablist" aria-label="Quick Postings">
                <button id="quickPostingBtnSp" type="button" class="px-3 py-2 bg-green-600 text-white rounded" aria-controls="supplierPaymentForm" aria-pressed="true" data-action="showQuickPostingForm" data-args='["supplierPaymentForm"]'>Supplier Payment</button>
                <button id="quickPostingBtnCr" type="button" class="px-3 py-2 bg-indigo-600 text-white rounded" aria-controls="customerReceiptForm" aria-pressed="false" data-action="showQuickPostingForm" data-args='["customerReceiptForm"]'>Customer Receipt</button>
                <button id="quickPostingBtnT" type="button" class="px-3 py-2 bg-gray-700 text-white rounded" aria-controls="cashBankTransferForm" aria-pressed="false" data-action="showQuickPostingForm" data-args='["cashBankTransferForm"]'>Cash ↔ Bank Transfer</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <form id="supplierPaymentForm" class="space-y-3 border rounded p-4">
                    <h4 class="font-semibold">Supplier Payment</h4>
                    <input type="text" id="spParty" placeholder="Supplier Name" class="w-full border rounded p-2" list="suppliersDatalist" required>
                    <datalist id="suppliersDatalist">${(state.allSuppliers||[]).map(s=>`<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                    <input type="date" id="spDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
                    <div id="spTimeDisplay" class="text-sm text-gray-700 mt-1">Posting time: ${getLocalTimeHHMMSS()}</div>
                    <input type="number" id="spAmount" placeholder="Amount (₹)" class="w-full border rounded p-2" step="0.01" required>
                    <select id="spMode" class="w-full border rounded p-2">
                        <option value="cash" selected>Cash</option>
                        <option value="bank">Bank</option>
                    </select>
                                        <div id="spBankAccountRow" class="hidden">
                                            <select id="spBankAccount" class="w-full border rounded p-2">
                                                ${(state.allBanks||[]).map(b=>`<option>${b.name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <label class="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" id="spReconciled"> Mark as reconciled</label>
                                        <input type="text" id="spReconNote" placeholder="Reconciliation note (optional)" class="w-full border rounded p-2">
                    <input type="text" id="spNotes" placeholder="Notes (optional)" class="w-full border rounded p-2">
                    <div class="mt-2 text-sm text-gray-600">
                        <div>Total outstanding for supplier: <span id="spTotalOutstanding">0.00</span></div>
                        <div class="mt-2">
                            <button type="button" id="spSelectAllBills" class="px-2 py-1 bg-gray-100 rounded text-sm">Select All Bills</button>
                            <button type="button" id="spClearBills" class="px-2 py-1 bg-gray-100 rounded text-sm ml-2">Clear</button>
                        </div>
                        <div id="spBillsContainer" class="mt-2 max-h-40 overflow-y-auto text-sm border rounded p-2 bg-white"></div>
                    </div>
                    <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded">Record Payment</button>
                </form>
                <form id="customerReceiptForm" class="space-y-3 border rounded p-4 hidden">
                    <h4 class="font-semibold">Customer Receipt</h4>
                    <input type="text" id="crParty" placeholder="Customer Name" class="w-full border rounded p-2" list="customersDatalist" required>
                    <datalist id="customersDatalist">${(state.allCustomers||[]).map(c=>`<option value="${(c.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                    <input type="date" id="crDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
                    <div id="crTimeDisplay" class="text-sm text-gray-700 mt-1">Posting time: ${getLocalTimeHHMMSS()}</div>
                    <input type="number" id="crAmount" placeholder="Amount (₹)" class="w-full border rounded p-2" step="0.01" required>
                    <select id="crMode" class="w-full border rounded p-2">
                        <option value="cash" selected>Cash</option>
                        <option value="bank">Bank</option>
                    </select>
                                        <div id="crBankAccountRow" class="hidden">
                                            <select id="crBankAccount" class="w-full border rounded p-2">
                                                ${(state.allBanks||[]).map(b=>`<option>${b.name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <label class="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" id="crReconciled"> Mark as reconciled</label>
                                        <input type="text" id="crReconNote" placeholder="Reconciliation note (optional)" class="w-full border rounded p-2">
                    <input type="text" id="crNotes" placeholder="Notes (optional)" class="w-full border rounded p-2">
                    <button type="submit" class="bg-indigo-600 text-white px-4 py-2 rounded">Record Receipt</button>
                </form>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <form id="cashBankTransferForm" class="space-y-3 border rounded p-4 hidden">
                    <h4 class="font-semibold">Cash ↔ Bank Transfer</h4>
                    <input type="date" id="tDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
                    <div id="tTimeDisplay" class="text-sm text-gray-700 mt-1">Posting time: ${getLocalTimeHHMMSS()}</div>
                    <input type="number" id="tAmount" placeholder="Amount (₹)" class="w-full border rounded p-2" step="0.01" required>
                    <select id="tDirection" class="w-full border rounded p-2">
                        <option value="cashToBank">Cash to Bank (Deposit)</option>
                        <option value="bankToCash">Bank to Cash (Withdrawal)</option>
                    </select>
                                        <div>
                                            <label class="block text-xs text-gray-600">Bank Account</label>
                                            <select id="tBankAccount" class="w-full border rounded p-2">
                                                ${(state.allBanks||[]).map(b=>`<option>${b.name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <label class="flex items-center gap-2 text-xs text-gray-700"><input type="checkbox" id="tReconciled"> Mark as reconciled</label>
                                        <input type="text" id="tReconNote" placeholder="Reconciliation note (optional)" class="w-full border rounded p-2">
                    <input type="text" id="tNotes" placeholder="Notes (optional)" class="w-full border rounded p-2">
                    <button type="submit" class="bg-purple-600 text-white px-4 py-2 rounded">Record Transfer</button>
                </form>
            </div>
            <!-- Pending payments / receipts quick view -->
            <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="border rounded p-4">
                    <h4 class="font-semibold">Pending Supplier Payments</h4>
                    <div id="pendingSupplierPayments" class="mt-3 text-sm space-y-2">
                        <p class="text-gray-500">Loading...</p>
                    </div>
                </div>
                <div class="border rounded p-4">
                    <h4 class="font-semibold">Pending Customer Receipts</h4>
                    <div id="pendingCustomerReceipts" class="mt-3 text-sm space-y-2">
                        <p class="text-gray-500">Loading...</p>
                    </div>
                </div>
            </div>
        </div>
        <div class="bg-white p-8 rounded-lg shadow-lg mt-8">
            <h3 class="text-xl font-bold mb-4">Maintenance</h3>
            <p class="text-sm text-gray-600 mb-3">One-time migration of parties from legacy location into the new masters path. Safe to re-run; duplicates are skipped.</p>
            <div class="flex items-center gap-3">
                <button id="migratePartiesBtn" class="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded">Migrate Legacy Parties</button>
                <span id="migratePartiesStatus" class="text-sm text-gray-500"></span>
            </div>
        </div>
        </div>
                <aside class="lg:col-span-1 lg:sticky lg:top-4 space-y-6">
                    
                </aside>
      </div>
        `;

    // After rendering, ensure time inputs reflect the admin-unlocked state (they may be recreated by innerHTML)
    try {
        const ids = ['cashObTime','bankObTime','spTime','crTime','tTime'];
        ids.forEach(id => {
            try {
                const el = document.getElementById(id);
                if (el) el.disabled = !state.timePickerUnlocked;
            } catch (_) {}
        });
    } catch (_) {}

    // Ledger reorder controls: allow swapping Cash/Bank panels to give more room
    try {
        state.ui = state.ui || {};
        // restore saved order if any
        try {
            const saved = localStorage.getItem('ledgerSectionOrder');
            if (saved) state.ui.ledgerSectionOrder = JSON.parse(saved);
        } catch (_) {}

        const ledgerGrid = document.getElementById('ledgerBooksGrid');
        const moveCashBtn = document.getElementById('moveCashUpBtn');
        const moveBankBtn = document.getElementById('moveBankUpBtn');

        function ensureLedgerOrder(prefer) {
            try {
                if (!ledgerGrid) return;
                const children = Array.from(ledgerGrid.children).filter(c => c.nodeType === 1);
                if (children.length < 2) return;
                // detect which child is cash/bank by header text
                let cashEl = null, bankEl = null;
                for (const ch of children) {
                    const h = ch.querySelector('h3');
                    const txt = (h && h.textContent) ? h.textContent.trim().toLowerCase() : '';
                    if (txt.startsWith('cash')) cashEl = ch;
                    if (txt.startsWith('bank')) bankEl = ch;
                }
                if (!cashEl || !bankEl) return;
                if (prefer === 'cash') {
                    if (ledgerGrid.firstElementChild !== cashEl) ledgerGrid.insertBefore(cashEl, ledgerGrid.firstElementChild);
                    state.ui.ledgerSectionOrder = ['cash','bank'];
                } else if (prefer === 'bank') {
                    if (ledgerGrid.firstElementChild !== bankEl) ledgerGrid.insertBefore(bankEl, ledgerGrid.firstElementChild);
                    state.ui.ledgerSectionOrder = ['bank','cash'];
                }
                try { localStorage.setItem('ledgerSectionOrder', JSON.stringify(state.ui.ledgerSectionOrder)); } catch(_){}
            } catch (e) { console.error('ensureLedgerOrder', e); }
        }

        // attach handlers
        moveCashBtn?.addEventListener('click', () => ensureLedgerOrder('cash'));
        moveBankBtn?.addEventListener('click', () => ensureLedgerOrder('bank'));

        // apply saved order immediately
        if (state.ui.ledgerSectionOrder && state.ui.ledgerSectionOrder[0]) {
            ensureLedgerOrder(state.ui.ledgerSectionOrder[0]);
        }
    } catch (_) {}

    // Date filter listeners
    const applyBtn = document.getElementById('applyLedgerDateBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const s = document.getElementById('ledgerStartDate').value;
            const e = document.getElementById('ledgerEndDate').value;
            state.ledgerStartDate = s || state.ledgerStartDate;
            state.ledgerEndDate = e || state.ledgerEndDate;
            // Update the 'use today' flag when apply is clicked
            try {
                const todayChk = document.getElementById('ledgerStartToday');
                const todayStr = new Date().toISOString().split('T')[0];
                state.ledgerStartUseToday = !!(todayChk && todayChk.checked) || (state.ledgerStartDate === todayStr);
            } catch (_) { state.ledgerStartUseToday = false; }
            // Reset pagination to first page when date range changes
            state.cashPage = 1; state.bankPage = 1; state.creditorsPage = 1; state.debtorsPage = 1;
            renderAdminLedgersPage();
        });
    }

    // Wire the 'Today' checkbox so toggling it updates the start date immediately
    try {
        const todayChk = document.getElementById('ledgerStartToday');
        if (todayChk) {
            todayChk.addEventListener('change', (ev) => {
                try {
                    const checked = !!ev.currentTarget.checked;
                    const todayStr = new Date().toISOString().split('T')[0];
                    const startEl = document.getElementById('ledgerStartDate');
                    if (checked) {
                        if (startEl) startEl.value = todayStr;
                        state.ledgerStartDate = todayStr;
                        state.ledgerStartUseToday = true;
                    } else {
                        // revert to financial year start
                        const def = getFinancialYearStart(new Date());
                        if (startEl) startEl.value = def;
                        state.ledgerStartDate = def;
                        state.ledgerStartUseToday = false;
                    }
                    // reset pagination and re-render
                    state.cashPage = 1; state.bankPage = 1; state.creditorsPage = 1; state.debtorsPage = 1;
                    renderAdminLedgersPage();
                } catch (e) { console.error('ledgerStartToday change handler', e); }
            });
        }
    } catch (_) {}

    // Supplier Payment form handler
    const spForm = document.getElementById('supplierPaymentForm');
    if (spForm) {
        spForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const party = document.getElementById('spParty').value.trim();
            const date = parseDateWithNow('spDate');
            const amount = parseFloat(document.getElementById('spAmount').value) || 0;
            const mode = (document.getElementById('spMode')?.value || 'cash');
            const bankAccount = mode==='bank' ? (document.getElementById('spBankAccount')?.value || 'Main Bank') : null;
            const reconciled = !!document.getElementById('spReconciled')?.checked;
            const reconNote = document.getElementById('spReconNote')?.value || '';
            const notes = document.getElementById('spNotes').value.trim();
            if (!party || amount <= 0) { showMessage('Enter supplier name and a positive amount.'); return; }
                try {
                    // Collect selected bills (if any) from the UI and parse outstanding amounts
                    const container = document.getElementById('spBillsContainer');
                    const checked = container ? Array.from(container.querySelectorAll('.sp-bill-checkbox')).filter(c => c.checked) : [];
                    const selectedBills = checked.map(c => ({ refId: c.getAttribute('data-refid'), outstanding: Number(c.getAttribute('data-amount') || 0) }));

                    // Create the cash/bank ledger entry first so we can reference it from per-bill payment entries
                    const cashPayload = {
                        date,
                        refType: 'Supplier Payment',
                        // use a generated batch refId (the addDoc id will be filled in after creation)
                        refId: null,
                        notes: notes ? `${notes} · To ${party}` : `To ${party}`,
                        debit: 0,
                        credit: amount,
                        reconciled: !!reconciled,
                        isDeleted: false,
                        createdAt: serverTimestamp(),
                    };
                    if (bankAccount) cashPayload.bankAccount = bankAccount;
                    if (reconNote) cashPayload.reconNote = reconNote;

                    // Use a batched write so the cash/bank ledger entry and creditors payment entries are atomic.
                    const batch = writeBatch(db);
                    // Create cash/bank doc ref without writing yet so we can reference its id
                    const cashDocRef = (mode === 'bank') ? doc(collection(db, bankLedgerColPath)) : doc(collection(db, cashLedgerColPath));
                    // set refId to the cashDoc id for traceability
                    const cashPayloadWithRef = { ...cashPayload, refId: cashDocRef.id };
                    batch.set(cashDocRef, cashPayloadWithRef);

                    // Distribute amount across selected bills (first-fit) and create creditors payment docs in batch
                    let remaining = amount;
                    if (selectedBills.length > 0) {
                        for (const b of selectedBills) {
                            if (remaining <= 0) break;
                            const apply = Math.min(remaining, b.outstanding || 0);
                            if (apply <= 0) continue;
                            const creditorRef = doc(collection(db, creditorsLedgerColPath));
                            batch.set(creditorRef, {
                                partyName: party,
                                date,
                                refType: 'Payment',
                                refId: b.refId,
                                paymentRef: cashDocRef.id,
                                notes: notes || `Payment against ${b.refId}`,
                                debit: apply,
                                credit: 0,
                                isDeleted: false,
                                createdAt: serverTimestamp(),
                            });
                            remaining -= apply;
                        }
                    }

                    // If no selected bills or leftover remaining amount, create a generic creditors payment doc referencing the cashDocRef
                    if (selectedBills.length === 0 || remaining > 0) {
                        const creditorRef = doc(collection(db, creditorsLedgerColPath));
                        batch.set(creditorRef, {
                            partyName: party,
                            date,
                            refType: 'Payment',
                            refId: cashDocRef.id,
                            paymentRef: cashDocRef.id,
                            notes,
                            debit: remaining > 0 ? remaining : amount,
                            credit: 0,
                            isDeleted: false,
                            createdAt: serverTimestamp(),
                        });
                    }

                    // Commit the batch
                    await batch.commit();
                await ensurePartyExists(party, 'supplier');
                // Optimistic update and re-render
                upsertPartyInState('supplier', { name: party });
                renderAdminLedgersPage();
                showMessage('Supplier payment recorded.');
                spForm.reset();
                // clear bills UI
                try { document.getElementById('spBillsContainer').innerHTML = ''; document.getElementById('spTotalOutstanding').textContent = '0.00'; } catch(_) {}
            } catch (err) {
                console.error('Supplier payment error:', err);
                showMessage('Failed to record supplier payment.');
            }
        });
    }

    // Populate supplier bills list and totals when party field changes or on demand
    function populateSupplierBillsFor(partyName) {
        try {
            const container = document.getElementById('spBillsContainer');
            const totalEl = document.getElementById('spTotalOutstanding');
            if (!container || !totalEl) return;
            const all = (state.allCreditorsLedger || []).filter(x => !x.isDeleted);
            // Consider only purchase-origin creditor entries as bill items
            const purchaseEntries = all.filter(e => (e.refType || '').toLowerCase().includes('purchase') && (e.partyName||'').trim().toLowerCase() === (partyName||'').trim().toLowerCase());
            // Group by refId to compute outstanding per bill
            const byRef = {};
            for (const e of purchaseEntries) {
                const refId = e.refId || e.id || ('ref_' + (e.id||Math.random()));
                if (!byRef[refId]) byRef[refId] = { refId, invoice: e.invoiceNumber || '', date: e.date || e.createdAt || null, credit: 0, paid: 0 };
                byRef[refId].credit += Number(e.credit || 0);
            }
            // Sum payments (debits) against these refIds
            for (const e of all.filter(x => (x.refType||'').toLowerCase().includes('payment') || (x.refType||'').toLowerCase().includes('payment') )) {
                const refId = e.refId || e.id;
                if (refId && byRef[refId]) byRef[refId].paid += Number(e.debit || 0);
            }
            const bills = Object.values(byRef).map(b => ({
                refId: b.refId,
                invoice: b.invoice,
                date: b.date,
                outstanding: Math.round(((b.credit || 0) - (b.paid || 0) + Number.EPSILON) * 100) / 100
            })).filter(b => b.outstanding > 0).sort((a,b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
            const totalOutstanding = bills.reduce((acc,b)=>acc + b.outstanding, 0);
            totalEl.textContent = (Math.round((totalOutstanding+Number.EPSILON)*100)/100).toFixed(2);
            if (!bills.length) { container.innerHTML = '<div class="text-gray-500">No unpaid bills for this supplier.</div>'; return; }
            container.innerHTML = bills.map(b => `<label class="flex items-center justify-between"><span><input type="checkbox" class="sp-bill-checkbox mr-2" data-refid="${(b.refId||'').replace(/"/g,'&quot;')}" data-amount="${b.outstanding}"> ${b.invoice ? b.invoice + ' · ' : ''}${formatDate(_toDate(b.date) || new Date())}</span><span>₹${b.outstanding.toFixed(2)}</span></label>`).join('');
            // Attach handlers
            container.querySelectorAll('.sp-bill-checkbox').forEach(chk => chk.addEventListener('change', () => {
                const checked = Array.from(container.querySelectorAll('.sp-bill-checkbox')).filter(c => c.checked);
                const selTotal = checked.reduce((acc,c) => acc + Number(c.getAttribute('data-amount') || 0), 0);
                const spAmountEl = document.getElementById('spAmount');
                if (spAmountEl) spAmountEl.value = selTotal.toFixed(2);
            }));
        } catch (err) { console.error('populateSupplierBillsFor error', err); }
    }

    // Wire up party input change/select-all/clear buttons
    const spPartyInput = document.getElementById('spParty');
    if (spPartyInput) {
        spPartyInput.addEventListener('change', (e) => populateSupplierBillsFor(e.target.value));
        spPartyInput.addEventListener('blur', (e) => populateSupplierBillsFor(e.target.value));
    }
    document.getElementById('spSelectAllBills')?.addEventListener('click', () => {
        const container = document.getElementById('spBillsContainer'); if (!container) return;
        container.querySelectorAll('.sp-bill-checkbox').forEach(c => { c.checked = true; c.dispatchEvent(new Event('change')); });
    });
    document.getElementById('spClearBills')?.addEventListener('click', () => {
        const container = document.getElementById('spBillsContainer'); if (!container) return;
        container.querySelectorAll('.sp-bill-checkbox').forEach(c => { c.checked = false; c.dispatchEvent(new Event('change')); });
    });

    // Customer Receipt form handler
    const crForm = document.getElementById('customerReceiptForm');
    if (crForm) {
        crForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const party = document.getElementById('crParty').value.trim();
            const date = parseDateWithNow('crDate');
            const amount = parseFloat(document.getElementById('crAmount').value) || 0;
            const mode = (document.getElementById('crMode')?.value || 'cash');
            const bankAccount = mode==='bank' ? (document.getElementById('crBankAccount')?.value || 'Main Bank') : null;
            const reconciled = !!document.getElementById('crReconciled')?.checked;
            const reconNote = document.getElementById('crReconNote')?.value || '';
            const notes = document.getElementById('crNotes').value.trim();
            if (!party || amount <= 0) { showMessage('Enter customer name and a positive amount.'); return; }
            try {
                const ref = doc(collection(db, debtorsLedgerColPath));
                await setDoc(ref, {
                    partyName: party,
                    date,
                    refType: 'Receipt',
                    refId: ref.id,
                    notes,
                    debit: 0,
                    credit: amount,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                });
                // Mirror entry in cash/bank ledger (debit because asset increases)
                const bankPayload = {
                    date,
                    refType: 'Customer Receipt',
                    refId: ref.id,
                    notes: notes ? `${notes} · From ${party}` : `From ${party}`,
                    debit: amount,
                    credit: 0,
                    bankAccount: bankAccount || undefined,
                    reconciled: reconciled || false,
                    reconNote: reconNote || undefined,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                };
                if (mode === 'bank') {
                    await addDoc(collection(db, bankLedgerColPath), bankPayload);
                } else {
                    await addDoc(collection(db, cashLedgerColPath), bankPayload);
                }
                await ensurePartyExists(party, 'customer');
                // Optimistic update and re-render
                upsertPartyInState('customer', { name: party });
                renderAdminLedgersPage();
                showMessage('Customer receipt recorded.');
                crForm.reset();
            } catch (err) {
                console.error('Customer receipt error:', err);
                showMessage('Failed to record customer receipt.');
            }
        });
    }

    // Cash-Bank transfer form handler
    const tForm = document.getElementById('cashBankTransferForm');
    if (tForm) {
        tForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = parseDateWithNow('tDate');
            const amount = parseFloat(document.getElementById('tAmount').value) || 0;
            const dir = document.getElementById('tDirection').value;
            const bankAccount = document.getElementById('tBankAccount')?.value || 'Main Bank';
            const reconciled = !!document.getElementById('tReconciled')?.checked;
            const reconNote = document.getElementById('tReconNote')?.value || '';
            const notes = document.getElementById('tNotes').value.trim();
            if (amount <= 0) { showMessage('Enter a positive amount.'); return; }
            try {
                // Create a single transfer document and two ledger entries that reference it (contra)
                const batch = writeBatch(db);
                const transferRef = doc(collection(db, transfersColPath));
                const transferPayload = {
                    date,
                    amount,
                    direction: dir === 'cashToBank' ? 'cashToBank' : 'bankToCash',
                    bankAccount: bankAccount || null,
                    reconciled: !!reconciled,
                    reconNote: reconNote || null,
                    notes: notes || null,
                    createdAt: serverTimestamp(),
                    isDeleted: false,
                };
                batch.set(transferRef, transferPayload);
                if (dir === 'cashToBank') {
                    // Cash credit, Bank debit
                    const cashDoc = doc(db, cashLedgerColPath, `${transferRef.id}-cash`);
                    const bankDoc = doc(db, bankLedgerColPath, `${transferRef.id}-bank`);
                    batch.set(cashDoc, {
                        date, refType: 'Transfer', refId: transferRef.id, notes: notes ? `${notes} · Cash → Bank` : 'Cash → Bank',
                        debit: 0, credit: amount, isDeleted: false, createdAt: serverTimestamp(),
                    });
                    batch.set(bankDoc, {
                        date, refType: 'Transfer', refId: transferRef.id, notes: notes ? `${notes} · Cash → Bank` : 'Cash → Bank', bankAccount, reconciled, reconNote: reconNote || undefined,
                        debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                    });
                } else {
                    // Bank to Cash: Bank credit, Cash debit
                    const bankDoc = doc(db, bankLedgerColPath, `${transferRef.id}-bank`);
                    const cashDoc = doc(db, cashLedgerColPath, `${transferRef.id}-cash`);
                    batch.set(bankDoc, {
                        date, refType: 'Transfer', refId: transferRef.id, notes: notes ? `${notes} · Bank → Cash` : 'Bank → Cash', bankAccount, reconciled, reconNote: reconNote || undefined,
                        debit: 0, credit: amount, isDeleted: false, createdAt: serverTimestamp(),
                    });
                    batch.set(cashDoc, {
                        date, refType: 'Transfer', refId: transferRef.id, notes: notes ? `${notes} · Bank → Cash` : 'Bank → Cash',
                        debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                    });
                }
                await batch.commit();
                renderAdminLedgersPage();
                showMessage('Transfer recorded.');
                tForm.reset();
            } catch (err) {
                console.error('Cash/Bank transfer error:', err);
                showMessage('Failed to record transfer.');
            }
        });
    }

    // (Opening balance handlers moved to Billing Settings tab via attachAdminListeners)

    // Change handlers for mode -> bank account rows
    const spModeSel = document.getElementById('spMode');
    const spBankRow = document.getElementById('spBankAccountRow');
    if (spModeSel && spBankRow) { spModeSel.addEventListener('change', ()=>{ spBankRow.classList.toggle('hidden', spModeSel.value!=='bank'); }); spBankRow.classList.toggle('hidden', spModeSel.value!=='bank'); }
    const crModeSel = document.getElementById('crMode');
    const crBankRow = document.getElementById('crBankAccountRow');
    if (crModeSel && crBankRow) { crModeSel.addEventListener('change', ()=>{ crBankRow.classList.toggle('hidden', crModeSel.value!=='bank'); }); crBankRow.classList.toggle('hidden', crModeSel.value!=='bank'); }
    const bankFilterSel = document.getElementById('bankAccountFilter');
    if (bankFilterSel) { bankFilterSel.addEventListener('change', ()=>{ state.bankAccountFilter = bankFilterSel.value; state.bankPage = 1; renderAdminLedgersPage(); }); }

    // Party add forms
    const addSupForm = document.getElementById('addSupplierForm');
    const toggleAddBtn = document.getElementById('togglePartyAdd');
    if (toggleAddBtn) {
        toggleAddBtn.addEventListener('click', () => {
            state.ui.partyAddCollapsed = !state.ui.partyAddCollapsed;
            renderAdminLedgersPage();
        });
    }
    const toggleListBtn = document.getElementById('togglePartyList');
    if (toggleListBtn) {
        toggleListBtn.addEventListener('click', () => {
            state.ui.partyListCollapsed = !state.ui.partyListCollapsed;
            renderAdminLedgersPage();
        });
    }
    const supSearchInput = document.getElementById('supplierSearch');
    if (supSearchInput) {
        supSearchInput.addEventListener('input', (e) => {
            state.partySearchSuppliers = e.target.value || '';
            renderAdminLedgersPage();
        });
    }
    const supClearBtn = document.getElementById('clearSupplierSearch');
    if (supClearBtn) {
        supClearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            state.partySearchSuppliers = '';
            renderAdminLedgersPage();
        });
    }
    const custSearchInput = document.getElementById('customerSearch');
    if (custSearchInput) {
        custSearchInput.addEventListener('input', (e) => {
            state.partySearchCustomers = e.target.value || '';
            renderAdminLedgersPage();
        });
    }
    const custClearBtn = document.getElementById('clearCustomerSearch');
    if (custClearBtn) {
        custClearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            state.partySearchCustomers = '';
            renderAdminLedgersPage();
        });
    }
    if (addSupForm) {
        try { const supAddrAdd = document.getElementById('newSupplierAddressAdd'); if (supAddrAdd) attachNameCapitalization(supAddrAdd); } catch(_) {}
        addSupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newSupplierName').value.trim();
            const gstin = (document.getElementById('newSupplierGstin')?.value || '').trim();
            const address = (document.getElementById('newSupplierAddressAdd')?.value || '').trim();
            const creditDaysRaw = (document.getElementById('newSupplierCreditDays')?.value || '').toString().trim();
            const creditDays = creditDaysRaw === '' ? 0 : (parseInt(creditDaysRaw, 10) || 0);
            if (!name) return;
            try {
                await ensurePartyExists(name, 'supplier', true, { gstin: gstin || undefined, address: address || undefined, creditDays: creditDays !== null ? creditDays : undefined });
                // Optimistic local list update and re-render
                upsertPartyInState('supplier', { name, gstin: gstin || undefined, address: address || undefined, creditDays: creditDays !== null ? creditDays : undefined });
                renderAdminLedgersPage();
                document.getElementById('newSupplierName').value = '';
                if (document.getElementById('newSupplierGstin')) document.getElementById('newSupplierGstin').value = '';
                if (document.getElementById('newSupplierAddressAdd')) document.getElementById('newSupplierAddressAdd').value = '';
                if (document.getElementById('newSupplierCreditDays')) document.getElementById('newSupplierCreditDays').value = '';
                showMessage('Supplier added to directory.');
            } catch (err) {
                console.error('Add supplier error:', err);
                showMessage('Failed to add supplier.');
            }
        });
    }
    const addCustForm = document.getElementById('addCustomerForm');
    if (addCustForm) {
        try { const custAddr = document.getElementById('newCustomerAddress'); if (custAddr) attachNameCapitalization(custAddr); } catch(_) {}
        try { const custEmailEl = document.getElementById('newCustomerEmail'); if (custEmailEl) try { enforceLowercaseInput(custEmailEl); } catch(_) {} } catch(_) {}
        addCustForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newCustomerName').value.trim();
            const gstin = (document.getElementById('newCustomerGstin')?.value || '').trim();
            const address = (document.getElementById('newCustomerAddress')?.value || '').trim();
            const creditDaysRaw = (document.getElementById('newCustomerCreditDays')?.value || '').toString().trim();
            const creditDays = creditDaysRaw === '' ? 0 : (parseInt(creditDaysRaw, 10) || 0);
            if (!name) return;
            try {
                await ensurePartyExists(name, 'customer', true, { gstin: gstin || undefined, address: address || undefined, creditDays: creditDays !== null ? creditDays : undefined });
                // Optimistic local list update and re-render
                upsertPartyInState('customer', { name, gstin: gstin || undefined, address: address || undefined, creditDays: creditDays !== null ? creditDays : undefined });
                renderAdminLedgersPage();
                document.getElementById('newCustomerName').value = '';
                if (document.getElementById('newCustomerGstin')) document.getElementById('newCustomerGstin').value = '';
                if (document.getElementById('newCustomerAddress')) document.getElementById('newCustomerAddress').value = '';
                if (document.getElementById('newCustomerCreditDays')) document.getElementById('newCustomerCreditDays').value = '';
                showMessage('Customer added to directory.');
            } catch (err) {
                console.error('Add customer error:', err);
                showMessage('Failed to add customer.');
            }
        });
    }

    // Attach capitalization for inline add forms if present
    try { const newSupplierNameEl = document.getElementById('newSupplierName'); if (newSupplierNameEl) attachNameCapitalization(newSupplierNameEl); } catch(_) {}
    try { const newCustomerNameEl = document.getElementById('newCustomerName'); if (newCustomerNameEl) attachNameCapitalization(newCustomerNameEl); } catch(_) {}

    // If an inline Add-Customer 'Not GST-registered' checkbox exists, wire it to clear/disable the GSTIN input
    try {
        const inlineNotReg = document.getElementById('newCustomerNotRegistered');
        const inlineGstin = document.getElementById('newCustomerGstin');
        const inlineGstinFb = document.getElementById('newCustomerGstinFeedback');
        if (inlineNotReg && inlineGstin) {
            const toggleInlineCustGst = () => {
                try {
                    if (inlineNotReg.checked) {
                        inlineGstin.value = '';
                        try { inlineGstin.classList.remove('tiaras-valid'); inlineGstin.classList.remove('tiaras-invalid'); inlineGstin.removeAttribute && inlineGstin.removeAttribute('aria-invalid'); } catch(_) {}
                        if (inlineGstinFb) { try { inlineGstinFb.classList.add('hidden'); inlineGstinFb.textContent = ''; } catch(_) {} }
                        inlineGstin.disabled = true;
                    } else {
                        inlineGstin.disabled = false;
                    }
                } catch(_) {}
            };
            inlineNotReg.addEventListener('change', toggleInlineCustGst);
            toggleInlineCustGst();
        }
    } catch(_) {}

    // Directory header add buttons — open a modal that reuses the advanced supplier/customer fields
    const addSupplierDirBtn = document.getElementById('addSupplierDirBtn');
    if (addSupplierDirBtn) {
        addSupplierDirBtn.addEventListener('click', () => {
            // create modal HTML
            const modal = document.createElement('div');
            modal.id = 'dirAddSupplierModal';
            modal.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40';
            modal.innerHTML = `
                <div class="bg-white rounded-md p-6 max-w-lg w-full">
                    <h3 class="text-lg font-semibold mb-2">Add Supplier</h3>
                    <div class="space-y-3">
                        <input type="text" id="dirNewSupplierName" placeholder="Supplier name" class="w-full border rounded p-2" required />
                        <input type="text" id="dirNewSupplierGstin" placeholder="GSTIN (optional)" class="w-full border rounded p-2" />
                        <label class="inline-flex items-center text-xs text-gray-700"><input type="checkbox" id="dirNewSupplierNotRegistered" class="mr-2"> Not GST-registered</label>
                        <div class="grid grid-cols-2 gap-2">
                            <select id="dirNewSupplierStateCode" class="w-full border rounded p-2">
                                <option value="">Select state</option>
                                ${GST_STATE_CODES.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                            </select>
                            <input type="tel" id="dirNewSupplierPin" placeholder="PIN" class="w-full border rounded p-2" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" />
                        </div>
                        <textarea id="dirNewSupplierAddress" placeholder="Address" class="w-full border rounded p-2" rows="3" required></textarea>
                        <div class="flex">
                            <span class="inline-flex items-center px-3 rounded-l border border-r-0 bg-gray-100 text-gray-700">${state.siteSettings?.countryCode || '+91'}</span>
                            <input type="tel" id="dirNewSupplierMobile" placeholder="Mobile" class="w-full border rounded-r p-2" required />
                        </div>
                        <div>
                            <label class="block text-sm text-gray-700 mb-1">Email (optional)</label>
                            <input type="email" id="dirNewSupplierEmail" placeholder="supplier@example.com" class="w-full border rounded p-2" />
                            <div id="dirNewSupplierEmailFeedback" class="text-xs text-red-600 mt-1 hidden" role="status" aria-live="polite"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <input type="number" id="dirNewSupplierCreditDays" placeholder="Credit Days (Net)" class="w-full border rounded p-2" min="0" />
                            <input type="number" step="0.01" id="dirNewSupplierCreditLimit" placeholder="Credit Limit (₹)" class="w-full border rounded p-2" min="0" />
                        </div>
                        <div class="flex justify-end gap-3 mt-2">
                            <button id="dirCancelSupplierBtn" class="px-4 py-2 rounded bg-gray-200">Cancel</button>
                            <button id="dirAddSupplierBtn" class="px-4 py-2 rounded bg-green-600 text-white">Add Supplier</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const cleanup = () => { try { modal.remove(); } catch(_) {} };

            const nameEl = document.getElementById('dirNewSupplierName');
            const gstEl = document.getElementById('dirNewSupplierGstin');
            const notRegEl = document.getElementById('dirNewSupplierNotRegistered');
            const addrEl = document.getElementById('dirNewSupplierAddress');
            const stateEl = document.getElementById('dirNewSupplierStateCode');
            const pinEl = document.getElementById('dirNewSupplierPin');
            const mobEl = document.getElementById('dirNewSupplierMobile');
            const addBtn = document.getElementById('dirAddSupplierBtn');
            const cancelBtn = document.getElementById('dirCancelSupplierBtn');

            // Ensure address, pin and mobile are required in this modal
            try { if (addrEl) addrEl.required = true; if (pinEl) pinEl.required = true; if (mobEl) mobEl.required = true; } catch(_) {}

            // Wire GSTIN validation and uppercase enforcement if helpers exist
            try { if (gstEl) enforceUppercaseInput(gstEl); } catch(_) {}
            try { if (gstEl) attachGstinValidation(gstEl, null); } catch(_) {}
            try { if (mobEl) attachMobileValidation(mobEl, null); } catch(_) {}
            try { if (pinEl) attachPinBehavior(pinEl, null); } catch(_) {}
            try { const emailEl = document.getElementById('dirNewSupplierEmail'); const emailFb = document.getElementById('dirNewSupplierEmailFeedback'); if (emailEl) { attachEmailValidation(emailEl, emailFb); try { enforceLowercaseInput(emailEl); } catch(_) {} } } catch(_) {}
            try { if (nameEl) attachNameCapitalization(nameEl); } catch(_) {}
            try { if (addrEl) attachNameCapitalization(addrEl); } catch(_) {}

            // Auto-apply state code from GSTIN (debounced)
            try {
                let _debApplySup = null;
                const applyStateFromGstinSup = () => {
                    try {
                        const vFull = (gstEl.value || '').trim().toUpperCase();
                        if (!vFull || vFull.length < 2) return;
                        const code = getStateCodeFromGstin(vFull);
                        if (code && stateEl) {
                            stateEl.value = code;
                            try { document.dispatchEvent(new CustomEvent('gstin:stateApplied', { detail: { inputId: gstEl.id, stateCode: code } })); } catch(_) {}
                        }
                    } catch(_) {}
                    _debApplySup = null;
                };
                const scheduleApplySup = () => { if (_debApplySup) clearTimeout(_debApplySup); _debApplySup = setTimeout(applyStateFromGstinSup, 360); };
                if (gstEl) {
                    gstEl.addEventListener('input', scheduleApplySup);
                    gstEl.addEventListener('change', scheduleApplySup);
                    gstEl.addEventListener('blur', scheduleApplySup);
                }
            } catch(_) {}

            // Default state to merchant state
            try { if (stateEl) stateEl.value = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '') || ''; } catch(_) {}
            // Wire the "Not GST-registered" checkbox for this customer modal to clear/disable GSTIN
            try {
                const notRegCustEl = document.getElementById('dirNewCustomerNotRegistered');
                if (notRegCustEl && gstEl) {
                    const toggleDirCustGst = () => {
                        try {
                            if (notRegCustEl.checked) {
                                gstEl.value = '';
                                try { gstEl.classList.remove('tiaras-valid'); gstEl.classList.remove('tiaras-invalid'); gstEl.removeAttribute && gstEl.removeAttribute('aria-invalid'); } catch(_) {}
                                gstEl.disabled = true;
                            } else {
                                gstEl.disabled = false;
                            }
                        } catch (_) {}
                    };
                    notRegCustEl.addEventListener('change', toggleDirCustGst);
                    toggleDirCustGst();
                }
            } catch(_) {}

            // If the "Not GST-registered" checkbox exists in this modal, wire it to clear/disable the GSTIN input
            try {
                const notRegModalEl = document.getElementById('dirNewSupplierNotRegistered');
                if (notRegModalEl && gstEl) {
                    const toggleDirGst = () => {
                        try {
                            if (notRegModalEl.checked) {
                                gstEl.value = '';
                                try { gstEl.classList.remove('tiaras-valid'); gstEl.classList.remove('tiaras-invalid'); gstEl.removeAttribute && gstEl.removeAttribute('aria-invalid'); } catch(_) {}
                                gstEl.disabled = true;
                            } else {
                                gstEl.disabled = false;
                            }
                        } catch (_) {}
                    };
                    notRegModalEl.addEventListener('change', toggleDirGst);
                    toggleDirGst();
                }
            } catch(_) {}

            // Cancel handlers
            cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
            modal.addEventListener('click', (e) => {
                if (e.target !== modal) return;
                try { const sel = window.getSelection ? window.getSelection().toString() : ''; if (sel && sel.length > 0) return; } catch(_) {}
                cleanup();
            });

            addBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const name = (nameEl.value || '').trim();
                if (!name) { showMessage('Enter supplier name.'); return; }
                const notRegistered = !!(notRegEl && notRegEl.checked);
                let gstin = (gstEl?.value || '').trim().toUpperCase();
                if (notRegistered) gstin = '';
                const address = (addrEl?.value || '').trim();
                if (!address) { showMessage('Enter supplier address. Address is required when adding to directory.'); return; }
                const stateCode = (stateEl?.value || '').trim() || undefined;
                const pin = (pinEl?.value || '').trim();
                const mobile = (mobEl?.value || '').trim();
                // Read supplier email
                const supplierEmail = (document.getElementById('dirNewSupplierEmail')?.value || '').trim().toLowerCase();
                if (!notRegistered && gstin && !GSTIN_REGEX.test(gstin)) { showMessage('Invalid GSTIN format.'); return; }
                try {
                    const pinDigits = (pin || '').replace(/\D/g, '');
                    if (!pin || pinDigits.length !== 6) { showMessage('Enter valid 6-digit PIN.'); return; }
                } catch (_) {}
                if (!mobile) { showMessage('Enter supplier mobile.'); return; }
                // Enforce exact 10 digits for mobile at submit-time
                try {
                    const mobileDigits = (mobile || '').replace(/\D/g, '');
                    if (mobileDigits.length !== 10) { showMessage('Enter valid 10-digit mobile number.'); return; }
                } catch (_) {}
                const creditDaysRaw = (document.getElementById('dirNewSupplierCreditDays')?.value || '').toString().trim();
                const creditLimitRaw = (document.getElementById('dirNewSupplierCreditLimit')?.value || '').toString().trim();
                const creditDays = creditDaysRaw === '' ? 0 : (parseInt(creditDaysRaw, 10) || 0);
                const creditLimit = creditLimitRaw === '' ? 0 : (parseFloat(creditLimitRaw.replace(/,/g, '')) || 0);
                // read customer email from modal (used below when adding customer)
                const customerEmail = (document.getElementById('dirNewCustomerEmail')?.value || '').trim().toLowerCase();
                try {
                    await ensurePartyExists(name, 'supplier', true, { gstin: gstin || undefined, address: address || undefined, stateCode: stateCode || undefined, pin: pin || undefined, mobile: mobile || undefined, email: supplierEmail || undefined, creditDays: creditDays !== null ? creditDays : undefined, creditLimit: creditLimit !== null ? creditLimit : undefined });
                    upsertPartyInState('supplier', { name, gstin: gstin || undefined, address: address || undefined, stateCode: stateCode || undefined, pin: pin || undefined, mobile: mobile || undefined, email: supplierEmail || undefined, creditDays: creditDays !== null ? creditDays : undefined, creditLimit: creditLimit !== null ? creditLimit : undefined });
                    renderAdminLedgersPage();
                    showMessage('Supplier added to directory.');
                    cleanup();
                } catch (err) {
                    console.error('Directory add supplier error:', err);
                    showMessage('Failed to add supplier.');
                }
            });
        });
    }
    const addCustomerDirBtn = document.getElementById('addCustomerDirBtn');
    if (addCustomerDirBtn) {
        addCustomerDirBtn.addEventListener('click', () => {
            const modal = document.createElement('div');
            modal.id = 'dirAddCustomerModal';
            modal.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-40';
            modal.innerHTML = `
                <div class="bg-white rounded-md p-6 max-w-lg w-full">
                    <h3 class="text-lg font-semibold mb-2">Add Customer</h3>
                    <div class="space-y-3">
                        <input type="text" id="dirNewCustomerName" placeholder="Customer name" class="w-full border rounded p-2" required />
                        <input type="text" id="dirNewCustomerGstin" placeholder="GSTIN (optional)" class="w-full border rounded p-2" />
                        <label class="inline-flex items-center text-xs text-gray-700"><input type="checkbox" id="dirNewCustomerNotRegistered" class="mr-2"> Not GST-registered</label>
                        <div class="grid grid-cols-2 gap-2">
                            <select id="dirNewCustomerStateCode" class="w-full border rounded p-2">
                                <option value="">Select state</option>
                                ${GST_STATE_CODES.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                            </select>
                            <input type="tel" id="dirNewCustomerPin" placeholder="PIN" class="w-full border rounded p-2" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6" />
                        </div>
                        <textarea id="dirNewCustomerAddress" placeholder="Address" class="w-full border rounded p-2" rows="3" required></textarea>
                            <div class="flex">
                                <span class="inline-flex items-center px-3 rounded-l border border-r-0 bg-gray-100 text-gray-700">${state.siteSettings?.countryCode || '+91'}</span>
                                <input type="tel" id="dirNewCustomerMobile" placeholder="Mobile" class="w-full border rounded-r p-2" required />
                            </div>
                            <div>
                                <label class="block text-sm text-gray-700 mb-1">Email (optional)</label>
                                <input type="email" id="dirNewCustomerEmail" placeholder="customer@example.com" class="w-full border rounded p-2" />
                                <div id="dirNewCustomerEmailFeedback" class="text-xs text-red-600 mt-1 hidden" role="status" aria-live="polite"></div>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <input type="number" id="dirNewCustomerCreditDays" placeholder="Credit Days (Net)" class="w-full border rounded p-2" min="0" />
                                <input type="number" step="0.01" id="dirNewCustomerCreditLimit" placeholder="Credit Limit (₹)" class="w-full border rounded p-2" min="0" />
                            </div>
                        <div class="flex justify-end gap-3 mt-2">
                            <button id="dirCancelCustomerBtn" class="px-4 py-2 rounded bg-gray-200">Cancel</button>
                            <button id="dirAddCustomerBtn" class="px-4 py-2 rounded bg-blue-600 text-white">Add Customer</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            const cleanup = () => { try { modal.remove(); } catch(_) {} };
            const nameEl = document.getElementById('dirNewCustomerName');
            const gstEl = document.getElementById('dirNewCustomerGstin');
            const notRegEl = document.getElementById('dirNewCustomerNotRegistered');
            const addrEl = document.getElementById('dirNewCustomerAddress');
            const stateEl = document.getElementById('dirNewCustomerStateCode');
            const pinEl = document.getElementById('dirNewCustomerPin');
            const mobEl = document.getElementById('dirNewCustomerMobile');
            const addBtn = document.getElementById('dirAddCustomerBtn');
            const cancelBtn = document.getElementById('dirCancelCustomerBtn');

            // Ensure address, pin and mobile are required in this modal
            try { if (addrEl) addrEl.required = true; if (pinEl) pinEl.required = true; if (mobEl) mobEl.required = true; } catch(_) {}
            try { if (gstEl) enforceUppercaseInput(gstEl); } catch(_) {}
            try { if (gstEl) attachGstinValidation(gstEl, null); } catch(_) {}
            try { if (mobEl) attachMobileValidation(mobEl, null); } catch(_) {}
            try { if (pinEl) attachPinBehavior(pinEl, null); } catch(_) {}
            try { const emailEl = document.getElementById('dirNewCustomerEmail'); const emailFb = document.getElementById('dirNewCustomerEmailFeedback'); if (emailEl) { attachEmailValidation(emailEl, emailFb); try { enforceLowercaseInput(emailEl); } catch(_) {} } } catch(_) {}
            try { if (nameEl) attachNameCapitalization(nameEl); } catch(_) {}
            try { if (addrEl) attachNameCapitalization(addrEl); } catch(_) {}
            // Wire the Not GST-registered checkbox for this directory Add Customer modal
            try {
                if (notRegEl && gstEl) {
                    const toggleDirCustGstModal = () => {
                        try {
                            if (notRegEl.checked) {
                                gstEl.value = '';
                                try { gstEl.classList.remove('tiaras-valid'); gstEl.classList.remove('tiaras-invalid'); gstEl.removeAttribute && gstEl.removeAttribute('aria-invalid'); } catch(_) {}
                                gstEl.disabled = true;
                                // hide any inline feedback if present
                                try { const fb = document.getElementById('dirNewCustomerGstinFeedback'); if (fb) { fb.classList.add('hidden'); fb.textContent = ''; } } catch(_) {}
                            } else {
                                gstEl.disabled = false;
                            }
                        } catch(_) {}
                    };
                    notRegEl.addEventListener('change', toggleDirCustGstModal);
                    toggleDirCustGstModal();
                }
            } catch(_) {}
            // Auto-apply state code from GSTIN (debounced)
            try {
                let _debApplyCust = null;
                const applyStateFromGstinCust = () => {
                    try {
                        const vFull = (gstEl.value || '').trim().toUpperCase();
                        if (!vFull || vFull.length < 2) return;
                        const code = getStateCodeFromGstin(vFull);
                        if (code && stateEl) {
                            stateEl.value = code;
                            try { document.dispatchEvent(new CustomEvent('gstin:stateApplied', { detail: { inputId: gstEl.id, stateCode: code } })); } catch(_) {}
                        }
                    } catch(_) {}
                    _debApplyCust = null;
                };
                const scheduleApplyCust = () => { if (_debApplyCust) clearTimeout(_debApplyCust); _debApplyCust = setTimeout(applyStateFromGstinCust, 360); };
                if (gstEl) {
                    gstEl.addEventListener('input', scheduleApplyCust);
                    gstEl.addEventListener('change', scheduleApplyCust);
                    gstEl.addEventListener('blur', scheduleApplyCust);
                }
            } catch(_) {}
            // Default state to merchant state
            try { if (stateEl) stateEl.value = state.siteSettings?.merchantStateCode || getStateCodeFromGstin(state.siteSettings?.merchantGstin || '') || ''; } catch(_) {}
            cancelBtn.addEventListener('click', (e) => { e.preventDefault(); cleanup(); });
            modal.addEventListener('click', (e) => {
                if (e.target !== modal) return;
                try { const sel = window.getSelection ? window.getSelection().toString() : ''; if (sel && sel.length > 0) return; } catch(_) {}
                cleanup();
            });
            addBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                const name = (nameEl.value || '').trim();
                if (!name) { showMessage('Enter customer name.'); return; }
                const notRegistered = !!(notRegEl && notRegEl.checked);
                let gstin = (gstEl?.value || '').trim().toUpperCase();
                if (notRegistered) gstin = '';
                if (!notRegistered && gstin && !GSTIN_REGEX.test(gstin)) { showMessage('Invalid GSTIN format.'); return; }
                const address = (addrEl?.value || '').trim();
                const stateCode = (stateEl?.value || '').trim() || undefined;
                const pin = (pinEl?.value || '').trim();
                const mobile = (mobEl?.value || '').trim();
                if (!address) { showMessage('Enter customer address.'); return; }
                try {
                    const pinDigits = (pin || '').replace(/\D/g, '');
                    if (!pin || pinDigits.length !== 6) { showMessage('Enter valid 6-digit PIN.'); return; }
                } catch (_) {}
                if (!mobile) { showMessage('Enter customer mobile.'); return; }
                // Enforce exact 10 digits for mobile at submit-time
                try {
                    const mobileDigits = (mobile || '').replace(/\D/g, '');
                    if (mobileDigits.length !== 10) { showMessage('Enter valid 10-digit mobile number.'); return; }
                } catch (_) {}
                const creditDaysRaw = (document.getElementById('dirNewCustomerCreditDays')?.value || '').toString().trim();
                const creditLimitRaw = (document.getElementById('dirNewCustomerCreditLimit')?.value || '').toString().trim();
                const creditDays = creditDaysRaw === '' ? 0 : (parseInt(creditDaysRaw, 10) || 0);
                const creditLimit = creditLimitRaw === '' ? 0 : (parseFloat(creditLimitRaw.replace(/,/g, '')) || 0);
                // Read customer email from modal before using it (normalize to lowercase)
                const customerEmail = (document.getElementById('dirNewCustomerEmail')?.value || '').trim().toLowerCase();
                try {
                    await ensurePartyExists(name, 'customer', true, { gstin: gstin || undefined, address: address || undefined, stateCode: stateCode || undefined, pin: pin || undefined, mobile: mobile || undefined, email: customerEmail || undefined, creditDays: creditDays !== null ? creditDays : undefined, creditLimit: creditLimit !== null ? creditLimit : undefined });
                    upsertPartyInState('customer', { name, gstin: gstin || undefined, address: address || undefined, stateCode: stateCode || undefined, pin: pin || undefined, mobile: mobile || undefined, email: customerEmail || undefined, creditDays: creditDays !== null ? creditDays : undefined, creditLimit: creditLimit !== null ? creditLimit : undefined });
                    renderAdminLedgersPage();
                    showMessage('Customer added to directory.');
                    cleanup();
                } catch (err) {
                    console.error('Directory add customer error:', err);
                    showMessage('Failed to add customer.');
                }
            });
        });
    }

    // Start posting time ticker to keep displayed posting times up-to-date
    try { startPostingTimeTicker(); } catch(_) {}

    // Migration button handler
    const migBtn = document.getElementById('migratePartiesBtn');
    const migStatus = document.getElementById('migratePartiesStatus');
    if (migBtn) {
        migBtn.addEventListener('click', async () => {
            try {
                migBtn.disabled = true; migBtn.classList.add('opacity-60');
                if (migStatus) migStatus.textContent = 'Migrating...';
                const res = await migratePartyMasters();
                if (migStatus) migStatus.textContent = '';
                showMessage(`Migration complete. Added ${res.suppliers} suppliers and ${res.customers} customers.`);
                renderAdminLedgersPage();
            } catch (err) {
                console.error('Migration error:', err);
                if (migStatus) migStatus.textContent = '';
                showMessage('Migration failed. See console for details.');
            } finally {
                migBtn.disabled = false; migBtn.classList.remove('opacity-60');
            }
        });
    }

    // Edit party handlers (delegated)
    container.querySelectorAll('.edit-party-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.getAttribute('data-type');
            const name = btn.getAttribute('data-name') || '';
            const gstin = btn.getAttribute('data-gstin') || '';
            const address = btn.getAttribute('data-address') || '';
            const docId = btn.getAttribute('data-docid') || '';
                try {
                    // Attempt to find an existing party in state to retrieve isGstRegistered flag and extra fields
                    let isGstRegistered = undefined;
                    let stateCodeVal = '';
                    let pinVal = '';
                    let mobileVal = '';
                    if (docId) {
                        const list = type === 'supplier' ? (state.allSuppliers || []) : (state.allCustomers || []);
                        const found = list.find(x => x.id === docId || (x.name||'').trim().toLowerCase() === (name||'').trim().toLowerCase());
                        if (found && typeof found.isGstRegistered !== 'undefined') isGstRegistered = !!found.isGstRegistered;
                        if (found) {
                            stateCodeVal = found.stateCode || '';
                            pinVal = found.pin || '';
                            mobileVal = found.mobile || '';
                        }
                    }
                    showPartyEditModal({ type, name, gstin, address, docId, isGstRegistered, stateCode: stateCodeVal, pin: pinVal, mobile: mobileVal });
                } catch (_) {
                    showPartyEditModal({ type, name, gstin, address, docId });
                }
        });
    });

        // Small helper: show a styled confirmation modal and return a Promise<boolean>
        const showConfirmModal = (message) => {
            return new Promise(resolve => {
                try {
                    const modal = document.createElement('div');
                    modal.className = 'fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50';
                    modal.setAttribute('role', 'dialog');
                    modal.setAttribute('aria-modal', 'true');
                    modal.setAttribute('aria-hidden', 'false');
                    modal.tabIndex = -1;
                    modal.innerHTML = `
                        <div class="max-w-md w-full rounded-lg bg-gray-800 text-white p-6" role="document">
                            <div id="confirmModalMsg" class="text-sm mb-4">${message.replace(/"/g, '&quot;')}</div>
                            <div class="flex justify-end gap-3">
                                <button id="confirmCancelBtn" class="px-4 py-2 rounded-full bg-blue-800 text-white">Cancel</button>
                                <button id="confirmOkBtn" class="px-4 py-2 rounded-full bg-blue-200 text-black">OK</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    // focus management & trap
                    const cleanup = () => { try { if (modal && modal.parentNode) modal.parentNode.removeChild(modal); } catch(_) {} };
                    const okBtn = modal.querySelector('#confirmOkBtn');
                    const cancelBtn = modal.querySelector('#confirmCancelBtn');
                    const focusable = () => Array.from(modal.querySelectorAll('a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled])'));
                    const prev = document.activeElement;
                    const onOk = () => { try { cleanup(); } catch(_){}; try { if (prev && typeof prev.focus === 'function') prev.focus(); } catch(_){}; resolve(true); };
                    const onCancel = () => { try { cleanup(); } catch(_){}; try { if (prev && typeof prev.focus === 'function') prev.focus(); } catch(_){}; resolve(false); };
                    okBtn && okBtn.addEventListener('click', onOk);
                    cancelBtn && cancelBtn.addEventListener('click', onCancel);
                    modal.addEventListener('click', (e) => {
                        if (e.target !== modal) return;
                        try { const sel = window.getSelection ? window.getSelection().toString() : ''; if (sel && sel.length > 0) return; } catch(_) {}
                        onCancel();
                    });
                    // trap keyboard navigation and ESC
                    const onKey = (e) => {
                        if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
                        if (e.key === 'Tab') {
                            const f = focusable();
                            if (!f.length) return;
                            const first = f[0];
                            const last = f[f.length - 1];
                            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                        }
                    };
                    document.addEventListener('keydown', onKey);
                    // cleanup key listener after resolution by wrapping resolve
                    const originalResolve = resolve;
                    resolve = (v) => { try { document.removeEventListener('keydown', onKey); } catch(_) {}; originalResolve(v); };
                    // show and focus
                    try { modal.querySelector('#confirmOkBtn')?.focus(); } catch(_) {}
                } catch (err) {
                    console.error('showConfirmModal error', err);
                    resolve(false);
                }
            });
        };

        // Delete party handlers (soft-delete: set isDeleted = true) - delegated to each button
        container.querySelectorAll('.delete-party-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const type = btn.getAttribute('data-type');
                const docId = btn.getAttribute('data-docid') || '';
                const name = (btn.getAttribute('data-name') || '').trim();
                // Run pre-deletion checks using in-memory state to avoid accidental removal when related data exists
                try {
                    const list = (type === 'supplier' ? (state.allSuppliers || []) : (state.allCustomers || []));
                    const found = list.find(x => (x.id || '') === docId || (x.name || '').trim().toLowerCase() === name.toLowerCase());
                    const gstin = (found && found.gstin) ? String(found.gstin).trim() : '';

                    // Check related documents in local state
                    const related = { purchases: false, orders: false, ledger: false };
                    if (type === 'supplier') {
                        related.purchases = (state.allPurchases || []).some(p => !p.isDeleted && (((p.supplierName||'').trim().toLowerCase() === name.toLowerCase()) || (gstin && ((p.supplierGstin||'').trim() === gstin))));
                        // Suppliers rarely appear in orders; skip orders check for suppliers
                    } else {
                        // customer: check orders where shippingInfo.fullName matches
                        related.orders = (state.allOrders || []).some(o => !o.isDeleted && ((o.shippingInfo && (o.shippingInfo.fullName || '').trim().toLowerCase() === name.toLowerCase()) || ( (o.customerName||'').trim().toLowerCase() === name.toLowerCase() )));
                    }
                    // Generic ledger check: look for party-like fields that may reference this name
                    const ledgerSources = [].concat(state.allCashLedger || [], state.allBankLedger || []);
                    related.ledger = ledgerSources.some(l => {
                        if (!l || l.isDeleted) return false;
                        const candidates = [l.party, l.partyName, l.accountName, l.party || l.accountName || l.account || ''];
                        return candidates.some(v => (v || '').toString().toLowerCase().includes(name.toLowerCase()));
                    });

                    const blockers = Object.keys(related).filter(k => related[k]);
                    if (blockers.length) {
                        showMessage(`Cannot delete ${type} "${name}" because related records exist: ${blockers.join(', ')}. Reassign or mark those records deleted first.`);
                        return;
                    }

                    // Confirm & require master password for deletion (use styled modal)
                    const confirmed = await showConfirmModal(`Delete ${type} "${name}"? This will mark the record as deleted.`);
                    if (!confirmed) return;
                    const ok = await verifyMasterPassword(`delete ${type} ${name}`);
                    if (!ok) {
                        showMessage('Deletion cancelled: master password required.');
                        return;
                    }

                    const colPath = type === 'supplier' ? suppliersColPath : customersColPath;
                    if (docId) {
                        // Soft-delete by setting isDeleted flag so historical data remains intact
                        await updateDoc(doc(db, colPath, docId), { isDeleted: true, updatedAt: serverTimestamp() });
                    }
                    // Remove from local state arrays to immediately reflect change
                    try {
                        if (type === 'supplier') {
                            state.allSuppliers = (state.allSuppliers || []).filter(s => ((s.id || '') !== docId) && ((s.name || '').trim().toLowerCase() !== name.toLowerCase()));
                        } else {
                            state.allCustomers = (state.allCustomers || []).filter(c => ((c.id || '') !== docId) && ((c.name || '').trim().toLowerCase() !== name.toLowerCase()));
                        }
                    } catch (_) {}
                    renderAdminLedgersPage();
                    showMessage('Party deleted.');
                } catch (err) {
                    console.error('Delete party error:', err);
                    showMessage('Failed to delete party.');
                }
            });
        });

    // Copy GSTIN handlers (buttons have aria-labels and are keyboard focusable)
    container.querySelectorAll('.copy-gstin-btn').forEach(btn => {
        try { btn.setAttribute('aria-label', btn.getAttribute('title') || 'Copy GSTIN'); btn.setAttribute('tabindex', '0'); } catch(_) {}
        const doCopy = async (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            const gst = btn.getAttribute('data-gstin') || '';
            try {
                if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(gst);
                    showMessage('GSTIN copied to clipboard');
                } else {
                    const ta = document.createElement('textarea'); ta.value = gst; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                    showMessage('GSTIN copied to clipboard');
                }
            } catch (err) {
                console.error('Copy failed', err);
                showMessage('Unable to copy GSTIN');
            }
        };
        btn.addEventListener('click', doCopy);
        btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); doCopy(ev); } });
    });

    // Table sort handlers (persisted and accessible): clicking or pressing Enter/Space on a header saves the sort
    container.querySelectorAll('.party-table thead th.sortable').forEach(th => {
        const activateSort = (ev) => {
            const table = th.closest('table');
            if (!table) return;
            const type = table.getAttribute('data-type') || 'suppliers';
            const key = th.getAttribute('data-key');
            if (!key) return;
            const cur = (function(){ try { return JSON.parse(localStorage.getItem(`party_sort_${type}`) || 'null') } catch(_) { return null; } })() || { key: null, dir: 'asc' };
            const dir = (cur.key === key && cur.dir === 'asc') ? 'desc' : 'asc';
            try { localStorage.setItem(`party_sort_${type}`, JSON.stringify({ key, dir })); } catch(_) {}
            // reset to first page when changing sort
            if (type === 'suppliers') state.ui.partySuppliersPage = 1; else state.ui.partyCustomersPage = 1;
            // re-render the page to apply persisted sort (handlers will be re-attached)
            try { renderAdminLedgersPage(); } catch (e) { console.error('Re-render after sort failed', e); }
        };
        th.addEventListener('click', activateSort);
        th.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); activateSort(ev); } });
    });

    // Compact toggle: toggles padding/text size on party tables
    const compactBtn = container.querySelector('#partyCompactToggle');
    if (compactBtn) {
        compactBtn.addEventListener('click', () => {
            const body = container.querySelector('#partyListBody');
            if (!body) return;
            const enabled = body.classList.toggle('party-compact');
            const tables = body.querySelectorAll('table.party-table');
            tables.forEach(tbl => {
                tbl.querySelectorAll('td, th').forEach(cell => {
                    if (enabled) {
                        cell.classList.remove('p-2'); cell.classList.add('p-1','text-xs');
                    } else {
                        cell.classList.remove('p-1','text-xs'); cell.classList.add('p-2');
                    }
                });
            });
        });
    }

    // Ledger ref-link handlers (open transfer/details modal)
    container.querySelectorAll('.ref-link').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const refId = btn.getAttribute('data-ref');
            if (!refId) return;
            try { showTransferModal(refId); } catch (err) { console.warn('showTransferModal failed', err); }
        });
        btn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); try { showTransferModal(btn.getAttribute('data-ref')); } catch(_){} } });
    });

    // Pagination controls wiring for suppliers
    const supPrev = container.querySelector('#supPrevBtn');
    const supNext = container.querySelector('#supNextBtn');
    const supInput = container.querySelector('#supPageInput');
    const supSize = container.querySelector('#supPageSizeSel');
    if (supPrev) supPrev.addEventListener('click', () => { state.ui.partySuppliersPage = Math.max(1, (state.ui.partySuppliersPage||1) - 1); renderAdminLedgersPage(); });
    if (supNext) supNext.addEventListener('click', () => { state.ui.partySuppliersPage = Math.min((suppliersPaged.totalPages||1), (state.ui.partySuppliersPage||1) + 1); renderAdminLedgersPage(); });
    if (supInput) supInput.addEventListener('change', () => { const v = parseInt(supInput.value||'1',10)||1; state.ui.partySuppliersPage = Math.min(Math.max(1,v), suppliersPaged.totalPages||1); renderAdminLedgersPage(); });
    if (supSize) supSize.addEventListener('change', () => { const v = parseInt(supSize.value||'25',10)||25; state.ui.partyPageSize = v; state.ui.partySuppliersPage = 1; renderAdminLedgersPage(); });

    // Pagination controls wiring for customers
    const custPrev = container.querySelector('#custPrevBtn');
    const custNext = container.querySelector('#custNextBtn');
    const custInput = container.querySelector('#custPageInput');
    const custSize = container.querySelector('#custPageSizeSel');
    if (custPrev) custPrev.addEventListener('click', () => { state.ui.partyCustomersPage = Math.max(1, (state.ui.partyCustomersPage||1) - 1); renderAdminLedgersPage(); });
    if (custNext) custNext.addEventListener('click', () => { state.ui.partyCustomersPage = Math.min((customersPaged.totalPages||1), (state.ui.partyCustomersPage||1) + 1); renderAdminLedgersPage(); });
    if (custInput) custInput.addEventListener('change', () => { const v = parseInt(custInput.value||'1',10)||1; state.ui.partyCustomersPage = Math.min(Math.max(1,v), customersPaged.totalPages||1); renderAdminLedgersPage(); });
    if (custSize) custSize.addEventListener('change', () => { const v = parseInt(custSize.value||'25',10)||25; state.ui.partyPageSize = v; state.ui.partyCustomersPage = 1; renderAdminLedgersPage(); });

    // Drilldown handlers
    container.querySelectorAll('.party-row').forEach(row => {
        row.addEventListener('click', () => {
            const party = row.getAttribute('data-party');
            const ledger = row.getAttribute('data-ledger');
            showLedgerDrilldown(party, ledger);
        });
    });

    // Pagination event wiring moved to attachAdminListeners() (delegated handlers and persistence)
}

// Ensure a party exists in master lists; if missing, add it.
async function ensurePartyExists(name, type, forceAdd = false, details = {}) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const list = type === 'supplier' ? (state.allSuppliers || []) : (state.allCustomers || []);
    const exists = list.some(x => (x.name || '').toLowerCase() === trimmed.toLowerCase());
    const colPath = type === 'supplier' ? suppliersColPath : customersColPath;
    if (exists) {
        if (forceAdd && details && (details.gstin || details.address)) {
            // Update existing party (first match) with provided details
            const entry = list.find(x => (x.name || '').toLowerCase() === trimmed.toLowerCase());
            if (entry && entry.id) {
                try {
                    await updateDoc(doc(db, colPath, entry.id), {
                        ...(details.gstin ? { gstin: details.gstin } : {}),
                        ...(details.address ? { address: details.address } : {}),
                        ...(details.stateCode ? { stateCode: details.stateCode } : {}),
                        ...(details.pin ? { pin: details.pin } : {}),
                        ...(details.mobile ? { mobile: details.mobile } : {}),
                        ...(details.email ? { email: details.email } : {}),
                        updatedAt: serverTimestamp(),
                    });
                } catch (e) { /* ignore update failure */ }
            }
        }
        return;
    }
    // Create a doc with auto-id; store name and any details
    const payload = { name: trimmed, createdAt: serverTimestamp(), isDeleted: false };
    if (details && details.gstin) payload.gstin = details.gstin;
    if (details && details.address) payload.address = details.address;
    if (details && details.stateCode) payload.stateCode = details.stateCode;
    if (details && details.pin) payload.pin = details.pin;
    if (details && details.mobile) payload.mobile = details.mobile;
    if (details && details.email) payload.email = details.email;
    await addDoc(collection(db, colPath), payload);
}

// Optimistically insert or update a party in local state for instant UI refresh
function upsertPartyInState(type, entry) {
    const listName = type === 'supplier' ? 'allSuppliers' : 'allCustomers';
    const list = Array.isArray(state[listName]) ? state[listName].slice() : [];
    const key = (entry.name || '').toLowerCase();
    const idx = list.findIndex(x => (x.name || '').toLowerCase() === key);
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...entry };
    } else {
        list.unshift({ ...entry });
    }
    state[listName] = list;
        // When a new party is added/updated, reset ledger pages so the new entry is visible
        try {
            if (type === 'supplier') {
                state.creditorsPage = 1;
            } else {
                state.debtorsPage = 1;
            }
            // If admin is open, refresh relevant admin tabs so UI reflects the change immediately
            if (state.currentPage === 'admin') {
                if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
                else if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
            }
        } catch (e) {
            // non-fatal UI refresh guard
            console.warn('upsertPartyInState: refresh failed', e?.message || e);
        }
}

// Migrate legacy party masters (suppliers/customers) into new collections. Idempotent by name.
async function migratePartyMasters() {
    // Read both legacy and new collections
    const [legacySupSnap, legacyCustSnap, newSupSnap, newCustSnap] = await Promise.all([
        getDocs(collection(db, suppliersLegacyColPath)).catch(() => ({ docs: [] })),
        getDocs(collection(db, customersLegacyColPath)).catch(() => ({ docs: [] })),
        getDocs(collection(db, suppliersColPath)).catch(() => ({ docs: [] })),
        getDocs(collection(db, customersColPath)).catch(() => ({ docs: [] })),
    ]);

    const norm = s => (String(s || '').trim().toLowerCase());

    const existingSup = new Set(newSupSnap.docs
        .map(d => d.data()?.name)
        .filter(Boolean)
        .map(norm));
    const existingCust = new Set(newCustSnap.docs
        .map(d => d.data()?.name)
        .filter(Boolean)
        .map(norm));

    let addedSuppliers = 0, addedCustomers = 0;

    // Suppliers
    for (const docSnap of legacySupSnap.docs) {
        const data = docSnap.data() || {};
        if (data.isDeleted) continue;
        const name = String(data.name || '').trim();
        if (!name) continue;
        const key = norm(name);
        if (existingSup.has(key)) continue;
        await addDoc(collection(db, suppliersColPath), {
            name,
            isDeleted: false,
            createdAt: serverTimestamp(),
            migratedFrom: 'legacy',
            legacyId: docSnap.id,
        });
        existingSup.add(key);
        addedSuppliers++;
    }

    // Customers
    for (const docSnap of legacyCustSnap.docs) {
        const data = docSnap.data() || {};
        if (data.isDeleted) continue;
        const name = String(data.name || '').trim();
        if (!name) continue;
        const key = norm(name);
        if (existingCust.has(key)) continue;
        await addDoc(collection(db, customersColPath), {
            name,
            isDeleted: false,
            createdAt: serverTimestamp(),
            migratedFrom: 'legacy',
            legacyId: docSnap.id,
        });
        existingCust.add(key);
        addedCustomers++;
    }

    return { suppliers: addedSuppliers, customers: addedCustomers };
}

// Show a modal with ledger entries for a party within the selected date range
function showLedgerDrilldown(partyName, ledgerType) {
    const start = new Date(state.ledgerStartDate); start.setHours(0,0,0,0);
    const end = new Date(state.ledgerEndDate); end.setHours(23,59,59,999);
    const inRange = (d) => {
        const dt = _toDate(d) || new Date(d?.seconds ? d.seconds*1000 : Date.now());
        return dt >= start && dt <= end;
    };
    const entries = (ledgerType === 'creditors' ? (state.allCreditorsLedger || []) : (state.allDebtorsLedger || []))
        .filter(e => !e.isDeleted && (e.partyName || '').toLowerCase() === (partyName || '').toLowerCase())
        .filter(e => inRange(e.date))
        .slice()
        .sort((a,b) => (_toDate(a.date) - _toDate(b.date)));

    let running = 0;
    const rows = entries.map(e => {
        const d = formatDate(e.date);
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        running += (ledgerType === 'creditors') ? (credit - debit) : (debit - credit);
        const ref = e.invoiceNumber || e.refId || '';
        return `<tr class="border-b"><td class="p-2">${d}</td><td class="p-2">${e.refType || ''}</td><td class="p-2">${ref}</td><td class="p-2 text-right text-red-600">${debit?debit.toFixed(2):'-'}</td><td class="p-2 text-right text-green-700">${credit?credit.toFixed(2):'-'}</td><td class="p-2 text-right font-semibold">${running.toFixed(2)}</td></tr>`;
    }).join('') || `<tr><td colspan="6" class="p-4 text-center text-gray-500">No entries in range</td></tr>`;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-[90%] max-w-4xl">
            <div class="flex items-center justify-between px-4 py-3 border-b">
                <h4 class="font-semibold">${ledgerType==='creditors'?'Creditors':'Debtors'} Ledger · ${partyName}</h4>
                <button class="px-3 py-1 bg-gray-200 rounded" id="closeLedgerModal">Close</button>
            </div>
            <div class="p-4 overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-gray-100">
                        <tr>
                            <th class="p-2 text-left">Date</th>
                            <th class="p-2 text-left">Ref Type</th>
                            <th class="p-2 text-left">Ref</th>
                            <th class="p-2 text-right">Debit (₹)</th>
                            <th class="p-2 text-right">Credit (₹)</th>
                            <th class="p-2 text-right">Running Bal (₹)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>`;
    document.body.appendChild(modal);

    // Enforce uppercase and attach GSTIN validation for the party edit modal
    try { enforceUppercaseInput(document.getElementById('partyEditGstin')); } catch (_) {}
    try { attachGstinValidation(document.getElementById('partyEditGstin'), document.getElementById('partyEditGstinFeedback')); } catch (_) {}
    // Enforce uppercase on the modal GSTIN input
    try { enforceUppercaseInput(document.getElementById('partyEditGstin')); } catch (_) {}
    modal.querySelector('#closeLedgerModal').addEventListener('click', () => {
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        try {
            const sel = window.getSelection ? window.getSelection().toString() : '';
            if (sel && sel.length > 0) return; // user is selecting text — don't dismiss
        } catch(_) {}
        modal.remove();
    });
}

// Modal to edit a party (supplier/customer)
function showPartyEditModal({ type, name, gstin, address, docId, isGstRegistered, stateCode, pin, mobile, creditDays, creditLimit }) {
    const title = type === 'supplier' ? 'Edit Supplier' : 'Edit Customer';
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl w-[90%] max-w-lg">
            <div class="flex items-center justify-between px-4 py-3 border-b">
                <h4 class="font-semibold">${title}</h4>
                <button class="px-3 py-1 bg-gray-200 rounded" id="closePartyEditModal">Close</button>
            </div>
            <div class="p-4 space-y-3">
                <div>
                    <label class="block text-sm text-gray-700 mb-1">Name</label>
                    <input type="text" id="partyEditName" class="w-full border rounded p-2" value="${(name||'').replace(/"/g,'&quot;')}" required>
                </div>
                <div>
                    <label class="block text-sm text-gray-700 mb-1">GSTIN (optional)</label>
                    <input type="text" id="partyEditGstin" data-testid="partyEditGstin" class="w-full border rounded p-2" value="${(gstin||'').replace(/"/g,'&quot;')}" pattern="[0-9A-Z]{15}" title="15 characters: A-Z and 0-9">
                    <div id="partyEditGstinFeedback" data-testid="partyEditGstinFeedback" role="status" aria-live="polite" class="text-xs text-red-600 mt-1 hidden" data-validation-state=""></div>
                    <div class="mt-2">
                        <label class="inline-flex items-center text-sm text-gray-700">
                            <input type="checkbox" id="partyEditNotRegistered" data-testid="partyEditNotRegistered" title="Mark supplier as not GST-registered. This disables GSTIN and related GST fields." class="mr-2"> Not GST-registered
                        </label>
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-gray-700 mb-1">Address</label>
                    <textarea id="partyEditAddress" class="w-full border rounded p-2" rows="3">${(address||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">State</label>
                        <select id="partyEditStateCode" class="w-full border rounded p-2">
                            <option value="">Select state</option>
                            ${GST_STATE_CODES.map(s => `<option value="${s.code}">${s.name} (${s.code})</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">PIN / Pincode</label>
                        <input type="tel" id="partyEditPin" class="w-full border rounded p-2" value="${(pin||'')}" placeholder="PIN / Pincode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" minlength="6">
                    </div>
                </div>
                <div>
                    <label class="block text-sm text-gray-700 mb-1">Mobile</label>
                    <div class="flex">
                        <span class="inline-flex items-center px-3 rounded-l border border-r-0 bg-gray-100 text-gray-700">${state.siteSettings?.countryCode || '+91'}</span>
                        <input type="tel" id="partyEditMobile" class="w-full border rounded-r p-2" value="${(mobile||'')}" placeholder="Mobile number">
                    </div>
                    <div id="partyEditMobileFeedback" class="text-xs text-red-600 mt-1 hidden" role="status" aria-live="polite"></div>
                </div>
                <div>
                    <label class="block text-sm text-gray-700 mb-1">Email (optional)</label>
                    <input type="email" id="partyEditEmail" class="w-full border rounded p-2" value="${(typeof email !== 'undefined' && email !== null) ? (email||'') : ''}" placeholder="name@example.com">
                    <div id="partyEditEmailFeedback" class="text-xs text-red-600 mt-1 hidden" role="status" aria-live="polite"></div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">Credit Days (Net)</label>
                        <input type="number" id="partyEditCreditDays" class="w-full border rounded p-2" value="${(typeof creditDays !== 'undefined' && creditDays !== null) ? String(creditDays) : ''}" placeholder="e.g., 30">
                    </div>
                    <div>
                        <label class="block text-sm text-gray-700 mb-1">Credit Limit (₹)</label>
                        <input type="number" step="0.01" id="partyEditCreditLimit" class="w-full border rounded p-2" value="${(typeof creditLimit !== 'undefined' && creditLimit !== null) ? String(creditLimit) : ''}" placeholder="e.g., 50000.00">
                    </div>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button id="partyEditSaveBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closePartyEditModal').addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        try {
            const sel = window.getSelection ? window.getSelection().toString() : '';
            if (sel && sel.length > 0) return; // don't dismiss while selecting text
        } catch(_) {}
        close();
    });
    // Setup GSTIN input validation and the not-registered checkbox behavior
    try {
    const gstEl = document.getElementById('partyEditGstin');
    const feedbackEl = document.getElementById('partyEditGstinFeedback');
    const notRegEl = document.getElementById('partyEditNotRegistered');
    const mobileEl = document.getElementById('partyEditMobile');
    const mobileFb = document.getElementById('partyEditMobileFeedback');
        // Initialize checkbox state: prefer explicit isGstRegistered if provided, else infer from GSTIN presence
        try {
            const initialNotRegistered = (typeof isGstRegistered !== 'undefined') ? (!isGstRegistered) : (!(gstin && gstin.trim()));
            if (notRegEl) notRegEl.checked = !!initialNotRegistered;
            const toggle = () => {
                try {
                        if (notRegEl && notRegEl.checked) {
                        if (gstEl) { gstEl.disabled = true; gstEl.value = ''; try { gstEl.classList.remove('tiaras-valid'); gstEl.classList.remove('tiaras-invalid'); gstEl.removeAttribute && gstEl.removeAttribute('aria-invalid'); } catch(_) {} }
                        if (feedbackEl) { try { feedbackEl.classList.add('hidden'); feedbackEl.textContent = ''; } catch(_) {} }
                    } else {
                        if (gstEl) gstEl.disabled = false;
                    }
                } catch (_) {}
            };
            if (notRegEl) notRegEl.addEventListener('change', toggle);
            toggle();
        } catch (_) {}
        try { if (gstEl) enforceUppercaseInput(gstEl); } catch (_) {}
            try { if (gstEl) attachGstinValidation(gstEl, feedbackEl); } catch (_) {}
            // Auto-apply state code from GSTIN in the edit modal (debounced)
            try {
                let _debParty = null;
                const applyStateFromGstinParty = () => {
                    try {
                        if (notRegEl && notRegEl.checked) return;
                        const vFull = (gstEl.value || '').trim().toUpperCase();
                        if (!vFull || vFull.length < 15) return;
                        const v = vFull.substring(0,15);
                        if (GSTIN_REGEX.test(v)) {
                            const code = getStateCodeFromGstin(v);
                            if (code) {
                                const stateSel = document.getElementById('partyEditStateCode');
                                if (stateSel) stateSel.value = code;
                                try { document.dispatchEvent(new CustomEvent('gstin:stateApplied', { detail: { inputId: gstEl.id, stateCode: code } })); } catch(_) {}
                            }
                        }
                    } catch(_) {}
                    _debParty = null;
                };
                const scheduleApplyParty = () => { if (_debParty) clearTimeout(_debParty); _debParty = setTimeout(applyStateFromGstinParty, 360); };
                if (gstEl) {
                    gstEl.addEventListener('input', scheduleApplyParty);
                    gstEl.addEventListener('change', scheduleApplyParty);
                    gstEl.addEventListener('blur', scheduleApplyParty);
                }
            } catch(_) {}
            try { if (mobileEl) attachMobileValidation(mobileEl, mobileFb); } catch(_) {}
            try { const pinElLocal = document.getElementById('partyEditPin'); if (pinElLocal) attachPinBehavior(pinElLocal, null); } catch(_) {}
                try { const partyEmailEl = document.getElementById('partyEditEmail'); const partyEmailFb = document.getElementById('partyEditEmailFeedback'); if (partyEmailEl) attachEmailValidation(partyEmailEl, partyEmailFb); } catch(_) {}
                    try { const partyNameEl = document.getElementById('partyEditName'); if (partyNameEl) attachNameCapitalization(partyNameEl); } catch(_) {}
    } catch (_) {}

    // Prefill state/pin/mobile if provided
    try {
        if (typeof stateCode !== 'undefined' && document.getElementById('partyEditStateCode')) document.getElementById('partyEditStateCode').value = stateCode || '';
        if (typeof pin !== 'undefined' && document.getElementById('partyEditPin')) document.getElementById('partyEditPin').value = pin || '';
        if (typeof mobile !== 'undefined' && document.getElementById('partyEditMobile')) document.getElementById('partyEditMobile').value = mobile || '';
    } catch (_) {}

    modal.querySelector('#partyEditSaveBtn').addEventListener('click', async () => {
        const newName = document.getElementById('partyEditName').value.trim();
        const newGstinRaw = document.getElementById('partyEditGstin').value.trim();
        const newAddr = document.getElementById('partyEditAddress').value.trim();
        const newState = (document.getElementById('partyEditStateCode')?.value || '').trim();
        const newPin = (document.getElementById('partyEditPin')?.value || '').trim();
        const newMobile = (document.getElementById('partyEditMobile')?.value || '').trim();
        const newCreditDaysRaw = (document.getElementById('partyEditCreditDays')?.value || '').toString().trim();
        const newCreditLimitRaw = (document.getElementById('partyEditCreditLimit')?.value || '').toString().trim();
        const newCreditDays = newCreditDaysRaw === '' ? 0 : (parseInt(newCreditDaysRaw, 10) || 0);
        const newCreditLimit = newCreditLimitRaw === '' ? 0 : (parseFloat(newCreditLimitRaw.replace(/,/g, '')) || 0);
        const newEmail = (document.getElementById('partyEditEmail')?.value || '').trim().toLowerCase();
        const notRegistered = !!(document.getElementById('partyEditNotRegistered') && document.getElementById('partyEditNotRegistered').checked);
        let newGstin = newGstinRaw;
        if (notRegistered) newGstin = '';
        if (!newName) { showMessage('Name is required.'); return; }
        // Address is mandatory when creating a new party
        try {
            if (!docId && !newAddr) { showMessage('Enter address. Address is required when adding a new party.'); return; }
        } catch (_) {}

        // Mobile is mandatory when adding a new party (creation mode). Enforce exactly 10 digits.
        try {
            if (!docId && !newMobile) { showMessage('Enter mobile number. Mobile is required when adding a new party.'); return; }
            const newMobileDigits = (newMobile || '').replace(/\D/g, '');
            if (newMobileDigits.length !== 10) { showMessage('Enter valid 10-digit mobile number.'); return; }
        } catch (_) {}
        // Enforce mandatory 6-digit PIN
        try {
            const newPinDigits = (newPin || '').replace(/\D/g, '');
            if (!newPin || newPinDigits.length !== 6) { showMessage('Enter valid 6-digit PIN.'); return; }
        } catch (_) {}
        // Validate GSTIN only when supplier/customer is marked registered
        if (!notRegistered && newGstin && !GSTIN_REGEX.test(newGstin)) { showMessage('Invalid GSTIN format. Please check and enter a valid GSTIN or mark as Not GST-registered.'); return; }
        try {
            const colPath = type === 'supplier' ? suppliersColPath : customersColPath;
                if (docId) {
                    // Build payload and remove undefined fields so updateDoc isn't called with unsupported undefined values
                    const upd = Object.assign({
                        name: newName,
                        updatedAt: serverTimestamp(),
                        isGstRegistered: !notRegistered
                    },
                        newGstin ? { gstin: newGstin } : {},
                        newAddr ? { address: newAddr } : {},
                        newState ? { stateCode: newState } : {},
                        newPin ? { pin: newPin } : {},
                        newMobile ? { mobile: newMobile } : {},
                        (newCreditDays !== null) ? { creditDays: newCreditDays } : {},
                        (newCreditLimit !== null) ? { creditLimit: newCreditLimit } : {},
                        newEmail ? { email: newEmail } : {}
                    );
                    // Strip any keys with undefined (defensive)
                    const clean = Object.fromEntries(Object.entries(upd).filter(([k, v]) => v !== undefined));
                    await updateDoc(doc(db, colPath, docId), clean);
                } else {
                    // If no primary doc id, upsert into new collection
                    await addDoc(collection(db, colPath), Object.assign({
                        name: newName,
                        createdAt: serverTimestamp(),
                        isDeleted: false,
                        migratedFrom: 'edit-modal',
                    }, newGstin ? { gstin: newGstin } : {}, newAddr ? { address: newAddr } : {}, newState ? { stateCode: newState } : {}, newPin ? { pin: newPin } : {}, newMobile ? { mobile: newMobile } : {}, (newCreditDays !== null) ? { creditDays: newCreditDays } : {}, (newCreditLimit !== null) ? { creditLimit: newCreditLimit } : {}, newEmail ? { email: newEmail } : {}, { isGstRegistered: !notRegistered }));
                }
                upsertPartyInState(type, { name: newName, gstin: newGstin || undefined, address: newAddr || undefined, stateCode: newState || undefined, pin: newPin || undefined, mobile: newMobile || undefined, email: newEmail || undefined, creditDays: (newCreditDays !== null ? newCreditDays : undefined), creditLimit: (newCreditLimit !== null ? newCreditLimit : undefined), isGstRegistered: !notRegistered });
            renderAdminLedgersPage();
            showMessage('Party details saved.');
            close();
            // If a pending purchase submit is waiting for this supplier to be fixed,
            // trigger it now so the user doesn't have to re-submit manually.
            try {
                if (typeof pendingPurchaseRetryFn === 'function' && type === 'supplier') {
                    // Run after a short delay to ensure state sync
                    setTimeout(() => {
                        try { pendingPurchaseRetryFn(); } catch (_) {}
                    }, 100);
                }
            } catch (_) {}
        } catch (err) {
            console.error('Save party error:', err);
            showMessage('Failed to save party.');
        }
    });
}

// Show transfer (contra) details modal for a given transfer id
async function showTransferModal(transferId) {
    if (!transferId) return;
    try {
        const docRef = doc(db, transfersColPath, transferId);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
            showMessage('Transfer details not found.');
            return;
        }
        const t = snap.data();

        // fetch ledger rows (cash and bank) that reference this transfer
        const cashQ = query(collection(db, cashLedgerColPath), where('refId', '==', transferId));
        const bankQ = query(collection(db, bankLedgerColPath), where('refId', '==', transferId));
        const [cashSnap, bankSnap] = await Promise.all([getDocs(cashQ), getDocs(bankQ)]);
        const cashRows = cashSnap.docs.map(d => ({ id: d.id, ...d.data(), _col: 'cash' }));
        const bankRows = bankSnap.docs.map(d => ({ id: d.id, ...d.data(), _col: 'bank' }));

        const rows = [...cashRows, ...bankRows];

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl w-[95%] max-w-2xl p-4">
                <div class="flex items-start justify-between">
                    <h4 class="font-semibold">Transfer Details</h4>
                    <div class="space-x-2">
                        <button id="transferReverseBtn" class="px-2 py-1 bg-red-600 text-white rounded text-sm">Reverse Transfer</button>
                        <button id="closeTransferModal" class="px-2 py-1 bg-gray-200 rounded">Close</button>
                    </div>
                </div>
                <div class="mt-3 grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Date:</strong> ${formatDate(t.date)}</div>
                    <div><strong>Amount:</strong> ₹${(t.amount||0).toFixed(2)}</div>
                    <div><strong>Direction:</strong> ${t.direction === 'cashToBank' ? 'Cash → Bank' : 'Bank → Cash'}</div>
                    <div><strong>Bank Account:</strong> ${t.bankAccount || '-'}</div>
                    <div><strong>Reconciled:</strong> ${t.reconciled ? 'Yes' : 'No'}</div>
                    <div><strong>Notes:</strong> ${t.notes || '-'}</div>
                </div>
                <div class="mt-4">
                    <h5 class="font-medium">Ledger rows</h5>
                    <div id="transferLedgerRows" class="mt-2 text-sm overflow-auto max-h-48">
                        ${rows.length ? rows.map(r => `<div class="py-2 border-b flex justify-between"><div><strong>${r._col.toUpperCase()}</strong> • ${r.accountName || r.party || ''}</div><div>₹${(r.amount||0).toFixed(2)}</div></div>`).join('') : '<div class="text-gray-500">No ledger rows found.</div>'}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('#closeTransferModal')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            try { const sel = window.getSelection ? window.getSelection().toString() : ''; if (sel && sel.length > 0) return; } catch(_) {}
            close();
        });

        // Reverse transfer handler: mark transfer and ledger rows as reversed (batched)
        const reverseBtn = modal.querySelector('#transferReverseBtn');
        reverseBtn?.addEventListener('click', async () => {
            if (!confirm('Reverse this transfer? This will mark the transfer and its ledger rows as reversed.')) return;
            try {
                const batch = writeBatch(db);
                // mark transfer doc
                batch.update(doc(db, transfersColPath, transferId), { isReversed: true, reversedAt: serverTimestamp() });
                // mark each ledger row
                rows.forEach(r => {
                    const colPath = r._col === 'cash' ? cashLedgerColPath : bankLedgerColPath;
                    batch.update(doc(db, colPath, r.id), { isReversed: true, reversedAt: serverTimestamp() });
                });
                await batch.commit();
                showMessage('Transfer reversed.');
                close();
            } catch (err) {
                console.error('Reverse transfer error', err);
                showMessage('Unable to reverse transfer.');
            }
        });

    } catch (err) {
        console.error('showTransferModal error', err);
        showMessage('Unable to load transfer details.');
    }
}

// Helper to remove fields when empty in update payloads
function deleteFieldIfEmpty() {
    // As client web SDK lacks direct deleteField import in this file, fallback to omitting fields by not setting when empty.
    // This function exists to keep code readable above; it just returns undefined.
    return undefined;
}

// Ensure posting time ticker is running (safe to call multiple times)
try { startPostingTimeTicker(); } catch(_) {}
