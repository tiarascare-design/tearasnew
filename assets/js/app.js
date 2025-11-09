import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInAnonymously, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, linkWithPopup, signInWithRedirect, getRedirectResult, linkWithRedirect, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, serverTimestamp, query, where, getDocs, getDoc, writeBatch, increment, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

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

const finalFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : firebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
const ADMIN_UID = "5FA4SZNeMicQz0MC1waRTSUh0lB2";

const app = initializeApp(finalFirebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functionsSvc = getFunctions(app, 'us-central1');

// --- DOM ELEMENTS ---
const pageContent = document.getElementById('pageContent');
const mainHeader = document.getElementById('main-header');
const mainFooter = document.getElementById('main-footer');
const topBarsContainer = document.getElementById('top-bars-container');

// --- APP STATE ---
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
    allTestimonials: [], // For admin
    allPurchases: [], // For admin
    allLocalSales: [], // For Admin
    allSalesReturns: [], // For Admin
    allPurchaseReturns: [], // For Admin
    allCreditorsLedger: [], // For Admin - Sundry Creditors entries
    allDebtorsLedger: [], // For Admin - Sundry Debtors entries
    allCashLedger: [], // Cash account entries
    allBankLedger: [], // Bank account entries
    allBanks: [], // Bank master list
    allSuppliers: [], // Party masters
    allCustomers: [],
    siteSettings: {
        isScrollingBarVisible: true,
        scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
        isGstEnabled: true,
        merchantGstin: '29ABCDE1234F1Z5', // <-- ADDED: Default GSTIN
        businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542', // <-- ADDED: Default Business Address
        visibilityEpochs: {}, // collection-wise visibility reset epochs (ms)
    },
    cart: { items: {} },
    userProfile: null,
    orders: [],
    allOrders: [], // For admin
    adminCurrentTab: 'orders',
    localSaleData: null,
    registerFilter: 'all',
    registerStartDate: new Date().toISOString().split('T')[0],
    registerEndDate: new Date().toISOString().split('T')[0],
    billingStartDate: new Date().toISOString().split('T')[0],
    billingEndDate: new Date().toISOString().split('T')[0],
    billingSearchText: '',
    // Ledgers date filter
    ledgerStartDate: new Date().toISOString().split('T')[0],
    ledgerEndDate: new Date().toISOString().split('T')[0],
    bankAccountFilter: 'All',
    // Ledgers pagination (default 10 entries per page)
    ledgerPageSize: 10,
    cashPage: 1,
    bankPage: 1,
    creditorsPage: 1,
    debtorsPage: 1,
    // Per-pane page sizes (overrides ledgerPageSize if present)
    cashPageSize: 10,
    bankPageSize: 10,
    creditorsPageSize: 10,
    debtorsPageSize: 10,
    // Pagination
    registerPage: 1,
    registerPageSize: 25,
    billingPage: 1,
    billingPageSize: 25,
    currentUser: null,
    adminOrderFilter: 'All', // Added state for order filtering
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
    // Per-order mirror listeners for user orders overlaying status from public orders
    userOrderPublicUnsubs: {},
    isAdmin: false,
    adminListenersActive: false
};

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

    if (state.adminListenersActive) return;

    listenToAllOrders();
    listenToAllTestimonials();
    listenToAllPurchases();
    listenToAllLocalSales();
    listenToAllSalesReturns();
    listenToAllPurchaseReturns();
    listenToAllCreditorsLedger();
    listenToAllDebtorsLedger();
    listenToAllCashLedger();
    listenToAllBankLedger();
    state.adminListenersActive = true;
}

function refreshAdminState() {
    const previous = !!state.isAdmin;
    const next = computeIsCurrentUserAdmin();
    state.isAdmin = next;
    if (!next && previous) {
        detachAdminListeners();
    }
    if (next) {
        ensureAdminListenersAttached();
    }
}

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

// --- TAX HELPERS (GST) ---
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function computeGstForItems(items, pricesIncludeGst) {
    // items: [{price, quantity, gstPercentage}]
    const rates = {};
    let subtotalEx = 0;
    let subtotalInc = 0;

    if (pricesIncludeGst) {
        // Prices are tax-inclusive
        items.forEach(it => {
            const lineInc = (it.price || 0) * (it.quantity || 0);
            subtotalInc += lineInc;
            const r = parseFloat(it.gstPercentage || 0);
            if (r > 0) {
                const tax = lineInc * (r / (100 + r)); // extract tax from inclusive price
                rates[r] = (rates[r] || 0) + tax;
            }
        });
        const totalGst = Object.values(rates).reduce((s, v) => s + v, 0);
        subtotalEx = subtotalInc - totalGst;
        return { rates, total: totalGst, subtotalEx, subtotalInc };
    }

    // Prices are tax-exclusive
    items.forEach(it => {
        const lineEx = (it.price || 0) * (it.quantity || 0);
        subtotalEx += lineEx;
        const r = parseFloat(it.gstPercentage || 0);
        if (r > 0) {
            const tax = lineEx * (r / 100);
            rates[r] = (rates[r] || 0) + tax;
        }
    });
    const totalGst = Object.values(rates).reduce((s, v) => s + v, 0);
    subtotalInc = subtotalEx + totalGst;
    return { rates, total: totalGst, subtotalEx, subtotalInc };
}

// --- ROUTING & NAVIGATION ---
function navigateTo(page, id = null, category = null, group = null) {
    state.currentPage = page;
    state.currentProductId = page === 'product_detail' ? id : null;
    state.currentOrderId = (page === 'order_success' || page === 'invoice' || page === 'purchase_invoice' || page === 'local_sale_invoice') ? id : null;
    state.currentCategory = page === 'products' ? category : null;
    state.currentGroup = page === 'products' ? group : null;
    window.scrollTo(0, 0);
    renderApp();
}

// --- RENDER FUNCTIONS ---
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
    topBarsContainer.innerHTML = scrollingBarHTML + announcementRibbonHTML;
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
            <div class="relative flex justify-center items-center py-10">
                <div class="absolute left-0 top-1/2 -translate-y-1/2">
                    <a href="#" data-page="home" class="nav-btn block">
                        <img src="https://i.postimg.cc/j2gPH9Kb/tiaras-logo-removebg-preview.png" alt="TIARAS Logo" class="h-40">
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
            </div>
            <nav class="hidden md:flex justify-center items-center space-x-10 text-sm font-medium uppercase pb-4">
                <a href="#" data-page="home" class="nav-btn nav-link ${state.currentPage === 'home' ? 'active' : ''}">Home</a>
                <a href="#" data-page="products" class="nav-btn nav-link ${state.currentPage === 'products' && !state.currentCategory ? 'active' : ''}">Shop All</a>
                <a href="#" data-page="products" data-category="ornament" class="nav-btn nav-link ${state.currentCategory === 'ornament' ? 'active' : ''}">Ornaments</a>
                <a href="#" data-page="products" data-category="beauty" class="nav-btn nav-link ${state.currentCategory === 'beauty' ? 'active' : ''}">Beauty</a>
                <a href="#" data-page="testimonials" class="nav-btn nav-link ${state.currentPage === 'testimonials' ? 'active' : ''}">Testimonials</a>
            </nav>
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
        .filter(p => cartProductIds.includes(p.id))
        .map(product => {
            const quantity = state.cart.items[product.id].quantity;
            const subtotal = product.salePrice * quantity;
            total += subtotal;
            return `<div class="flex items-center justify-between py-6"><div class="flex items-center space-x-6 flex-1"><img src="${product.image}" class="w-28 h-28 object-cover rounded-md"><div><h3 class="font-semibold text-lg">${product.name}</h3><p class="text-gray-500 text-sm mt-1">₹${Number(product.salePrice).toFixed(2)}</p><div class="flex items-center border rounded-md w-28 mt-4"><button data-id="${product.id}" data-change="-1" class="cart-quantity-stepper p-2">-</button><input type="number" data-id="${product.id}" value="${quantity}" min="1" class="cart-quantity-selector w-12 text-center border-l border-r"><button data-id="${product.id}" data-change="1" class="cart-quantity-stepper p-2">+</button></div></div></div><div class="flex items-center space-x-5"><p class="font-semibold text-lg w-24 text-right">${subtotal.toFixed(2)}</p><button data-id="${product.id}" class="remove-from-cart-btn text-gray-400 hover:text-black text-xl">&times;</button></div></div>`;
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

    new Swiper('.hero-swiper .swiper', {
        loop: true,
        autoplay: { delay: 5000, disableOnInteraction: false },
        pagination: { el: '.hero-swiper .swiper-pagination', clickable: true },
        navigation: { nextEl: '.hero-swiper .swiper-button-next', prevEl: '.hero-swiper .swiper-button-prev' },
    });

    new Swiper('.reviews-swiper', {
        loop: true,
        autoplay: { delay: 4000, disableOnInteraction: false },
        slidesPerView: 1,
        spaceBetween: 30,
        pagination: { el: '.reviews-pagination', clickable: true },
    });
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
        // Filter products by group identifier when provided
        productsToDisplay = productsToDisplay.filter(p => (p.groupId || p.productGroupId || p.group) === group);
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
            <div>
                <input type="password" id="password" required placeholder="Password" class="w-full px-4 py-3 border-b border-gray-300 focus:outline-none focus:border-black">
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
            if (cred) {
                const backup = (auth.currentUser && auth.currentUser.isAnonymous) ? JSON.stringify(state.cart || {}) : null;
                const userCred = await signInWithCredential(auth, cred);
                if (backup && userCred?.user && !userCred.user.isAnonymous) {
                    localStorage.setItem('anonCartBackup', backup);
                    await mergeBackupCartToCurrentUser();
                }
                return userCred.user;
            }
        }
        // Fallback to redirect in popup-blocked or similar cases
        if (code.includes('popup') || code === 'auth/operation-not-supported-in-this-environment') {
            if (auth.currentUser && auth.currentUser.isAnonymous) {
                // Save cart backup across redirect so it can be merged after sign-in
                try { if (state.cart && Object.keys(state.cart.items || {}).length) localStorage.setItem('anonCartBackup', JSON.stringify(state.cart)); } catch {}
                await linkWithRedirect(auth.currentUser, provider);
            } else {
                await signInWithRedirect(auth, provider);
            }
            // The page will redirect; result will be handled on load
            return null;
        }
        throw err;
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
                <label for="productGroup" class="block text-sm font-medium text-gray-700 mb-1">Product Group (Collection)</label>
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

    const settingsFormHTML = `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><form id="settingsForm"><div class="space-y-8"><div><h3 class="text-2xl font-bold mb-4">Store Settings</h3><div class="space-y-4"><div class="flex items-center justify-between"><span class="text-sm font-medium text-gray-700">Merchant is GST registered</span><label class="toggle-switch"><input type="checkbox" id="merchantGstRegistered" ${state.siteSettings.merchantGstRegistered ? 'checked' : ''}><span class="toggle-slider"></span></label></div><p class="text-xs text-gray-500">Sales GST is applied automatically when the merchant is GST registered. If not registered, GST will not be charged on sales, and purchase GST will be treated as part of item cost.</p></div></div><div class="space-y-4 pt-4 border-t"><h3 class="text-2xl font-bold mb-4">Business & GST Details</h3><div><label for="merchantGstin" class="block text-sm font-medium text-gray-700 mb-1">Merchant GSTIN</label><input type="text" id="merchantGstin" value="${state.siteSettings.merchantGstRegistered ? (state.siteSettings.merchantGstin || '') : ''}" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="e.g., 29ABCDE1234F1Z5" ${state.siteSettings.merchantGstRegistered ? '' : 'disabled title="Disabled when not GST registered"'}></div><div><label for="businessAddress" class="block text-sm font-medium text-gray-700 mb-1">Business Address</label><textarea id="businessAddress" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="Full address">${state.siteSettings.businessAddress || ''}</textarea></div></div><div class="space-y-4 pt-4 border-t"><h3 class="text-2xl font-bold mb-4">Admin Access</h3><p class="text-xs text-gray-500">Grant additional admins by listing their email addresses or Firebase Auth UIDs (comma separated). Primary developer admin access always remains.</p><div><label for="adminEmails" class="block text-sm font-medium text-gray-700 mb-1">Additional Admin Emails</label><textarea id="adminEmails" rows="2" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="name@example.com, other@example.com">${adminEmailsPrefill}</textarea></div><div><label for="adminUids" class="block text-sm font-medium text-gray-700 mb-1">Additional Admin UIDs</label><textarea id="adminUids" rows="2" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="UID1, UID2">${adminUidsPrefill}</textarea></div><p class="text-[11px] text-gray-500">Changes take effect immediately after saving.</p></div></div><div class="mt-8 border-t pt-6 flex items-center justify-between"><button type="submit" class="bg-green-600 text-white font-semibold py-2 px-8 rounded-md shadow hover:bg-green-700 transition">Save All Settings</button><button type="button" id="masterResetBtn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-red-700 transition">Master Reset (Danger)</button></div></form><div class="mt-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-md text-sm"><p class="font-semibold">Danger Zone:</p><div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2"><label class="flex items-center gap-2"><input type="checkbox" id="resetProducts" class="h-4 w-4"> Products</label><label class="flex items-center gap-2"><input type="checkbox" id="resetProductGroups" class="h-4 w-4"> Product Groups</label><label class="flex items-center gap-2"><input type="checkbox" id="resetHeroSlides" class="h-4 w-4"> Hero Slides</label><label class="flex items-center gap-2"><input type="checkbox" id="resetGallery" class="h-4 w-4"> Gallery Images</label><label class="flex items-center gap-2"><input type="checkbox" id="resetTestimonials" class="h-4 w-4"> Testimonials</label><label class="flex items-center gap-2"><input type="checkbox" id="resetOrders" class="h-4 w-4"> Orders</label><label class="flex items-center gap-2"><input type="checkbox" id="resetPurchases" class="h-4 w-4"> Purchases</label><label class="flex items-center gap-2"><input type="checkbox" id="resetLocalSales" class="h-4 w-4"> Local Sales</label><label class="flex items-center gap-2"><input type="checkbox" id="resetSalesReturns" class="h-4 w-4"> Sales Returns</label><label class="flex items-center gap-2"><input type="checkbox" id="resetPurchaseReturns" class="h-4 w-4"> Purchase Returns</label><label class="flex items-center gap-2"><input type="checkbox" id="resetCarts" class="h-4 w-4"> User Carts</label><label class="flex items-center gap-2"><input type="checkbox" id="resetCounters" class="h-4 w-4"> Counters</label><label class="flex items-center gap-2"><input type="checkbox" id="resetSiteSettings" class="h-4 w-4"> Site Settings</label></div><div class="mt-3"><button type="button" id="resetSelectedBtn" class="bg-red-500 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-red-600 transition">Reset Selected</button></div><p class="mt-3">Select what to reset or use Master Reset to remove everything listed. Type RESET when prompted. Use only for testing.</p></div></div>`;

    const tabsContent = {
        orders: `<div><div id="adminOrderList" class="space-y-4"></div></div>`,
        products: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="productFormTitle" class="text-2xl font-bold mb-6">Add New Product</h3><form id="productForm" class="space-y-6">${productFormHTML}</form></div><div><h3 class="text-2xl font-bold mb-6">Manage Products</h3><div id="adminProductList" class="space-y-4"></div></div>`,
        product_groups: `<div id="adminProductGroupsContainer"></div>`,
        purchases: `<div id="adminPurchasesContainer"></div>`,
        media: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="slideFormTitle" class="text-2xl font-bold mb-6">Add New Hero Slide</h3><form id="slideForm" class="space-y-6">${slideFormHTML}</form></div><div class="mb-12"><h3 class="text-2xl font-bold mb-6">Manage Hero Slides</h3><div id="adminSlideList" class="space-y-4"></div></div><div class="bg-white p-8 rounded-lg shadow-lg"><h3 class="text-2xl font-bold mb-6">Manage Gallery Images</h3><div id="galleryImageFormContainer"><label for="galleryImageUrl" class="block text-sm font-medium text-gray-700 mb-1">New Image URL</label><div class="flex"><input type="url" id="galleryImageUrl" class="w-full px-4 py-2 border border-r-0 border-gray-300 rounded-l-md" required placeholder="https://example.com/photo.jpg"><button type="button" id="addGalleryImageBtn" class="bg-indigo-600 text-white font-semibold py-2 px-6 rounded-r-md shadow hover:bg-indigo-700 transition">Add Image</button></div></div><div class="mt-8"><h4 class="text-lg font-bold mb-4">Current Images</h4><div id="adminGalleryImageList" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div></div></div>`,
        billing_settings: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 class="text-2xl font-bold mb-6">Billing Settings — Opening Balances</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-xl font-bold mb-2">Cash Opening Balance</h3>
                    <form id="cashOpeningForm" class="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                        <div>
                            <label class="block text-xs text-gray-600">Date</label>
                            <input type="date" id="cashObDate" class="border rounded p-2 w-full" value="${state.ledgerStartDate}">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Amount (₹)</label>
                            <input type="number" id="cashObAmount" class="border rounded p-2 w-full" step="0.01" min="0">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Notes</label>
                            <input type="text" id="cashObNotes" class="border rounded p-2 w-full" placeholder="Opening balance">
                        </div>
                        <button class="bg-gray-800 text-white px-3 py-2 rounded" type="submit">Add Opening</button>
                    </form>
                </div>
                <div class="bg-white p-6 rounded-lg shadow">
                    <h3 class="text-xl font-bold mb-2">Bank Opening Balance</h3>
                    <form id="bankOpeningForm" class="mt-2 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                        <div>
                            <label class="block text-xs text-gray-600">Date</label>
                            <input type="date" id="bankObDate" class="border rounded p-2 w-full" value="${state.ledgerStartDate}">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Amount (₹)</label>
                            <input type="number" id="bankObAmount" class="border rounded p-2 w-full" step="0.01" min="0">
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Account</label>
                            <select id="bankObAccount" class="border rounded p-2 w-full">
                                ${(state.allBanks||[]).map(b=>`<option value="${(b.name||'').replace(/"/g,'&quot;')}">${b.name}</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs text-gray-600">Notes</label>
                            <input type="text" id="bankObNotes" class="border rounded p-2 w-full" placeholder="Opening balance">
                        </div>
                        <button class="bg-gray-800 text-white px-3 py-2 rounded" type="submit">Add Opening</button>
                    </form>
                </div>
            </div>
        </div>`,
        testimonials: `<div><h3 class="text-2xl font-bold mb-6">Manage Testimonials</h3><div id="adminTestimonialsList" class="space-y-4"></div></div>`,
        reports: `<div id="adminReportsContainer"></div>`,
        local_sale: `<div id="adminLocalSaleContainer"></div>`,
        returns: `<div id="adminReturnsContainer"></div>`,
        ledgers: `<div id="adminLedgersContainer"></div>`,
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

    pageContent.innerHTML = `<div class="container mx-auto px-6 py-12"><div class="flex justify-between items-center mb-8"><h2 class="text-4xl font-playfair">Admin Panel</h2><button data-page="home" class="nav-btn bg-gray-800 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-900 transition duration-300">View Store</button></div><div class="border-b border-gray-200 mb-8"><nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs"><a href="#" data-tab="orders" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'orders' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Orders</a><a href="#" data-tab="products" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'products' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Products</a><a href="#" data-tab="product_groups" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'product_groups' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Product Groups</a><a href="#" data-tab="purchases" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'purchases' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Purchases</a><a href="#" data-tab="media" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'media' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Media</a><a href="#" data-tab="testimonials" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'testimonials' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Testimonials</a><a href="#" data-tab="reports" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'reports' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Billing & Reports</a><a href="#" data-tab="billing_settings" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'billing_settings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Billing Settings</a><a href="#" data-tab="local_sale" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'local_sale' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Local Sale</a><a href="#" data-tab="returns" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'returns' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Returns</a><a href="#" data-tab="transactions" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'transactions' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Transactions</a><a href="#" data-tab="settings" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'settings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Settings</a></nav></div><div id="adminTabContent">${tabsContent[state.adminCurrentTab]}</div></div>`;

    if (state.adminCurrentTab === 'orders') renderAdminOrderList();
    else if (state.adminCurrentTab === 'products') renderAdminProductList();
    else if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage();
    else if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
    else if (state.adminCurrentTab === 'media') { renderAdminMediaPage(); }
    else if (state.adminCurrentTab === 'testimonials') renderAdminTestimonialsList();
    else if (state.adminCurrentTab === 'reports') renderAdminBillingPage();
    else if (state.adminCurrentTab === 'local_sale') renderLocalSalePage();
    else if (state.adminCurrentTab === 'returns') renderAdminReturnsPage();
    else if (state.adminCurrentTab === 'transactions') renderAdminLedgersPage();
    else if (state.adminCurrentTab === 'settings') { /* no gallery here anymore */ }

    attachAdminListeners();
}

function renderAdminBillingPage() {
    const container = document.getElementById('adminReportsContainer');
    if (!container) return;
    
    const startDate = new Date(state.registerStartDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(state.registerEndDate);
    endDate.setHours(23, 59, 59, 999);

    // --- Purchase & Sales Register ---
    const salesEntries = state.allOrders
        .filter(order => {
            const orderDate = new Date(order.orderDate.seconds * 1000);
            return orderDate >= startDate && orderDate <= endDate;
        })
        .map(order => ({
            date: new Date(order.orderDate.seconds * 1000),
            id: order.id,
            invoiceNumber: order.invoiceNumber,
            type: 'Sale',
            details: `To: ${order.shippingInfo.fullName}`,
            itemCount: order.items.reduce((acc, item) => acc + item.quantity, 0),
            debit: 0,
            credit: order.totalAmount,
        }));

    const purchaseEntries = state.allPurchases
        .filter(purchase => {
            // **MODIFIED:** Exclude deleted purchases from register
            if (purchase.isDeleted) return false;

            const purchaseDate = new Date(purchase.purchaseDate.seconds * 1000);
            return purchaseDate >= startDate && purchaseDate <= endDate;
        })
        .map(purchase => ({
            date: new Date(purchase.purchaseDate.seconds * 1000),
            id: purchase.id,
            invoiceNumber: purchase.invoiceNumber,
            type: 'Purchase',
            details: `From: ${purchase.supplierName}`,
            itemCount: purchase.items.reduce((acc, item) => acc + item.quantity, 0),
            debit: purchase.totalAmount,
            credit: 0,
        }));
    
    // Sales Returns (reduce revenue)
    const salesReturnEntries = state.allSalesReturns
        .filter(ret => {
            const d = _toDate(ret.returnDate?.seconds ? {seconds: ret.returnDate.seconds} : ret.returnDate);
            const date = d || new Date(ret.returnDate.seconds * 1000);
            return date >= startDate && date <= endDate;
        })
        .map(ret => ({
            date: _toDate(ret.returnDate?.seconds ? {seconds: ret.returnDate.seconds} : ret.returnDate) || new Date(),
            id: ret.id,
            invoiceNumber: ret.creditNoteNumber || ret.id,
            type: 'Sales Return',
            details: `From: ${ret.customerName || ret.orderShippingName || 'Customer'}`,
            itemCount: ret.items.reduce((acc, item) => acc + item.quantity, 0),
            debit: ret.totalAmount,
            credit: 0,
        }));

    // Purchase Returns (reduce cost)
    const purchaseReturnEntries = state.allPurchaseReturns
        .filter(ret => {
            const d = _toDate(ret.returnDate?.seconds ? {seconds: ret.returnDate.seconds} : ret.returnDate);
            const date = d || new Date(ret.returnDate.seconds * 1000);
            return date >= startDate && date <= endDate;
        })
        .map(ret => ({
            date: _toDate(ret.returnDate?.seconds ? {seconds: ret.returnDate.seconds} : ret.returnDate) || new Date(),
            id: ret.id,
            invoiceNumber: ret.debitNoteNumber || ret.id,
            type: 'Purchase Return',
            details: `To: ${ret.supplierName || 'Supplier'}`,
            itemCount: ret.items.reduce((acc, item) => acc + item.quantity, 0),
            debit: 0,
            credit: ret.totalAmount,
        }));
    
    const localSalesEntries = state.allLocalSales
             .filter(sale => {
                const saleDate = new Date(sale.saleDate.seconds * 1000);
                return saleDate >= startDate && saleDate <= endDate;
            })
            .map(sale => ({
                date: new Date(sale.saleDate.seconds * 1000),
                id: sale.id,
                invoiceNumber: sale.invoiceNumber,
                type: 'Local Sale',
                details: `To: ${sale.customerName}`,
                itemCount: sale.items.reduce((acc, item) => acc + item.quantity, 0),
                debit: 0,
                credit: sale.totalAmount,
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
                <td class="p-3 text-right text-red-600">${entry.debit > 0 ? entry.debit.toFixed(2) : '-'}</td>
                <td class="p-3 text-right text-green-600">${entry.credit > 0 ? entry.credit.toFixed(2) : '-'}</td>
                <td class="p-3 text-right font-bold">${runningBalance.toFixed(2)}</td>
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
                <h3 class="text-2xl font-bold">Purchase & Sales Register</h3>
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
                            <td class="p-3 text-right text-red-700">${totalDebit.toFixed(2)}</td>
                            <td class="p-3 text-right text-green-700">${totalCredit.toFixed(2)}</td>
                            <td class="p-3 text-right">${finalBalanceTotal.toFixed(2)}</td>
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
        const d = _toDate(o.orderDate) || new Date(o.orderDate.seconds * 1000);
        return d >= startDate && d <= endDate;
    });
    const localSalesInRange = (src.localSales || []).filter(s => {
        const d = _toDate(s.saleDate) || new Date(s.saleDate.seconds * 1000);
        return d >= startDate && d <= endDate;
    });
    const purchasesInRange = (src.purchases || []).filter(p => {
        if (p.isDeleted) return false;
        const d = _toDate(p.purchaseDate) || new Date(p.purchaseDate.seconds * 1000);
        return d >= startDate && d <= endDate;
    });

    const salesGstCollected = ordersInRange.reduce((sum, o) => sum + (o.gstBreakdown?.total || 0), 0)
        + localSalesInRange.reduce((sum, s) => sum + (s.gstBreakdown?.total || 0), 0);
    const purchaseGstPaid = purchasesInRange.reduce((sum, p) => sum + (p.gstBreakdown?.total || 0), 0);
    const merchantReg = !!state.siteSettings.merchantGstRegistered;
    const netGst = merchantReg ? (salesGstCollected - purchaseGstPaid) : 0;

    const gstReportHTML = `
        <div id="gstReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">GST Summary</h3>
                <span class="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${merchantReg ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-yellow-100 text-yellow-800 border border-yellow-200'}">
                    ${merchantReg ? 'Merchant GST Registered' : 'Not GST Registered'}
                </span>
            </div>
            ${merchantReg ? '' : '<p class="text-xs text-gray-500 mb-4">Sales GST is not charged; purchase GST is treated as part of item cost. Net GST not applicable.</p>'}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-700">₹${salesGstCollected.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Sales GST Collected</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-red-700">₹${purchaseGstPaid.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Purchase GST Paid</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md ${merchantReg ? '' : 'opacity-60'}">
                    <p class="text-2xl font-bold ${netGst >= 0 ? 'text-indigo-700' : 'text-orange-700'}">₹${merchantReg ? netGst.toFixed(2) : '—'}</p>
                    <p class="text-sm text-gray-500">Net GST ${merchantReg ? '(Payable/Refundable)' : '(N/A)'}</p>
                </div>
            </div>
        </div>
    `;
    // --- Other Reports ---
    // Compute report arrays (optionally include archived via cached fetch)
    const source = getReportArrays();

    // Totals and profits with returns and local sales
    const ordersRevenue = source.orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const localSalesRevenue = source.localSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    const salesReturnsTotal = source.salesReturns.reduce((sum, r) => sum + (r.totalAmount || 0), 0);

    let ordersCost = 0;
    source.orders.forEach(order => {
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
                <h3 class="text-2xl font-bold">Sales Report</h3>
                <div>
                    <button id="printSalesReportBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-6">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-600">₹${grossRevenue.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Gross Revenue (Orders + Local)</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold">${source.orders.length}</p>
                    <p class="text-sm text-gray-500">Orders</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-indigo-600">₹${netRevenue.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Net Revenue (less Returns)</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-blue-600">₹${totalProfit.toFixed(2)}</p>
                    <p class="text-sm text-gray-500">Estimated Profit</p>
                </div>
            </div>
           </div>
    `;
    
    const inventoryReportHTML = `
        <div id="inventoryReportContainer" class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-2xl font-bold">Inventory Report</h3>
                <div class="flex space-x-2">
                     <button id="printInventoryBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition text-sm flex items-center gap-2"><i class="fa-solid fa-print"></i> Print</button>
                     <button id="exportInventoryBtn" class="bg-green-100 text-green-700 font-semibold py-2 px-4 rounded-md hover:bg-green-200 transition text-sm flex items-center gap-2"><i class="fa-solid fa-file-csv"></i> Export CSV</button>
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
                       ${state.products.map(p => {
                            const stock = p.stock || 0;
                            const purchasePrice = p.purchasePrice || 0;
                            const salePrice = p.salePrice || 0;
                            const potentialProfit = (salePrice - purchasePrice) * stock;
                            let statusBadge = `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">In Stock</span>`;
                            if(stock <= 0) {
                                statusBadge = `<span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Out of Stock</span>`;
                            } else if (stock < 5) {
                                statusBadge = `<span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full">Low Stock</span>`;
                            }
                            return `
                                    <tr class="border-b">
                                         <td class="p-3 font-semibold">${p.name}</td>
                                         <td class="p-3">${purchasePrice.toFixed(2)}</td>
                                         <td class="p-3">${salePrice.toFixed(2)}</td>
                                         <td class="p-3 font-bold">${stock}</td>
                                         <td class="p-3 text-green-600 font-semibold">${potentialProfit.toFixed(2)}</td>
                                         <td class="p-3">${statusBadge}</td>
                                    </tr>
                                   `}).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    // Billing filters (date + search)
    const bStart = new Date(state.billingStartDate); bStart.setHours(0,0,0,0);
    const bEnd = new Date(state.billingEndDate); bEnd.setHours(23,59,59,999);
    const search = (state.billingSearchText || '').toLowerCase();
    const billingOrdersAll = state.allOrders
        .filter(o => {
            const d = _toDate(o.orderDate) || new Date(o.orderDate.seconds * 1000);
            return d >= bStart && d <= bEnd;
        })
        .filter(o => {
            if (!search) return true;
            const texts = [o.invoiceNumber || '', o.id || '', o.shippingInfo?.fullName || '', o.customerEmail || ''].map(s => String(s).toLowerCase());
            return texts.some(t => t.includes(search));
        })
        .sort((a,b) => (b.orderDate?.seconds || 0) - (a.orderDate?.seconds || 0));
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
            <h3 class="text-2xl font-bold mb-6">Billing & Invoicing</h3>
            ${billingControlsHTML}
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center mb-4">
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold">${billingCount}</p>
                    <p class="text-sm text-gray-500">Invoices</p>
                </div>
                <div class="bg-gray-50 p-4 rounded-md">
                    <p class="text-2xl font-bold text-green-600">₹${billingTotal.toFixed(2)}</p>
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
                                         <td class="p-3 font-semibold">${o.totalAmount.toFixed(2)}</td>
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

    container.innerHTML = registerHTML + gstReportHTML + salesReportHTML + inventoryReportHTML + billingHTML;
    attachReportListeners();
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
    
    // --- 1. Filter Logic ---
    let filteredOrders = [...state.allOrders].sort((a, b) => b.orderDate.seconds - a.orderDate.seconds);

    if (state.adminOrderFilter !== 'All') {
        filteredOrders = filteredOrders.filter(order => order.status === state.adminOrderFilter);
    }
    
    // --- 2. Filter Controls HTML ---
    const filterControlsHTML = `
        <div class="flex justify-end items-center mb-6">
            <label for="orderStatusFilter" class="text-sm font-medium text-gray-700 mr-3">Filter by Status:</label>
            <select id="orderStatusFilter" class="w-40 rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border">
                <option value="All" ${state.adminOrderFilter === 'All' ? 'selected' : ''}>All Orders</option>
                <option value="Pending" ${state.adminOrderFilter === 'Pending' ? 'selected' : ''}>Pending</option>
                <option value="Shipped" ${state.adminOrderFilter === 'Shipped' ? 'selected' : ''}>Shipped</option>
                <option value="Delivered" ${state.adminOrderFilter === 'Delivered' ? 'selected' : ''}>Delivered</option>
                <option value="Cancelled" ${state.adminOrderFilter === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
        </div>
    `;

    // --- 3. List Content Rendering ---
    let orderListHTML = '';
    if (filteredOrders.length === 0) {
        orderListHTML = `<p class="text-gray-500 text-center py-4">No ${state.adminOrderFilter !== 'All' ? state.adminOrderFilter : ''} orders found.</p>`;
    } else {
        orderListHTML = filteredOrders.map(order => 
            `<div class="bg-white p-4 rounded-lg shadow-sm">
                <div class="grid grid-cols-1 md:grid-cols-5 gap-4 items-center text-xs">
                    <div>
                        <p class="font-bold text-sm mb-1">Invoice #</p>
                        <p class="font-mono">${order.invoiceNumber || order.id}</p>
                        <p>${formatDate(order.orderDate)}</p>
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Customer</p>
                        <p>${order.shippingInfo.fullName}</p>
                        <p class="text-xs text-gray-600"><span class="font-semibold">Email:</span> ${order.customerEmail || 'Not available'}</p>
                        ${order.shippingInfo.address ? `<p class="text-gray-600">${order.shippingInfo.address}</p>` : ''}
                        <p class="text-gray-600">${order.shippingInfo.city}, ${order.shippingInfo.state} ${order.shippingInfo.zip || ''}</p>
                        ${order.shippingInfo.phone ? `<p class="text-gray-600"><span class=\"font-semibold\">Mobile:</span> ${order.shippingInfo.phone}</p>` : ''}
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Total</p>
                        <p class="font-semibold text-base">₹${order.totalAmount.toFixed(2)}</p>
                        ${order.gstInfo?.applied ? '<span class="text-green-600 text-xs">(GST)</span>' : ''}
                    </div>
                    <div>
                        <p class="font-bold text-sm mb-1">Items</p>
                        <p>${order.items.reduce((acc, item) => acc + item.quantity, 0)}</p>
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
    
    // --- 4. Render Final HTML and Attach Listener ---
    listEl.innerHTML = filterControlsHTML + orderListHTML;

    // Must re-attach status change listener every time the list is re-rendered
    document.querySelectorAll('.admin-order-status-selector').forEach(selector => {
        selector.addEventListener('change', (e) => {
            const orderId = e.target.dataset.orderId;
            const userId = e.target.dataset.userId;
            const newStatus = e.target.value;
            updateOrderStatus(orderId, userId, newStatus);
        });
    });

    // Attach filter change listener for the new filter dropdown
    document.getElementById('orderStatusFilter').addEventListener('change', (e) => {
        state.adminOrderFilter = e.target.value;
        renderAdminOrderList(); // Re-render with the new filter
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
            <h3 class="text-2xl font-bold mb-6">Add New Purchase Entry</h3>
            <form id="purchaseForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <input type="hidden" id="editingPurchaseId" value="" />
                    <div>
                        <label for="supplierName" class="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                        <input type="text" id="supplierName" class="w-full px-4 py-2 border border-gray-300 rounded-md" list="suppliersDatalistPurchase" placeholder="Type to search suppliers" required>
                        <datalist id="suppliersDatalistPurchase">${(state.allSuppliers||[]).map(s => `<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                        <div class="mt-2">
                            <button type="button" id="showNewSupplierBtn" class="text-sm text-blue-600 hover:underline">Can\'t find supplier? + Add</button>
                        </div>
                        <div id="newSupplierRow" class="mt-3 hidden border p-3 rounded bg-gray-50">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs text-gray-600">GSTIN (optional)</label>
                                    <input type="text" id="newSupplierGstin" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="GSTIN">
                                </div>
                                <div>
                                    <label class="block text-xs text-gray-600">Address (optional)</label>
                                    <input type="text" id="newSupplierAddress" class="w-full px-3 py-2 border border-gray-300 rounded-md" placeholder="Address">
                                </div>
                            </div>
                            <div class="mt-3 flex gap-3">
                                <button type="button" id="addSupplierInlineBtn" class="bg-green-600 text-white px-3 py-2 rounded">Add Supplier</button>
                                <button type="button" id="cancelNewSupplierBtn" class="bg-gray-200 px-3 py-2 rounded">Cancel</button>
                            </div>
                        </div>
                    </div>
                    <div>
                        <label for="purchaseDate" class="block text-sm font-medium text-gray-700 mb-1">Purchase Date</label>
                        <input type="date" id="purchaseDate" class="w-full px-4 py-2 border border-gray-300 rounded-md" required value="${new Date().toISOString().split('T')[0]}">
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
            </form>
        </div>
    `;
    // Render form and a separate purchase-history pane below it
    const purchaseHistoryHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-bold mb-4">Purchase History</h3>
            <div id="purchaseHistoryContainer" class="space-y-4"></div>
        </div>
    `;

    // Render form first, then the history pane below it
    container.innerHTML = purchaseFormHTML + purchaseHistoryHTML;

    // Attach listeners specific to this page
    document.getElementById('addPurchaseItemBtn').addEventListener('click', addPurchaseItemRow);
    // Inline supplier add handlers
    const showNewSupplierBtn = document.getElementById('showNewSupplierBtn');
    const newSupplierRow = document.getElementById('newSupplierRow');
    const newSupplierGstin = document.getElementById('newSupplierGstin');
    const newSupplierAddress = document.getElementById('newSupplierAddress');
    const addSupplierInlineBtn = document.getElementById('addSupplierInlineBtn');
    const cancelNewSupplierBtn = document.getElementById('cancelNewSupplierBtn');
    if (showNewSupplierBtn && newSupplierRow) {
        showNewSupplierBtn.addEventListener('click', (e) => {
            e.preventDefault();
            newSupplierRow.classList.toggle('hidden');
            if (!newSupplierRow.classList.contains('hidden')) setTimeout(() => { newSupplierGstin && newSupplierGstin.focus(); }, 50);
        });
    }
    if (cancelNewSupplierBtn && newSupplierRow) {
        cancelNewSupplierBtn.addEventListener('click', (e) => { e.preventDefault(); newSupplierRow.classList.add('hidden'); if (newSupplierGstin) newSupplierGstin.value = ''; if (newSupplierAddress) newSupplierAddress.value = ''; });
    }
    if (addSupplierInlineBtn) {
        addSupplierInlineBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('supplierName')?.value || '').trim();
            const gstin = (newSupplierGstin?.value || '').trim();
            const address = (newSupplierAddress?.value || '').trim();
            if (!name) { showMessage('Enter supplier name first.'); return; }
            // Check for existing supplier (case-insensitive)
            const exists = (state.allSuppliers || []).some(s => (s.name || '').trim().toLowerCase() === name.toLowerCase());
            if (exists) { showMessage('Supplier already exists. Choose from the list.'); return; }
            try {
                const ref = await addDoc(collection(db, suppliersColPath), { name, gstin: gstin || undefined, address: address || undefined, createdAt: serverTimestamp(), isDeleted: false });
                // Update local state and datalist
                try {
                    state.allSuppliers = [{ id: ref.id, name, gstin: gstin || undefined, address: address || undefined }, ...(state.allSuppliers || [])];
                } catch (_) {}
                // Use optimistic upsert to trigger UI refreshes
                try { upsertPartyInState('supplier', { name, gstin: gstin || undefined, address: address || undefined }); } catch(_){}
                const dl = document.getElementById('suppliersDatalistPurchase');
                if (dl) { const opt = document.createElement('option'); opt.value = name; dl.appendChild(opt); }
                // Select the supplier in input
                const supplierInput = document.getElementById('supplierName'); if (supplierInput) supplierInput.value = name;
                showMessage('Supplier added.');
                if (newSupplierGstin) newSupplierGstin.value = ''; if (newSupplierAddress) newSupplierAddress.value = ''; if (newSupplierRow) newSupplierRow.classList.add('hidden');
            } catch (err) {
                console.error('Failed to add supplier inline:', err);
                showMessage('Failed to add supplier.');
            }
        });
    }
    // Toggle bank account row visibility based on Pay Now mode
    const payNowModeSelect = document.getElementById('purchasePaymentMode');
    const bankRowEl = document.getElementById('purchaseBankAccountRow');
    const syncPayNowBankRow = () => {
        if (!payNowModeSelect || !bankRowEl) return;
        bankRowEl.classList.toggle('hidden', payNowModeSelect.value !== 'bank');
    };
    payNowModeSelect?.addEventListener('change', syncPayNowBankRow);
    syncPayNowBankRow();
    // Populate the purchase history pane (separate bills list under the entry form)
    try { renderPurchaseHistory(); } catch (err) { console.error('renderPurchaseHistory failed:', err); }
    container.addEventListener('input', e => {
        if (e.target.classList.contains('purchase-price') || e.target.classList.contains('purchase-quantity')) {
            updatePurchaseTotal();
        }
    });
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
                if (gstSel && typeof prod.gstPercentage === 'number') {
                    gstSel.value = String(prod.gstPercentage);
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
    const purchase = state.allPurchases.find(p => p.id === state.currentOrderId);
    if (!purchase) {
        pageContent.innerHTML = `<div class="container mx-auto p-8 text-center"><p>Purchase record not found.</p></div>`;
        return;
    }

    // Compute display-friendly totals (always show Subtotal as Excl. GST)
    const gstTotal = (purchase.gstBreakdown?.total || 0);
    const subtotalEx = (typeof purchase.subtotal === 'number') ? purchase.subtotal : Math.max(0, (purchase.totalAmount || 0) - gstTotal);
    const subtotalDisplay = subtotalEx;
    const subtotalLabel = 'Subtotal (Excl. GST)';
    const paidNowAmt = (purchase.payNow?.amount || 0);
    const paidNowMode = purchase.payNow?.mode || null;
    const paidNowBank = purchase.payNow?.bankAccount || null;
    const remainingDue = Math.max(0, (purchase.totalAmount || 0) - paidNowAmt);

    pageContent.innerHTML = `
    <div class="bg-gray-100 p-8">
        <div id="invoice-container" class="max-w-4xl mx-auto bg-white p-12 shadow-lg">
            <div class="flex justify-between items-start mb-12">
                <div>
                    <h1 class="text-4xl font-playfair font-bold">Purchase Invoice</h1>
                    <p class="text-sm text-gray-500">Record for TIARAS</p>
                </div>
                <div class="text-right">
                    <h2 class="text-2xl font-semibold uppercase text-gray-400">RECEIPT</h2>
                    <p class="text-sm"><strong>Invoice #:</strong> ${purchase.invoiceNumber || purchase.id}</p>
                    <p class="text-sm"><strong>Date:</strong> ${formatDate(purchase.purchaseDate)}</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-8 mb-12">
                <div>
                    <h4 class="font-semibold mb-2">Supplier:</h4>
                   <p>${purchase.supplierName}</p>
                </div>
            </div>
            <table class="w-full text-left mb-12">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-3 text-sm font-semibold">Item</th>
                        <th class="p-3 text-sm font-semibold text-center">Quantity</th>
                        <th class="p-3 text-sm font-semibold text-right">Unit Cost (₹)</th>
                        <th class="p-3 text-sm font-semibold text-right">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                   ${purchase.items.map(item => `
                            <tr class="border-b">
                                 <td class="p-3">${item.productName}</td>
                                 <td class="p-3 text-center">${item.quantity}</td>
                                 <td class="p-3 text-right">${item.purchasePrice.toFixed(2)}</td>
                                 <td class="p-3 text-right">${(item.purchasePrice * item.quantity).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                </tbody>
            </table>
            <div class="flex justify-end">
                <div class="w-full max-w-xs space-y-2">
                    <div class="flex justify-between border-t pt-2 mt-2"><span>${subtotalLabel}:</span><span>${subtotalDisplay.toFixed(2)}</span></div>
                    <div class="flex justify-between"><span>GST (₹):</span><span>${gstTotal.toFixed(2)}</span></div>
                    <div class="flex justify-between font-bold text-lg"><span>Grand Total (₹):</span><span>${(purchase.totalAmount || 0).toFixed(2)}</span></div>
                    ${paidNowAmt > 0 ? `<div class=\"flex justify-between text-sm text-gray-700\"><span>Paid Now:</span><span>${paidNowAmt.toFixed(2)}${paidNowMode ? ` (${paidNowMode}${paidNowBank ? ` - ${paidNowBank}` : ''})` : ''}</span></div>` : ''}
                    ${paidNowAmt > 0 ? `<div class=\"flex justify-between text-sm\"><span>Balance to Creditors:</span><span>${remainingDue.toFixed(2)}</span></div>` : ''}
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>This is a record of a purchase entry.</p>
               </div>
     </div>
     <div class="text-center mt-8">
         <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Record</button>
         <button id="backFromPurchaseInvoiceBtn" class="ml-4 bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-md hover:bg-gray-300 transition">Back</button>
     </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
   document.getElementById('backFromPurchaseInvoiceBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const prev = state.previousRoute;
        if (prev && prev.page) {
            if (prev.page === 'admin') {
                state.adminCurrentTab = prev.adminTab || 'purchases';
            }
            state.previousRoute = null;
            navigateTo(prev.page);
        } else {
            // Fallback: go to Admin > Purchases
            state.adminCurrentTab = 'purchases';
            navigateTo('admin');
        }
    });
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
// Party masters (collections)
const suppliersColPath = `artifacts/${appId}/public/data/masters/main/suppliers`;
const customersColPath = `artifacts/${appId}/public/data/masters/main/customers`;
const banksColPath = `artifacts/${appId}/public/data/masters/main/banks`;
// Legacy collection paths (pre-fix) for backward-compatible reads
const suppliersLegacyColPath = `artifacts/${appId}/public/data/masters/suppliers`;
const customersLegacyColPath = `artifacts/${appId}/public/data/masters/customers`;


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
                if (p.isDeleted) return false;
                const ts = p.purchaseDate?.seconds ? p.purchaseDate.seconds * 1000 : 0;
                return ts >= epoch;
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
        console.warn('Suppliers legacy path disabled:', err?.message || err);
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
        console.warn('Customers legacy path disabled:', err?.message || err);
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
    if (state.listeners.orders) return;
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
                const ref = await addDoc(collection(db, productGroupsColPath), { name, createdAt: serverTimestamp() });
                // Optimistically update state & select
                state.productGroups = [{ id: ref.id, name }, ...(state.productGroups || [])];
                const sel = document.getElementById('productGroup');
                if (sel) {
                    const opt = document.createElement('option'); opt.value = name; opt.text = name; sel.appendChild(opt); sel.value = name;
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
            const newSettings = {
                scrollingBarText: document.getElementById('scrollingBarText').value,
                isScrollingBarVisible: document.getElementById('scrollingBarVisible').checked,
                        merchantGstRegistered: document.getElementById('merchantGstRegistered')?.checked || false,
                // --- UPDATED: Save new GST fields ---
                merchantGstin: (document.getElementById('merchantGstRegistered')?.checked ? document.getElementById('merchantGstin').value : ''),
                businessAddress: document.getElementById('businessAddress').value,
                // ------------------------------------
            };
            const adminEmailsInput = document.getElementById('adminEmails');
            const adminUidsInput = document.getElementById('adminUids');
            newSettings.adminEmails = adminEmailsInput ? normalizeList(adminEmailsInput.value).map(email => email.toLowerCase()) : [];
            newSettings.adminUids = adminUidsInput ? normalizeList(adminUidsInput.value) : [];
            try {
                // Enforce sales GST based on registration (no separate toggle)
                const payload = { ...newSettings, isGstEnabled: !!newSettings.merchantGstRegistered };
                await setDoc(doc(db, siteSettingsDocPath), payload, { merge: true });
                showMessage("Settings saved successfully!");
                console.log('Settings saved:', payload);
                // Keep local state in sync immediately
                state.siteSettings = { ...state.siteSettings, ...payload };
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
    
    // Master Reset button
    const masterResetBtn = document.getElementById('masterResetBtn');
    if (masterResetBtn) {
        masterResetBtn.addEventListener('click', async () => {
            if (!state.isAdmin) { showMessage('Only admin can perform master reset.'); return; }
            const verified = await verifyMasterPassword('perform Master Reset');
            if (!verified) return;
            const confirmText = prompt('Type RESET to confirm Master Reset. This will delete most data.');
            if (confirmText !== 'RESET') return;
            try {
                // Request a short-lived token, then execute master reset with that token (single-use)
                const requestToken = httpsCallable(functionsSvc, 'adminRequestMasterReset');
                const r = await requestToken({ appId });
                const token = r.data?.token || r.token;
                if (!token) throw new Error('Could not obtain master-reset token');
                const callMasterReset = httpsCallable(functionsSvc, 'adminMasterReset');
                const payload = { appId, confirmation: 'RESET', token };
                const resp = await callMasterReset(payload);
                const result = resp.data || resp;
                if (result.ok) {
                    showMessage('Master Reset completed (server-side).');
                } else {
                    console.warn('Master Reset completed with errors:', result.summary?.errors || result.errors);
                    showMessage(`Master Reset completed with ${result.summary?.errors?.length || result.errors?.length || 0} error(s). Check console for details.`);
                }
            } catch (e) {
                console.error('Master Reset failed:', e);
                showMessage(`Master Reset failed: ${e?.message || e?.details || 'Unknown error'}. Check console for details.`);
            }
        });
    }

    // Reset Selected button
    const resetSelectedBtn = document.getElementById('resetSelectedBtn');
    if (resetSelectedBtn) {
        resetSelectedBtn.addEventListener('click', async () => {
            if (!state.isAdmin) { showMessage('Only admin can perform reset.'); return; }

            const flags = {
                products: document.getElementById('resetProducts')?.checked || false,
                productGroups: document.getElementById('resetProductGroups')?.checked || false,
                slides: document.getElementById('resetHeroSlides')?.checked || false,
                gallery: document.getElementById('resetGallery')?.checked || false,
                testimonials: document.getElementById('resetTestimonials')?.checked || false,
                orders: document.getElementById('resetOrders')?.checked || false,
                purchases: document.getElementById('resetPurchases')?.checked || false,
                localSales: document.getElementById('resetLocalSales')?.checked || false,
                salesReturns: document.getElementById('resetSalesReturns')?.checked || false,
                purchaseReturns: document.getElementById('resetPurchaseReturns')?.checked || false,
                carts: document.getElementById('resetCarts')?.checked || false,
                counters: document.getElementById('resetCounters')?.checked || false,
                siteSettings: document.getElementById('resetSiteSettings')?.checked || false,
            };

            const anySelected = Object.values(flags).some(Boolean);
            if (!anySelected) { showMessage('Please select at least one item to reset.'); return; }

            const verified = await verifyMasterPassword('perform the selected reset');
            if (!verified) return;
            const confirmText = prompt('Type RESET to confirm selected reset operation.');
            if (confirmText !== 'RESET') return;

            try {
                const result = await resetSelectedData(flags);
                if (result.ok) {
                    showMessage('Selected data reset completed.');
                } else {
                    console.warn('Selected reset completed with errors:', result.errors);
                    showMessage(`Selected reset completed with ${result.errors.length} error(s). Check console for details.`);
                }
            } catch (e) {
                console.error('Selected reset failed:', e);
                showMessage(`Selected reset failed: ${e?.message || 'Unknown error'}. Check console for details.`);
            }
        });
    }
    
    // Opening balance handlers (moved to Billing Settings tab)
    const cashObForm = document.getElementById('cashOpeningForm');
    if (cashObForm) {
        cashObForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = new Date(document.getElementById('cashObDate').value);
            const amount = parseFloat(document.getElementById('cashObAmount').value) || 0;
            const notes = document.getElementById('cashObNotes').value.trim();
            if (amount <= 0) { showMessage('Enter a positive amount.'); return; }
            try {
                await addDoc(collection(db, cashLedgerColPath), {
                    date, refType: 'Opening Balance', refId: '', notes: notes || 'Opening balance',
                    debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                });
                showMessage('Cash opening balance added.');
                renderAdminLedgersPage();
            } catch (err) { console.error(err); showMessage('Failed to add opening balance.'); }
        });
    }
    const bankObForm = document.getElementById('bankOpeningForm');
    if (bankObForm) {
        bankObForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const date = new Date(document.getElementById('bankObDate').value);
            const amount = parseFloat(document.getElementById('bankObAmount').value) || 0;
            const bankAccount = document.getElementById('bankObAccount')?.value || 'Main Bank';
            const notes = document.getElementById('bankObNotes').value.trim();
            if (amount <= 0) { showMessage('Enter a positive amount.'); return; }
            try {
                await addDoc(collection(db, bankLedgerColPath), {
                    date, refType: 'Opening Balance', refId: '', bankAccount,
                    notes: notes || `Opening balance (${bankAccount})`,
                    debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                });
                showMessage('Bank opening balance added.');
                renderAdminLedgersPage();
            } catch (err) { console.error(err); showMessage('Failed to add opening balance.'); }
        });
    }

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
            if (id === 'creditorsPageSizeSel') { const v = parseInt(el.value) || 10; state.creditorsPageSize = v; state.creditorsPage = 1; persist('creditors', v); renderAdminLedgersPage(); return; }
            if (id === 'debtorsPageSizeSel') { const v = parseInt(el.value) || 10; state.debtorsPageSize = v; state.debtorsPage = 1; persist('debtors', v); renderAdminLedgersPage(); return; }
        });

        state.adminPaginationEventsAttached = true;
    }

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
        const hash = state?.siteSettings?.masterResetPasswordHash;
        if (!hash || typeof hash !== 'string') {
            showMessage('Master password not configured. Contact developer.');
            return false;
        }
        const pwd = prompt(`Enter master password to ${actionLabel}:`);
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

// Prefer Cloud Function (admin privileges) to wipe carts; fallback to client deletes
async function resetUserCartsSmart() {
    // Try callable Cloud Function first (recommended)
    try {
        const callReset = httpsCallable(functionsSvc, 'adminResetUserCarts');
        await callReset({ appId });
        return;
    } catch (e) {
        // If function not deployed or permission issue, fallback to client-side best effort
        try {
            await deleteAllUserCarts();
            return;
        } catch (e2) {
            // If even fallback is permission denied, treat as handled (no-op), else surface error
            if (isPermissionDenied(e2)) return;
            throw e2;
        }
    }
}

// Reset only selected data buckets based on flags
async function resetSelectedData(flags) {
    const errors = [];
    const safe = async (label, fn, fallback, epochKey) => {
        try {
            await fn();
        } catch (e) {
            if (isPermissionDenied(e)) {
                if (typeof fallback === 'function') {
                    try {
                        await fallback();
                        return;
                    } catch (e2) {
                        // If fallback also fails with permission issues, prefer epoch bump route silently
                        if (!isPermissionDenied(e2)) console.info(`Fallback failed: ${label}`, e2);
                        // Continue to epoch bump attempt
                    }
                }
                if (epochKey) {
                    try {
                        await bumpVisibilityEpoch(epochKey);
                        console.info(`Visibility epoch bumped for ${epochKey}; treating ${label} as handled.`);
                        return;
                    } catch (e3) {
                        console.error(`Epoch bump failed: ${label}`, e3);
                        errors.push({ label, error: e3 });
                        return;
                    }
                }
            }
            console.error(`Selected reset step failed: ${label}`, e);
            errors.push({ label, error: e });
        }
    };

    // Collections (with fallbacks)
    if (flags.orders) {
        await safe('Orders', () => deleteAllPublicOrders(), () => markAllPublicOrdersDeleted(), 'orders');
        // Always bump visibility epoch to hide any legacy user-subcollection order copies
        try { await bumpVisibilityEpoch('orders'); } catch (e) { console.warn('orders epoch bump (post-delete) failed', e); }
    }
    if (flags.products) await safe('Products', () => deleteAllDocsInCollection(productsColPath), () => markAllDocsInCollection(productsColPath), 'products');
    if (flags.productGroups) await safe('Product Groups', () => deleteAllDocsInCollection(productGroupsColPath), () => markAllDocsInCollection(productGroupsColPath), 'productGroups');
    if (flags.slides) await safe('Hero Slides', () => deleteAllDocsInCollection(slidesColPath), () => markAllDocsInCollection(slidesColPath), 'slides');
    if (flags.gallery) await safe('Gallery Images', () => deleteAllDocsInCollection(galleryImagesColPath), () => markAllDocsInCollection(galleryImagesColPath), 'galleryImages');
    if (flags.testimonials) await safe('Testimonials', () => deleteAllDocsInCollection(testimonialsColPath), () => markAllDocsInCollection(testimonialsColPath), 'testimonials');
    if (flags.purchases) await safe('Purchases', () => deleteAllDocsInCollection(purchasesColPath), () => markAllDocsInCollection(purchasesColPath), 'purchases');
    if (flags.localSales) await safe('Local Sales', () => deleteAllDocsInCollection(localSalesColPath), () => markAllDocsInCollection(localSalesColPath), 'localSales');
    if (flags.salesReturns) await safe('Sales Returns', () => deleteAllDocsInCollection(salesReturnsColPath), () => markAllDocsInCollection(salesReturnsColPath), 'salesReturns');
    if (flags.purchaseReturns) await safe('Purchase Returns', () => deleteAllDocsInCollection(purchaseReturnsColPath), () => markAllDocsInCollection(purchaseReturnsColPath), 'purchaseReturns');
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
    return { ok: errors.length === 0, errors };
}

async function resetAllData() {
    const errors = [];
    const safe = async (label, fn, fallback, epochKey) => {
        try { await fn(); }
        catch (e) {
            if (isPermissionDenied(e)) {
                if (typeof fallback === 'function') {
                    try { await fallback(); return; }
                    catch (e2) {
                        // If fallback also permission-denied, attempt epoch bump and treat as handled
                        if (epochKey) { try { await bumpVisibilityEpoch(epochKey); return; } catch (e3) { errors.push({ label, error: e3 }); return; } }
                        // Non-permission error: record
                        errors.push({ label, error: e2 });
                        return;
                    }
                }
                if (epochKey) { try { await bumpVisibilityEpoch(epochKey); return; } catch (e3) { errors.push({ label, error: e3 }); return; } }
            }
            console.error(`Reset step failed: ${label}`, e);
            errors.push({ label, error: e });
        }
    };

    // Delete or soft-delete high-volume collections first
    await safe('Orders', () => deleteAllPublicOrders(), () => markAllPublicOrdersDeleted(), 'orders');
    // Regardless of delete/soft-delete outcome, bump epoch to hide any historical user order copies
    try { await bumpVisibilityEpoch('orders'); } catch (e) { console.warn('orders epoch bump (post-master-reset) failed', e); }
    await safe('Products', () => deleteAllDocsInCollection(productsColPath), () => markAllDocsInCollection(productsColPath), 'products');
    await safe('Product Groups', () => deleteAllDocsInCollection(productGroupsColPath), () => markAllDocsInCollection(productGroupsColPath), 'productGroups');
    await safe('Hero Slides', () => deleteAllDocsInCollection(slidesColPath), () => markAllDocsInCollection(slidesColPath), 'slides');
    await safe('Gallery Images', () => deleteAllDocsInCollection(galleryImagesColPath), () => markAllDocsInCollection(galleryImagesColPath), 'galleryImages');
    await safe('Testimonials', () => deleteAllDocsInCollection(testimonialsColPath), () => markAllDocsInCollection(testimonialsColPath), 'testimonials');
    await safe('Purchases', () => deleteAllDocsInCollection(purchasesColPath), () => markAllDocsInCollection(purchasesColPath), 'purchases');
    await safe('Local Sales', () => deleteAllDocsInCollection(localSalesColPath), () => markAllDocsInCollection(localSalesColPath), 'localSales');
    await safe('Sales Returns', () => deleteAllDocsInCollection(salesReturnsColPath), () => markAllDocsInCollection(salesReturnsColPath), 'salesReturns');
    await safe('Purchase Returns', () => deleteAllDocsInCollection(purchaseReturnsColPath), () => markAllDocsInCollection(purchaseReturnsColPath), 'purchaseReturns');

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
    state.orders = [];
    state.allOrders = [];
    state.allPurchases = [];
    state.allLocalSales = [];
    state.allSalesReturns = [];
    state.allPurchaseReturns = [];
    state.siteSettings = { ...state.siteSettings, ...defaultSettings, visibilityEpochs: preservedEpochs };

    renderApp();

    return { ok: errors.length === 0, errors };
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
        const creditNoteNumber = editingSalesReturnId ? (existingReturn?.creditNoteNumber || editingSalesReturnId) : (await getAndIncrementCounter('salesReturns'));
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
        const debitNoteNumber = editingPurchaseReturnId ? (existingPR?.debitNoteNumber || editingPurchaseReturnId) : (await getAndIncrementCounter('purchaseReturns'));
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
        
        const invoiceNumber = await getAndIncrementCounter('sales');

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

            // Start a batch write to update stock and create orders
            const batch = writeBatch(db);

            // Decrement stock for each item
            items.forEach(item => {
                const productRef = doc(db, productsColPath, item.id);
               batch.update(productRef, { stock: increment(-item.quantity) });
            });
            
            // Create public order
            const publicOrderRef = doc(collection(db, ordersColPath));
            batch.set(publicOrderRef, orderData);

             // Create user-specific order
            const userOrderPath = `artifacts/${appId}/users/${state.currentUser.uid}/orders`;
            const userOrderRef = doc(db, userOrderPath, publicOrderRef.id);
            batch.set(userOrderRef, orderData);

            // Clear the cart
            const cartRef = doc(db, `artifacts/${appId}/users/${state.currentUser.uid}/cart`, 'user_cart');
            batch.set(cartRef, { items: {} });

            // Commit all operations atomically
            await batch.commit();

            navigateTo('order_success', publicOrderRef.id);
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

        document.querySelectorAll('.purchase-item-row').forEach(row => {
            const productId = row.querySelector('.purchase-product-select').value;
            const productName = row.querySelector('.purchase-product-select').options[row.querySelector('.purchase-product-select').selectedIndex].text;
            const purchasePrice = parseFloat(row.querySelector('.purchase-price').value);
            const quantity = parseInt(row.querySelector('.purchase-quantity').value);
            const gstPercentage = parseFloat(row.querySelector('.purchase-gst')?.value) || 0;
            
            if (productId && purchasePrice > 0 && quantity > 0) {
                items.push({ productId, productName, purchasePrice, quantity, gstPercentage });
                if (pricesIncludeGst) {
                    // Inclusive mode: treat entered price as EXCLUSIVE and ADD GST on top
                    const lineEx = purchasePrice * quantity;
                    const lineGst = lineEx * (gstPercentage/100);
                    subtotalEx += lineEx; subtotalInc += (lineEx + lineGst); gstTotal += lineGst;
                } else {
                    // Exclusive mode: no GST
                    const lineEx = purchasePrice * quantity;
                    subtotalEx += lineEx; subtotalInc += lineEx; /* gstTotal += 0 */
                }
            }
        });

        if (items.length === 0) {
            showMessage("Please add at least one item to the purchase.");
            return;
        }
        
        // Preserve original invoice number when editing, else generate
        let invoiceNumber = undefined;
        if (editingId) {
            const original = state.allPurchases.find(p => p.id === editingId);
            invoiceNumber = original?.invoiceNumber || await getAndIncrementCounter('purchases');
        } else {
            invoiceNumber = await getAndIncrementCounter('purchases');
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

        const tmpTotal = (pricesIncludeGst ? subtotalInc : subtotalEx);
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

        const purchaseData = {
            supplierName,
            invoiceNumber,
            purchaseDate: new Date(purchaseDate),
            items,
            // Store subtotal as ex-GST for consistency
            subtotal: subtotalEx,
            // In Exclusive mode, we treat GST as not applicable in totals display/persistence
            gstBreakdown: { total: pricesIncludeGst ? gstTotal : 0 },
            // Grand Total rule: Inclusive mode -> inclusive; Exclusive mode -> exclusive
            totalAmount: effectiveTotal,
            pricesIncludeGst,
            paymentType: effectivePaymentType,
            payNow: payNowAmount > 0 ? { amount: payNowAmount, mode: payNowMode, bankAccount: payNowMode === 'bank' ? payNowBankAccount : null } : null,
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
                        batch.update(productRef, { stock: increment(delta) });
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

                // Increment stock and update costing for new purchase only (simple approach)
                for (const item of items) {
                    const productRef = doc(db, productsColPath, item.productId);
                    const currentProduct = state.products.find(p => p.id === item.productId) || { stock: 0 };
                    const newStock = (currentProduct.stock || 0) + item.quantity;
                    batch.update(productRef, { stock: newStock });
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
   messageModal.classList.remove('hidden');
    setTimeout(() => {
       messageModal.classList.remove('opacity-0');
       messageModal.querySelector('div').classList.remove('scale-95');
     }, 10);
};

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

        // 1. Soft delete the purchase record
        batch.update(purchaseRef, { isDeleted: true });

        // 2. Adjust product stock (decrement)
        for (const item of purchase.items) {
            const productRef = doc(db, productsColPath, item.productId);
            batch.update(productRef, { stock: increment(-item.quantity) });
        }

        // 3. Mark creditors ledger entry as deleted
        try {
            const credRef = doc(db, creditorsLedgerColPath, purchaseId);
            batch.set(credRef, { isDeleted: true, updatedAt: serverTimestamp() }, { merge: true });
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
            try {
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
            <select class="purchase-gst w-full px-2 py-2 border border-gray-300 rounded-md">
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18" selected>18%</option>
                <option value="28">28%</option>
            </select>
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
    if (select) {
        // Enable GST% editing when in Inclusive mode (toggle ON)
        const enabled = !!(pricesIncludeToggle && pricesIncludeToggle.checked);
        select.disabled = !enabled;
    }
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
}

function updatePurchaseTotal() {
    // Toggle ON (checked) = Inclusive; OFF = Exclusive
    const pricesIncludeGst = !!(document.getElementById('purchasePricesIncludeGst')?.checked || false);
    let subtotalEx = 0, gstTotal = 0, subtotalInc = 0;
    document.querySelectorAll('.purchase-item-row').forEach(row => {
        const price = parseFloat(row.querySelector('.purchase-price').value) || 0;
        const quantity = parseInt(row.querySelector('.purchase-quantity').value) || 0;
        const gstPercentage = parseFloat(row.querySelector('.purchase-gst')?.value) || 0;
        let lineEx, lineGst, lineInc;
        if (pricesIncludeGst) {
            // Inclusive mode: treat entered price as EXCLUSIVE and ADD GST on top
            lineEx = price * quantity;
            lineGst = lineEx * (gstPercentage / 100);
            lineInc = lineEx + lineGst;
        } else {
            // Exclusive mode: no GST applied at all
            lineEx = price * quantity;
            lineGst = 0;
            lineInc = lineEx;
        }
        row.querySelector('.purchase-item-total').textContent = `${lineInc.toFixed(2)}`;
        subtotalEx += lineEx; gstTotal += lineGst; subtotalInc += lineInc;
    });
    // Always display Subtotal as Excl. GST so that in Inclusive mode GT = Subtotal + GST
    document.getElementById('purchaseSubtotal').textContent = `${(subtotalEx).toFixed(2)}`;
    const labelEl = document.getElementById('purchaseSubtotalLabel');
    if (labelEl) { labelEl.textContent = 'Subtotal (Excl. GST)'; }
    // Display GST: in Inclusive mode show extracted GST; in Exclusive mode there is NO GST
    document.getElementById('purchaseGst').textContent = `${(pricesIncludeGst ? gstTotal : 0).toFixed(2)}`;
    // Grand Total display:
    // - Inclusive (toggle ON): inclusive total (Subtotal + GST)
    // - Exclusive (toggle OFF): exclusive total
    document.getElementById('purchaseTotal').textContent = `${(pricesIncludeGst ? subtotalInc : subtotalEx).toFixed(2)}`;

    const badge = document.getElementById('purchaseModeBadge');
    if (badge) {
        if (pricesIncludeGst) {
            badge.textContent = 'Inclusive mode';
            badge.classList.remove('bg-gray-100','text-gray-700','border-gray-200');
            badge.classList.add('bg-green-100','text-green-700','border-green-200');
        } else {
            badge.textContent = 'Exclusive mode';
            badge.classList.remove('bg-green-100','text-green-700','border-green-200');
            badge.classList.add('bg-gray-100','text-gray-700','border-gray-200');
        }
    }
}

function renderPurchaseHistory() {
    const container = document.getElementById('purchaseHistoryContainer');
    if (!container) return;
    
    // **MODIFIED:** Filter to only show NON-DELETED purchases
    const nonDeletedPurchases = state.allPurchases.filter(p => !p.isDeleted);

    if (nonDeletedPurchases.length === 0) {
        container.innerHTML = `<p class="text-gray-500 text-center">No purchase history found.</p>`;
        return;
    }
    
    const historyHTML = nonDeletedPurchases.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(purchase => `
        <div class="bg-gray-50 p-4 rounded-lg text-sm">
            <div class="flex justify-between items-start mb-2">
                <div>
                   <p><strong>Supplier:</strong> ${purchase.supplierName}</p>
                    <p class="text-xs text-gray-500">Invoice #: ${purchase.invoiceNumber || purchase.id}</p>
                </div>
                <div class="text-right flex items-center space-x-3">
                    <div>
                        <p class="font-bold">Total (₹): ${purchase.totalAmount.toFixed(2)}</p>
                        <button data-page="purchase_invoice" data-id="${purchase.id}" class="nav-btn text-xs text-blue-500 hover:underline">View Record</button>
                    </div>
                    <button data-id="${purchase.id}" class="edit-purchase-btn bg-yellow-500 text-white p-2 rounded-full hover:bg-yellow-600 w-8 h-8 flex items-center justify-center" title="Edit Entry"><i class="fa-solid fa-pen text-xs"></i></button>
                    <button data-id="${purchase.id}" class="soft-delete-purchase-btn bg-red-500 text-white p-2 rounded-full hover:bg-red-600 w-8 h-8 flex items-center justify-center" title="Delete Entry & Reverse Stock"><i class="fa-solid fa-trash-can-arrow-up text-xs"></i></button>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-2">Date: ${formatDate(purchase.purchaseDate)}</p>
            <details>
                <summary class="cursor-pointer text-blue-500 text-xs">View Items (${purchase.items.length})</summary>
                <ul class="list-disc pl-5 mt-2 text-xs">
                   ${purchase.items.map(item => `<li>${item.productName} - ${item.quantity} x ${item.purchasePrice.toFixed(2)}</li>`).join('')}
                </ul>
            </details>
        </div>
    `).join('');

    container.innerHTML = historyHTML;

    // Attach edit handlers
    container.querySelectorAll('.edit-purchase-btn').forEach(btn => {
        btn.addEventListener('click', () => loadPurchaseIntoForm(btn.dataset.id));
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
    const invoiceNumber = editingLocalSaleId ? (existingSale?.invoiceNumber || editingLocalSaleId) : (await getAndIncrementCounter('localSales'));

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
}

function closeNewProductModal() {
    if(window.newProductTriggerSelect) {
       window.newProductTriggerSelect.value = ''; // Reset the triggering select
    }
    const modal = document.getElementById('newProductModal');
   if (!modal) return;
   const form = modal.querySelector('form');
   if (form) form.reset();
    // Hide and remove display flex to avoid CSS precedence issues
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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
        return `<tr class="border-b text-sm hover:bg-gray-50 cursor-pointer party-row" data-ledger="creditors" data-party="${name.replace(/"/g,'&quot;')}"><td class="p-3">${name}</td><td class="p-3 text-right">${sums.debit ? sums.debit.toFixed(2) : '-'}</td><td class="p-3 text-right">${sums.credit ? sums.credit.toFixed(2) : '-'}</td><td class="p-3 text-right font-semibold">${bal.toFixed(2)}</td></tr>`;
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
        return `<tr class="border-b text-sm hover:bg-gray-50 cursor-pointer party-row" data-ledger="debtors" data-party="${name.replace(/"/g,'&quot;')}"><td class="p-3">${name}</td><td class="p-3 text-right">${sums.debit ? sums.debit.toFixed(2) : '-'}</td><td class="p-3 text-right">${sums.credit ? sums.credit.toFixed(2) : '-'}</td><td class="p-3 text-right font-semibold">${bal.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="4" class="p-3 text-center text-gray-500">No debtors yet</td></tr>`);
    const debtorsPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${debtorsPageSize===n? 'selected':''}>${n}</option>`).join('');
    const debtorsPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${debtorsSlice.length ? ((debtorsPage - 1) * debtorsPageSize + 1) : 0} - ${((debtorsPage - 1) * debtorsPageSize) + debtorsSlice.length} of ${debtorsTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="debtorsFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage<=1? 'disabled':''}>First</button><button id="debtorsPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage<=1? 'disabled':''}>Prev</button><input id="debtorsPageInput" type="number" min="1" max="${debtorsTotalPages}" value="${debtorsPage}" class="w-14 text-center border rounded p-1" /><button id="debtorsNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage>=debtorsTotalPages? 'disabled':''}>Next</button><button id="debtorsLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${debtorsPage>=debtorsTotalPages? 'disabled':''}>Last</button><select id="debtorsPageSizeSel" class="border rounded p-1 text-sm">${debtorsPageSizeOptions}</select></div></div>`;

    // Summary balances across filtered range
    const cashInRange = (state.allCashLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date));
    const bankInRangeAll = (state.allBankLedger || []).filter(x => !x.isDeleted).filter(x => inRange(x.date));
    const cashBalance = cashInRange.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const bankBalance = bankInRangeAll.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);

    // Cash book rows
    const cashEntries = (state.allCashLedger || [])
        .filter(x => !x.isDeleted)
        .filter(x => inRange(x.date))
        .slice()
        .sort((a,b) => (_toDate(a.date) - _toDate(b.date)));
    // Cash pagination (use per-pane size if present)
    const cashPageSize = state.cashPageSize || state.ledgerPageSize || 10;
    const cashPage = state.cashPage || 1;
    const cashTotal = cashEntries.length;
    const cashTotalPages = Math.max(1, Math.ceil(cashTotal / cashPageSize));
    const cashBefore = cashEntries.slice(0, (cashPage - 1) * cashPageSize);
    let cashRun = cashBefore.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const cashSlice = cashEntries.slice((cashPage - 1) * cashPageSize, cashPage * cashPageSize);
    const cashRows = (cashSlice.length ? cashSlice.map(e => {
        const d = formatDate(e.date);
        const debit = Number(e.debit || 0);
        const credit = Number(e.credit || 0);
        cashRun += (debit - credit);
        const ref = e.refId || '';
        const notes = e.notes || '';
        return `<tr class="border-b text-sm"><td class="p-2">${d}</td><td class="p-2">${e.refType || ''}</td><td class="p-2">${ref}</td><td class="p-2">${notes}</td><td class="p-2 text-right text-green-700">${debit?debit.toFixed(2):'-'}</td><td class="p-2 text-right text-red-600">${credit?credit.toFixed(2):'-'}</td><td class="p-2 text-right font-semibold">${cashRun.toFixed(2)}</td></tr>`;
    }).join('') : `<tr><td colspan="7" class="p-3 text-center text-gray-500">No cash entries in range</td></tr>`);
    const cashPageSizeOptions = [10,25,50].map(n => `<option value="${n}" ${cashPageSize===n? 'selected':''}>${n}</option>`).join('');
    const cashPaginationHTML = `<div class="flex flex-col sm:flex-row items-center justify-between mt-2 text-sm text-gray-600 gap-2"><div>Showing ${cashSlice.length ? ((cashPage - 1) * cashPageSize + 1) : 0} - ${((cashPage - 1) * cashPageSize) + cashSlice.length} of ${cashTotal}</div><div class="flex items-center gap-2 flex-wrap"><button id="cashFirstBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage<=1? 'disabled':''}>First</button><button id="cashPrevBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage<=1? 'disabled':''}>Prev</button><input id="cashPageInput" type="number" min="1" max="${cashTotalPages}" value="${cashPage}" class="w-14 text-center border rounded p-1" /><button id="cashNextBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage>=cashTotalPages? 'disabled':''}>Next</button><button id="cashLastBtn" class="px-2 py-1 bg-gray-100 rounded" ${cashPage>=cashTotalPages? 'disabled':''}>Last</button><select id="cashPageSizeSel" class="border rounded p-1 text-sm">${cashPageSizeOptions}</select></div></div>`;

    // Bank book rows with account filter
    const selectedBank = state.bankAccountFilter || 'All';
    const allBankAccounts = (state.allBanks || []).map(b => b.name).filter(Boolean);
    const bankEntries = (state.allBankLedger || [])
        .filter(x => !x.isDeleted)
        .filter(x => inRange(x.date))
        .filter(x => selectedBank === 'All' ? true : ((x.bankAccount || 'Main Bank') === selectedBank))
        .slice()
        .sort((a,b) => (_toDate(a.date) - _toDate(b.date)));
    // Bank pagination (use per-pane size if present)
    const bankPageSize = state.bankPageSize || state.ledgerPageSize || 10;
    const bankPage = state.bankPage || 1;
    const bankTotal = bankEntries.length;
    const bankTotalPages = Math.max(1, Math.ceil(bankTotal / bankPageSize));
    const bankBefore = bankEntries.slice(0, (bankPage - 1) * bankPageSize);
    let bankRun = bankBefore.reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
    const bankSlice = bankEntries.slice((bankPage - 1) * bankPageSize, bankPage * bankPageSize);
    const bankRows = (bankSlice.length ? bankSlice.map(e => {
        const d = formatDate(e.date);
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
    const suppliersListHTML = (filteredSuppliers).map(s=>{ const pid=(state.__primarySuppliers||[]).find(p=>(p.name||'').toLowerCase()===(s.name||'').toLowerCase())?.id||''; const n=(s.name||'').replace(/"/g,'&quot;'); const g=(s.gstin||'').replace(/"/g,'&quot;'); const a=(s.address||'').replace(/"/g,'&quot;'); return `<li><div class=\"flex flex-col gap-0.5\"><div class=\"flex items-center gap-2\"><span>${s.name}${s.gstin?` — <span class=\\\"text-xs text-gray-500\\\">${s.gstin}</span>`:''}</span><button type=\"button\" class=\"text-blue-600 text-xs underline edit-party-btn\" data-type=\"supplier\" data-name=\"${n}\" data-gstin=\"${g}\" data-address=\"${a}\" data-docid=\"${pid}\">Edit</button></div>${s.address?`<span class=\\\"text-xs text-gray-500\\\">${s.address}</span>`:''}</div></li>`}).join('') || '<li class="text-gray-500">None</li>';
    const customersListHTML = (filteredCustomers).map(c=>{ const pid=(state.__primaryCustomers||[]).find(p=>(p.name||'').toLowerCase()===(c.name||'').toLowerCase())?.id||''; const n=(c.name||'').replace(/"/g,'&quot;'); const g=(c.gstin||'').replace(/"/g,'&quot;'); const a=(c.address||'').replace(/"/g,'&quot;'); return `<li><div class=\"flex flex-col gap-0.5\"><div class=\"flex items-center gap-2\"><span>${c.name}${c.gstin?` — <span class=\\\"text-xs text-gray-500\\\">${c.gstin}</span>`:''}</span><button type=\"button\" class=\"text-blue-600 text-xs underline edit-party-btn\" data-type=\"customer\" data-name=\"${n}\" data-gstin=\"${g}\" data-address=\"${a}\" data-docid=\"${pid}\">Edit</button></div>${c.address?`<span class=\\\"text-xs text-gray-500\\\">${c.address}</span>`:''}</div></li>`}).join('') || '<li class="text-gray-500">None</li>';
    const isAddCollapsed = !!state.ui.partyAddCollapsed;
    const isListCollapsed = !!state.ui.partyListCollapsed;

    container.innerHTML = `
      <div class="grid grid-cols-1 gap-6"> <!-- removed lg:grid-cols-3 -->
        <div class="space-y-6"> <!-- removed lg:col-span-2 -->
        <div class="flex items-end gap-4 mb-4">
            <div>
                <label class="block text-sm text-gray-700">Start Date</label>
                <input type="date" id="ledgerStartDate" class="border rounded p-2" value="${state.ledgerStartDate}">
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
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div class="bg-white p-6 rounded-lg shadow">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xl font-bold">Cash Book</h3>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-xs">
                            <tr>
                                <th class="p-2">Date</th>
                                <th class="p-2">Ref Type</th>
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
                        <label class="text-xs text-gray-600">Account</label>
                        <select id="bankAccountFilter" class="border rounded p-1 text-sm">
                            <option ${selectedBank==='All'?'selected':''}>All</option>
                            ${allBankAccounts.map(n=>`<option ${selectedBank===n?'selected':''}>${n}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 text-xs">
                            <tr>
                                <th class="p-2">Date</th>
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
        <!-- Party Directory: Add and List panes, placed below Sundry Debtors -->
        <div class="bg-white p-8 rounded-lg shadow-lg mt-8">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-bold">Add Parties</h3>
                <button id="togglePartyAdd" class="text-sm text-gray-600 hover:text-gray-800">${isAddCollapsed?'Expand':'Collapse'}</button>
            </div>
            <div id="partyAddBody" class="${isAddCollapsed?'hidden':''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <form id="addSupplierForm" class="space-y-2 border rounded p-4">
                    <h4 class="font-semibold">Add Supplier</h4>
                    <div class="flex gap-2">
                        <input type="text" id="newSupplierName" placeholder="Supplier name" class="flex-1 border rounded p-2" required>
                        <button class="bg-gray-800 text-white px-3 rounded" type="submit">Add</button>
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        <input type="text" id="newSupplierGstin" placeholder="GSTIN (optional)" class="border rounded p-2" pattern="[0-9A-Z]{15}" title="15 characters: A-Z and 0-9">
                        <textarea id="newSupplierAddress" placeholder="Address (optional)" class="border rounded p-2" rows="2"></textarea>
                    </div>
                </form>
                <form id="addCustomerForm" class="space-y-2 border rounded p-4">
                    <h4 class="font-semibold">Add Customer</h4>
                    <div class="flex gap-2">
                        <input type="text" id="newCustomerName" placeholder="Customer name" class="flex-1 border rounded p-2" required>
                        <button class="bg-gray-800 text-white px-3 rounded" type="submit">Add</button>
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        <input type="text" id="newCustomerGstin" placeholder="GSTIN (optional)" class="border rounded p-2" pattern="[0-9A-Z]{15}" title="15 characters: A-Z and 0-9">
                        <textarea id="newCustomerAddress" placeholder="Address (optional)" class="border rounded p-2" rows="2"></textarea>
                    </div>
                </form>
            </div>
            </div>
        </div>
        <div class="bg-white p-8 rounded-lg shadow-lg mt-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xl font-bold">Party Directory</h3>
                <button id="togglePartyList" class="text-sm text-gray-600 hover:text-gray-800">${isListCollapsed?'Expand':'Collapse'}</button>
            </div>
            <div id="partyListBody" class="${isListCollapsed?'hidden':''}">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold">Suppliers <span class="text-xs text-gray-500">(${filteredSuppliers.length} / ${allSuppliersList.length})</span></h4>
                        <button id="clearSupplierSearch" class="text-xs text-gray-600 hover:text-gray-800 ${supSearchVal? '' : 'invisible'}">Clear</button>
                    </div>
                    <input type="text" id="supplierSearch" placeholder="Search name or GSTIN" class="border rounded p-2 w-full mb-2" value="${(supSearchVal||'').replace(/\"/g,'&quot;')}">
                    <ul class="list-disc pl-6 text-sm mb-1">${suppliersListHTML}</ul>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold">Customers <span class="text-xs text-gray-500">(${filteredCustomers.length} / ${allCustomersList.length})</span></h4>
                        <button id="clearCustomerSearch" class="text-xs text-gray-600 hover:text-gray-800 ${custSearchVal? '' : 'invisible'}">Clear</button>
                    </div>
                    <input type="text" id="customerSearch" placeholder="Search name or GSTIN" class="border rounded p-2 w-full mb-2" value="${(custSearchVal||'').replace(/\"/g,'&quot;')}">
                    <ul class="list-disc pl-6 text-sm mb-1">${customersListHTML}</ul>
                </div>
            </div>
            </div>
        </div>
        <!-- End Party Directory panes -->
        <div class="bg-white p-8 rounded-lg shadow-lg mt-8">
            <h3 class="text-xl font-bold mb-4">Quick Postings</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <form id="supplierPaymentForm" class="space-y-3 border rounded p-4">
                    <h4 class="font-semibold">Supplier Payment</h4>
                    <input type="text" id="spParty" placeholder="Supplier Name" class="w-full border rounded p-2" list="suppliersDatalist" required>
                    <datalist id="suppliersDatalist">${(state.allSuppliers||[]).map(s=>`<option value="${(s.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                    <input type="date" id="spDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
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
                    <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded">Record Payment</button>
                </form>
                <form id="customerReceiptForm" class="space-y-3 border rounded p-4">
                    <h4 class="font-semibold">Customer Receipt</h4>
                    <input type="text" id="crParty" placeholder="Customer Name" class="w-full border rounded p-2" list="customersDatalist" required>
                    <datalist id="customersDatalist">${(state.allCustomers||[]).map(c=>`<option value="${(c.name||'').replace(/"/g,'&quot;')}"></option>`).join('')}</datalist>
                    <input type="date" id="crDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
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
                <form id="cashBankTransferForm" class="space-y-3 border rounded p-4">
                    <h4 class="font-semibold">Cash ↔ Bank Transfer</h4>
                    <input type="date" id="tDate" class="w-full border rounded p-2" value="${new Date().toISOString().split('T')[0]}" required>
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

    // Date filter listeners
    const applyBtn = document.getElementById('applyLedgerDateBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            const s = document.getElementById('ledgerStartDate').value;
            const e = document.getElementById('ledgerEndDate').value;
            state.ledgerStartDate = s || state.ledgerStartDate;
            state.ledgerEndDate = e || state.ledgerEndDate;
            // Reset pagination to first page when date range changes
            state.cashPage = 1; state.bankPage = 1; state.creditorsPage = 1; state.debtorsPage = 1;
            renderAdminLedgersPage();
        });
    }

    // Supplier Payment form handler
    const spForm = document.getElementById('supplierPaymentForm');
    if (spForm) {
        spForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const party = document.getElementById('spParty').value.trim();
            const date = new Date(document.getElementById('spDate').value);
            const amount = parseFloat(document.getElementById('spAmount').value) || 0;
            const mode = (document.getElementById('spMode')?.value || 'cash');
            const bankAccount = mode==='bank' ? (document.getElementById('spBankAccount')?.value || 'Main Bank') : null;
            const reconciled = !!document.getElementById('spReconciled')?.checked;
            const reconNote = document.getElementById('spReconNote')?.value || '';
            const notes = document.getElementById('spNotes').value.trim();
            if (!party || amount <= 0) { showMessage('Enter supplier name and a positive amount.'); return; }
            try {
                const ref = doc(collection(db, creditorsLedgerColPath));
                await setDoc(ref, {
                    partyName: party,
                    date,
                    refType: 'Payment',
                    refId: ref.id,
                    notes,
                    debit: amount,
                    credit: 0,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                });
                // Mirror entry in cash/bank ledger (credit because asset decreases)
                const cashPayload = {
                    date,
                    refType: 'Supplier Payment',
                    refId: ref.id,
                    notes: notes ? `${notes} · To ${party}` : `To ${party}`,
                    debit: 0,
                    credit: amount,
                    bankAccount: bankAccount || undefined,
                    reconciled: reconciled || false,
                    reconNote: reconNote || undefined,
                    isDeleted: false,
                    createdAt: serverTimestamp(),
                };
                if (mode === 'bank') {
                    await addDoc(collection(db, bankLedgerColPath), cashPayload);
                } else {
                    await addDoc(collection(db, cashLedgerColPath), cashPayload);
                }
                await ensurePartyExists(party, 'supplier');
                // Optimistic update and re-render
                upsertPartyInState('supplier', { name: party });
                renderAdminLedgersPage();
                showMessage('Supplier payment recorded.');
                spForm.reset();
            } catch (err) {
                console.error('Supplier payment error:', err);
                showMessage('Failed to record supplier payment.');
            }
        });
    }

    // Customer Receipt form handler
    const crForm = document.getElementById('customerReceiptForm');
    if (crForm) {
        crForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const party = document.getElementById('crParty').value.trim();
            const date = new Date(document.getElementById('crDate').value);
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
            const date = new Date(document.getElementById('tDate').value);
            const amount = parseFloat(document.getElementById('tAmount').value) || 0;
            const dir = document.getElementById('tDirection').value;
            const bankAccount = document.getElementById('tBankAccount')?.value || 'Main Bank';
            const reconciled = !!document.getElementById('tReconciled')?.checked;
            const reconNote = document.getElementById('tReconNote')?.value || '';
            const notes = document.getElementById('tNotes').value.trim();
            if (amount <= 0) { showMessage('Enter a positive amount.'); return; }
            try {
                if (dir === 'cashToBank') {
                    // Cash credit, Bank debit
                    await addDoc(collection(db, cashLedgerColPath), {
                        date, refType: 'Transfer', refId: '', notes: notes ? `${notes} · Cash → Bank` : 'Cash → Bank',
                        debit: 0, credit: amount, isDeleted: false, createdAt: serverTimestamp(),
                    });
                    await addDoc(collection(db, bankLedgerColPath), {
                        date, refType: 'Transfer', refId: '', notes: notes ? `${notes} · Cash → Bank` : 'Cash → Bank', bankAccount, reconciled, reconNote: reconNote || undefined,
                        debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                    });
                } else {
                    // Bank to Cash: Bank credit, Cash debit
                    await addDoc(collection(db, bankLedgerColPath), {
                        date, refType: 'Transfer', refId: '', notes: notes ? `${notes} · Bank → Cash` : 'Bank → Cash', bankAccount, reconciled, reconNote: reconNote || undefined,
                        debit: 0, credit: amount, isDeleted: false, createdAt: serverTimestamp(),
                    });
                    await addDoc(collection(db, cashLedgerColPath), {
                        date, refType: 'Transfer', refId: '', notes: notes ? `${notes} · Bank → Cash` : 'Bank → Cash',
                        debit: amount, credit: 0, isDeleted: false, createdAt: serverTimestamp(),
                    });
                }
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
        addSupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newSupplierName').value.trim();
            const gstin = (document.getElementById('newSupplierGstin')?.value || '').trim();
            const address = (document.getElementById('newSupplierAddress')?.value || '').trim();
            if (!name) return;
            try {
                await ensurePartyExists(name, 'supplier', true, { gstin: gstin || undefined, address: address || undefined });
                // Optimistic local list update and re-render
                upsertPartyInState('supplier', { name, gstin: gstin || undefined, address: address || undefined });
                renderAdminLedgersPage();
                document.getElementById('newSupplierName').value = '';
                if (document.getElementById('newSupplierGstin')) document.getElementById('newSupplierGstin').value = '';
                if (document.getElementById('newSupplierAddress')) document.getElementById('newSupplierAddress').value = '';
                showMessage('Supplier added to directory.');
            } catch (err) {
                console.error('Add supplier error:', err);
                showMessage('Failed to add supplier.');
            }
        });
    }
    const addCustForm = document.getElementById('addCustomerForm');
    if (addCustForm) {
        addCustForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('newCustomerName').value.trim();
            const gstin = (document.getElementById('newCustomerGstin')?.value || '').trim();
            const address = (document.getElementById('newCustomerAddress')?.value || '').trim();
            if (!name) return;
            try {
                await ensurePartyExists(name, 'customer', true, { gstin: gstin || undefined, address: address || undefined });
                // Optimistic local list update and re-render
                upsertPartyInState('customer', { name, gstin: gstin || undefined, address: address || undefined });
                renderAdminLedgersPage();
                document.getElementById('newCustomerName').value = '';
                if (document.getElementById('newCustomerGstin')) document.getElementById('newCustomerGstin').value = '';
                if (document.getElementById('newCustomerAddress')) document.getElementById('newCustomerAddress').value = '';
                showMessage('Customer added to directory.');
            } catch (err) {
                console.error('Add customer error:', err);
                showMessage('Failed to add customer.');
            }
        });
    }

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
            showPartyEditModal({ type, name, gstin, address, docId });
        });
    });

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
    modal.querySelector('#closeLedgerModal').addEventListener('click', () => {
        modal.remove();
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
}

// Modal to edit a party (supplier/customer)
function showPartyEditModal({ type, name, gstin, address, docId }) {
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
                    <input type="text" id="partyEditGstin" class="w-full border rounded p-2" value="${(gstin||'').replace(/"/g,'&quot;')}" pattern="[0-9A-Z]{15}" title="15 characters: A-Z and 0-9">
                </div>
                <div>
                    <label class="block text-sm text-gray-700 mb-1">Address (optional)</label>
                    <textarea id="partyEditAddress" class="w-full border rounded p-2" rows="3">${(address||'').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button id="partyEditSaveBtn" class="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector('#closePartyEditModal').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

    modal.querySelector('#partyEditSaveBtn').addEventListener('click', async () => {
        const newName = document.getElementById('partyEditName').value.trim();
        const newGstin = document.getElementById('partyEditGstin').value.trim();
        const newAddr = document.getElementById('partyEditAddress').value.trim();
        if (!newName) { showMessage('Name is required.'); return; }
        try {
            const colPath = type === 'supplier' ? suppliersColPath : customersColPath;
            if (docId) {
                await updateDoc(doc(db, colPath, docId), {
                    name: newName,
                    gstin: newGstin || deleteFieldIfEmpty(),
                    address: newAddr || deleteFieldIfEmpty(),
                    updatedAt: serverTimestamp(),
                });
            } else {
                // If no primary doc id, upsert into new collection
                await addDoc(collection(db, colPath), {
                    name: newName,
                    ...(newGstin ? { gstin: newGstin } : {}),
                    ...(newAddr ? { address: newAddr } : {}),
                    createdAt: serverTimestamp(),
                    isDeleted: false,
                    migratedFrom: 'edit-modal',
                });
            }
            upsertPartyInState(type, { name: newName, gstin: newGstin || undefined, address: newAddr || undefined });
            renderAdminLedgersPage();
            showMessage('Party details saved.');
            close();
        } catch (err) {
            console.error('Save party error:', err);
            showMessage('Failed to save party.');
        }
    });
}

// Helper to remove fields when empty in update payloads
function deleteFieldIfEmpty() {
    // As client web SDK lacks direct deleteField import in this file, fallback to omitting fields by not setting when empty.
    // This function exists to keep code readable above; it just returns undefined.
    return undefined;
}
