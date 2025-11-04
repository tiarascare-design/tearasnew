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
        profile: null,
    },
    // Per-order mirror listeners for user orders overlaying status from public orders
    userOrderPublicUnsubs: {}
};

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
        const isAdmin = state.currentUser.uid === ADMIN_UID;
        const adminIcon = isAdmin ? `<a href="#" data-page="admin" class="nav-btn hover:text-gray-500" title="Admin Panel"><i class="fa-solid fa-user-shield fa-lg"></i></a>` : '';
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
        productsToDisplay = productsToDisplay.filter(p => p.productGroup === group);
        title = group;
        subtitle = `Browse our ${title} collection`;
    }
    
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

    const allTestimonialsHTML = state.testimonials.length > 0 ? state.testimonials.map(testimonial => `
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

function renderProductDetailPage() {
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
}

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
        
function renderCheckoutPage() {
    const cartProductIds = Object.keys(state.cart.items);
    if (cartProductIds.length === 0) {
        navigateTo('products');
        return;
    }

    const itemsForCalc = state.products
        .filter(p => cartProductIds.includes(p.id))
        .map(product => ({ price: product.salePrice, quantity: state.cart.items[product.id].quantity, gstPercentage: product.gstPercentage || 0, image: product.image, name: product.name }));

    const shipping = 50.00;
    let gstComputed = { rates: {}, total: 0, subtotalEx: 0, subtotalInc: 0 };
    if (state.siteSettings.isGstEnabled) {
        gstComputed = computeGstForItems(itemsForCalc, !!state.siteSettings.pricesIncludeGst);
    } else {
        // GST disabled: treat subtotal as sum of line totals (price*qty)
        const sum = itemsForCalc.reduce((s, it) => s + it.price * it.quantity, 0);
        gstComputed = { rates: {}, total: 0, subtotalEx: sum, subtotalInc: sum };
    }

    const orderItemsHTML = itemsForCalc.map(it => `<div class="flex justify-between items-center py-3"><div class="flex items-center space-x-4"><img src="${it.image}" class="w-16 h-16 object-cover rounded-md"><div><p class="font-semibold">${it.name}</p><p class="text-sm text-gray-500">Qty: ${it.quantity}</p></div></div><p class="font-medium">${(it.price * it.quantity).toFixed(2)}</p></div>`).join('');

    const displaySubtotal = state.siteSettings.pricesIncludeGst ? gstComputed.subtotalInc : gstComputed.subtotalEx;
    const total = gstComputed.subtotalInc + shipping;
    
    const p = state.userProfile || {};
    const fullNameVal = p.fullName || state.currentUser?.displayName || '';
    const addressVal = p.address || '';
    const cityVal = p.city || '';
    const stateVal = p.state || '';
    const zipVal = p.zip || '';
    const phoneVal = (p.phone || '').replace(/\D/g, '').slice(-10);

    pageContent.innerHTML = `<div class=\"bg-gray-50\"><div class=\"container mx-auto px-4 sm:px-6 lg:px-8 py-16\"><h1 class=\"text-4xl font-playfair text-center mb-12\">Checkout</h1><div class=\"grid grid-cols-1 lg:grid-cols-2 gap-16\"><div><h2 class=\"text-2xl font-semibold mb-6\">Shipping Information</h2><form id=\"checkoutForm\" class=\"space-y-4\"><div><label for=\"fullName\" class=\"block text-sm font-medium text-gray-700\">Full Name</label><input type=\"text\" id=\"fullName\" value=\"${fullNameVal}\" required class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\"></div><div><label for=\"phone\" class=\"block text-sm font-medium text-gray-700\">Mobile (10 digits)</label><input type=\"tel\" id=\"phone\" value=\"${phoneVal}\" required pattern=\"[0-9]{10}\" inputmode=\"numeric\" maxlength=\"10\" minlength=\"10\" class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\" placeholder=\"e.g., 9876543210\"></div><div><label for=\"address\" class=\"block text-sm font-medium text-gray-700\">Address</label><input type=\"text\" id=\"address\" value=\"${addressVal}\" required class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\"></div><div class=\"grid grid-cols-1 md:grid-cols-3 gap-4\"><div><label for=\"city\" class=\"block text-sm font-medium text-gray-700\">City</label><input type=\"text\" id=\"city\" value=\"${cityVal}\" required class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\"></div><div><label for=\"state\" class=\"block text-sm font-medium text-gray-700\">State</label><input type=\"text\" id=\"state\" value=\"${stateVal}\" required class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\"></div><div><label for=\"zip\" class=\"block text-sm font-medium text-gray-700\">ZIP Code</label><input type=\"text\" id=\"zip\" value=\"${zipVal}\" required class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\"></div></div><div class=\"pt-2\"><label class=\"flex items-center\"><input type=\"checkbox\" id=\"saveAsDefaultAddress\" class=\"h-4 w-4 rounded border-gray-300 text-black focus:ring-black\" checked><span class=\"ml-2 text-sm text-gray-700\">Save as default shipping address</span></label></div><div class=\"pt-4 ${state.siteSettings.isGstEnabled ? '' : 'hidden'}\"><label class=\"flex items-center\"><input type=\"checkbox\" id=\"requestGstInvoice\" class=\"h-4 w-4 rounded border-gray-300 text-black focus:ring-black\"><span class=\"ml-2 text-sm text-gray-700\">I need a GST invoice</span></label></div><div id=\"gstNumberContainer\" class=\"hidden mt-4\"><label for=\"gstNumber\" class=\"block text-sm font-medium text-gray-700\">GST Number</label><input type=\"text\" id=\"gstNumber\" class=\"mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border\" placeholder=\"e.g., 29ABCDE1234F1Z5\"></div><div class=\"pt-8\"><button type=\"submit\" class=\"w-full bg-black text-white font-semibold py-4 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all\">Place Order</button></div></form></div><div class=\"bg-white p-8 rounded-lg shadow-sm h-fit\"><h2 class=\"text-2xl font-semibold mb-6\">Order Summary</h2><div class=\"space-y-3 divide-y\">${orderItemsHTML}</div><div class=\"border-t mt-6 pt-6 space-y-3\"><div class=\"flex justify-between\"><span>Subtotal (₹)</span><span>${displaySubtotal.toFixed(2)}</span></div> ${Object.keys(gstComputed.rates).map(rate => `<div class=\"flex justify-between\"><span>GST (${rate}%) (₹)</span><span>${gstComputed.rates[rate].toFixed(2)}</span></div>`).join('')} <div class=\"flex justify-between\"><span>Shipping (₹)</span><span>${shipping.toFixed(2)}</span></div><div class=\"flex justify-between font-bold text-lg\"><span>Total (₹)</span><span>${total.toFixed(2)}</span></div></div></div></div></div></div>`;
    
    const gstInvoiceCheckbox = document.getElementById('requestGstInvoice');
    const gstNumberContainer = document.getElementById('gstNumberContainer');
    
    gstInvoiceCheckbox.addEventListener('change', () => {
        gstNumberContainer.classList.toggle('hidden', !gstInvoiceCheckbox.checked);
        document.getElementById('gstNumber').required = gstInvoiceCheckbox.checked;
    });
}

function renderOrderSuccessPage() {
    pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"><div class="bg-green-100 text-green-800 p-6 rounded-lg max-w-md mx-auto mb-8"><i class="fas fa-check-circle fa-3x"></i></div><h1 class="text-4xl font-playfair mb-4">Thank You For Your Order!</h1><p class="text-gray-600 mb-2">Your order has been placed successfully.</p><p class="text-gray-800 font-semibold mb-8">Order ID: <span class="font-mono">${state.currentOrderId}</span></p><button data-page="products" class="nav-btn mt-8 bg-black text-white font-semibold py-3 px-8 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Continue Shopping</button></div>`;
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
        content = state.orders.map(order => {
            const itemsHTML = order.items.map(item => `
                <div class="flex items-center space-x-4 mb-3">
                    <img src="${item.image}" class="w-12 h-12 rounded-md object-cover">
                    <div>
                        <p class="font-medium">${item.name}</p>
                        <p class="text-sm text-gray-500">Qty: ${item.quantity} - ₹${item.price.toFixed(2)}</p>
                    </div>
                </div>
            `).join('');

            const footerHTML = `
                <div class="border-t pt-4 mt-4 flex items-center justify-end">
                    <p class="font-semibold text-lg">Total: ₹${order.totalAmount.toFixed(2)}</p>
                </div>
            `;

            return `
                <div class="bg-white p-6 rounded-lg shadow-sm">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <p class="font-bold text-lg">Order ID: <span class="font-mono">${order.id}</span></p>
                            <p class="text-sm text-gray-500">Date: ${formatDate(order.orderDate)}</p>
                        </div>
                        <span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${order.status}</span>
                    </div>
                    <div class="border-t pt-4">${itemsHTML}</div>
                    ${footerHTML}
                </div>
            `;
        }).join('');
    }

    pageContent.innerHTML = `<div class="bg-gray-50 min-h-screen"><div class="container mx-auto px-4 sm:px-6 lg:px-8 py-12"><h1 class="text-4xl font-playfair text-center mb-12">My Orders</h1><div class="max-w-4xl mx-auto space-y-6">${content}</div></div></div>`;

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
    const isAdmin = state.currentUser && state.currentUser.uid === ADMIN_UID;

    if (!isAdmin) {
        pageContent.innerHTML = `<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"><h1 class="text-4xl font-playfair mb-4">Access Denied</h1><p class="text-gray-600">You do not have permission to view this page.</p><button data-page="home" class="nav-btn mt-8 bg-black text-white font-semibold py-3 px-8 rounded-full uppercase tracking-wider text-sm hover:bg-gray-800 transition-all">Go to Homepage</button></div>`;
        return;
    }

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
                <select id="productGroup" class="w-full px-4 py-2 border border-gray-300 rounded-md">
                    <option value="">None</option>
                   ${state.productGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="grid grid-cols-1 ${formGridClass} gap-6 mt-6">
            ${state.siteSettings.isGstEnabled ? gstFieldHTML : ''}
            <div><label for="productImage" class="block text-sm font-medium text-gray-700 mb-1">Image URL</label><input type="url" id="productImage" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="https://example.com/image.jpg" required></div>
        </div>
       ${!state.siteSettings.isGstEnabled ? gstFieldHTML : ''}
        <div class="flex items-center space-x-4 mt-6"><button type="submit" id="productFormSubmitBtn" class="bg-green-600 text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-green-700 transition">Add Product</button><button type="button" id="productFormCancelBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition hidden">Cancel</button></div>`;

    const slideFormHTML = `<input type="hidden" id="slideId"><div><label for="slideHeadline" class="block text-sm font-medium text-gray-700 mb-1">Headline</label><input type="text" id="slideHeadline" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideSubtitle" class="block text-sm font-medium text-gray-700 mb-1">Subtitle</label><input type="text" id="slideSubtitle" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideImageUrl" class="block text-sm font-medium text-gray-700 mb-1">Image URL</label><input type="url" id="slideImageUrl" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div><label for="slideButtonText" class="block text-sm font-medium text-gray-700 mb-1">Button Text</label><input type="text" id="slideButtonText" class="w-full px-4 py-2 border border-gray-300 rounded-md" required></div><div><label for="slideButtonLink" class="block text-sm font-medium text-gray-700 mb-1">Button Link</label><input type="text" id="slideButtonLink" class="w-full px-4 py-2 border border-gray-300 rounded-md" placeholder="#" required></div></div><div class="flex items-center space-x-4"><button type="submit" id="slideFormSubmitBtn" class="bg-blue-600 text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-blue-700 transition">Add Slide</button><button type="button" id="slideFormCancelBtn" class="bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-md hover:bg-gray-300 transition hidden">Cancel</button></div>`;

    const settingsFormHTML = `<div class=\"bg-white p-8 rounded-lg shadow-lg mb-12\"><form id=\"settingsForm\"><div class=\"space-y-8\"><div><h3 class=\"text-2xl font-bold mb-4\">Store Settings</h3><div class=\"space-y-4\"><div class=\"flex items-center justify-between\"><span class=\"text-sm font-medium text-gray-700\">Merchant is GST registered</span><label class=\"toggle-switch\"><input type=\"checkbox\" id=\"merchantGstRegistered\" ${state.siteSettings.merchantGstRegistered ? 'checked' : ''}><span class=\"toggle-slider\"></span></label></div><div class=\"flex items-center justify-between\"><span class=\"text-sm font-medium text-gray-700\">Enable GST Calculations (sales)</span><label class=\"toggle-switch\"><input type=\"checkbox\" id=\"gstEnabled\" ${state.siteSettings.isGstEnabled ? 'checked' : ''} ${state.siteSettings.merchantGstRegistered ? '' : 'disabled title=\"Enable \u201cMerchant is GST registered\u201d first\"'}><span class=\"toggle-slider\"></span></label></div><p class=\"text-xs text-gray-500\">If you are not GST registered, GST will not be charged on sales, and purchase GST will be treated as part of item cost.</p></div></div><div class=\"space-y-4 pt-4 border-t\"><h3 class=\"text-2xl font-bold mb-4\">Business & GST Details</h3><div><label for=\"merchantGstin\" class=\"block text-sm font-medium text-gray-700 mb-1\">Merchant GSTIN</label><input type=\"text\" id=\"merchantGstin\" value=\"${state.siteSettings.merchantGstin || ''}\" class=\"w-full px-4 py-2 border border-gray-300 rounded-md\" placeholder=\"e.g., 29ABCDE1234F1Z5\"></div><div><label for=\"businessAddress\" class=\"block text-sm font-medium text-gray-700 mb-1\">Business Address</label><textarea id=\"businessAddress\" rows=\"3\" class=\"w-full px-4 py-2 border border-gray-300 rounded-md\" placeholder=\"Full address\">${state.siteSettings.businessAddress || ''}</textarea></div></div><hr><div><h3 class=\"text-2xl font-bold mb-4\">Scrolling Announcement Bar</h3><div class=\"space-y-4\"><div><label for=\"scrollingBarText\" class=\"block text-sm font-medium text-gray-700 mb-1\">Display Text</label><input type=\"text\" id=\"scrollingBarText\" value=\"${state.siteSettings.scrollingBarText}\" class=\"w-full px-4 py-2 border border-gray-300 rounded-md\"></div><div class=\"flex items-center justify-between\"><span class=\"text-sm font-medium text-gray-700\">Show Scrolling Bar</span><label class=\"toggle-switch\"><input type=\"checkbox\" id=\"scrollingBarVisible\" ${state.siteSettings.isScrollingBarVisible ? 'checked' : ''}><span class=\"toggle-slider\"></span></label></div></div></div></div><div class=\"mt-8 border-t pt-6 flex items-center justify-between\"><button type=\"submit\" class=\"bg-green-600 text-white font-semibold py-2 px-8 rounded-md shadow hover:bg-green-700 transition\">Save All Settings</button><button type=\"button\" id=\"masterResetBtn\" class=\"bg-red-600 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-red-700 transition\">Master Reset (Danger)</button></div></form><div class=\"mt-4 p-4 border border-red-200 bg-red-50 text-red-700 rounded-md text-sm\"><p class=\"font-semibold\">Danger Zone:</p><div class=\"grid grid-cols-2 md:grid-cols-3 gap-3 mt-2\"><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetProducts\" class=\"h-4 w-4\"> Products</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetProductGroups\" class=\"h-4 w-4\"> Product Groups</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetHeroSlides\" class=\"h-4 w-4\"> Hero Slides</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetGallery\" class=\"h-4 w-4\"> Gallery Images</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetTestimonials\" class=\"h-4 w-4\"> Testimonials</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetOrders\" class=\"h-4 w-4\"> Orders</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetPurchases\" class=\"h-4 w-4\"> Purchases</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetLocalSales\" class=\"h-4 w-4\"> Local Sales</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetSalesReturns\" class=\"h-4 w-4\"> Sales Returns</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetPurchaseReturns\" class=\"h-4 w-4\"> Purchase Returns</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetCarts\" class=\"h-4 w-4\"> User Carts</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetCounters\" class=\"h-4 w-4\"> Counters</label><label class=\"flex items-center gap-2\"><input type=\"checkbox\" id=\"resetSiteSettings\" class=\"h-4 w-4\"> Site Settings</label></div><div class=\"mt-3\"><button type=\"button\" id=\"resetSelectedBtn\" class=\"bg-red-500 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-red-600 transition\">Reset Selected</button></div><p class=\"mt-3\">Select what to reset or use Master Reset to remove everything listed. Type RESET when prompted. Use only for testing.</p></div></div>`;

    const tabsContent = {
        orders: `<div><div id="adminOrderList" class="space-y-4"></div></div>`,
        products: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="productFormTitle" class="text-2xl font-bold mb-6">Add New Product</h3><form id="productForm" class="space-y-6">${productFormHTML}</form></div><div><h3 class="text-2xl font-bold mb-6">Manage Products</h3><div id="adminProductList" class="space-y-4"></div></div>`,
        product_groups: `<div id="adminProductGroupsContainer"></div>`,
        purchases: `<div id="adminPurchasesContainer"></div>`,
        media: `<div class="bg-white p-8 rounded-lg shadow-lg mb-12"><h3 id="slideFormTitle" class="text-2xl font-bold mb-6">Add New Hero Slide</h3><form id="slideForm" class="space-y-6">${slideFormHTML}</form></div><div class="mb-12"><h3 class="text-2xl font-bold mb-6">Manage Hero Slides</h3><div id="adminSlideList" class="space-y-4"></div></div><div class="bg-white p-8 rounded-lg shadow-lg"><h3 class="text-2xl font-bold mb-6">Manage Gallery Images</h3><div id="galleryImageFormContainer"><label for="galleryImageUrl" class="block text-sm font-medium text-gray-700 mb-1">New Image URL</label><div class="flex"><input type="url" id="galleryImageUrl" class="w-full px-4 py-2 border border-r-0 border-gray-300 rounded-l-md" required placeholder="https://example.com/photo.jpg"><button type="button" id="addGalleryImageBtn" class="bg-indigo-600 text-white font-semibold py-2 px-6 rounded-r-md shadow hover:bg-indigo-700 transition">Add Image</button></div></div><div class="mt-8"><h4 class="text-lg font-bold mb-4">Current Images</h4><div id="adminGalleryImageList" class="grid grid-cols-2 md:grid-cols-4 gap-4"></div></div></div>`,
        testimonials: `<div><h3 class="text-2xl font-bold mb-6">Manage Testimonials</h3><div id="adminTestimonialsList" class="space-y-4"></div></div>`,
        reports: `<div id="adminReportsContainer"></div>`,
        local_sale: `<div id="adminLocalSaleContainer"></div>`,
        returns: `<div id="adminReturnsContainer"></div>`,
        settings: settingsFormHTML,
    };

    pageContent.innerHTML = `<div class="container mx-auto px-6 py-12"><div class="flex justify-between items-center mb-8"><h2 class="text-4xl font-playfair">Admin Panel</h2><button data-page="home" class="nav-btn bg-gray-800 text-white font-semibold py-2 px-4 rounded-md shadow hover:bg-gray-900 transition duration-300">View Store</button></div><div class="border-b border-gray-200 mb-8"><nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs"><a href="#" data-tab="orders" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'orders' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Orders</a><a href="#" data-tab="products" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'products' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Products</a><a href="#" data-tab="product_groups" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'product_groups' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Product Groups</a><a href="#" data-tab="purchases" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'purchases' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Purchases</a><a href="#" data-tab="media" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'media' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Media</a><a href="#" data-tab="testimonials" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'testimonials' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Testimonials</a><a href="#" data-tab="reports" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'reports' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Billing & Reports</a><a href="#" data-tab="local_sale" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'local_sale' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Local Sale</a><a href="#" data-tab="returns" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'returns' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Returns</a><a href="#" data-tab="settings" class="admin-tab-btn whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${state.adminCurrentTab === 'settings' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}">Settings</a></nav></div><div id="adminTabContent">${tabsContent[state.adminCurrentTab]}</div></div>`;

    if (state.adminCurrentTab === 'orders') renderAdminOrderList();
    else if (state.adminCurrentTab === 'products') renderAdminProductList();
    else if (state.adminCurrentTab === 'product_groups') renderAdminProductGroupsPage();
    else if (state.adminCurrentTab === 'purchases') renderAdminPurchasesPage();
    else if (state.adminCurrentTab === 'media') { renderAdminMediaPage(); }
    else if (state.adminCurrentTab === 'testimonials') renderAdminTestimonialsList();
    else if (state.adminCurrentTab === 'reports') renderAdminBillingPage();
    else if (state.adminCurrentTab === 'local_sale') renderLocalSalePage();
    else if (state.adminCurrentTab === 'returns') renderAdminReturnsPage();
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
                   ${order.gstInfo?.requested ? `<p class="mt-2 font-semibold"><strong>GSTIN:</strong> ${order.gstInfo.number}</p>` : ''}
                </div>
            </div>
            <table class="w-full text-left mb-12">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-3 text-sm font-semibold">Item</th>
                        <th class="p-3 text-sm font-semibold text-center">Quantity</th>
                        <th class="p-3 text-sm font-semibold text-right">Unit Price (₹)</th>
                         <th class="p-3 text-sm font-semibold text-right">GST</th>
                        <th class="p-3 text-sm font-semibold text-right">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                ${order.items.map(item => `
                            <tr class="border-b">
                                 <td class="p-3">${item.name}</td>
                                 <td class="p-3 text-center">${item.quantity}</td>
                                 <td class="p-3 text-right">${item.price.toFixed(2)}</td>
                                 <td class="p-3 text-right">${item.gstPercentage}%</td>
                           <td class="p-3 text-right">${(state.siteSettings.pricesIncludeGst ? (item.price * item.quantity) : ((item.price * item.quantity) * (1 + (item.gstPercentage||0)/100))).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                </tbody>
            </table>
            <div class="flex justify-end">
                <div class="w-full max-w-xs space-y-2">
                    <div class="flex justify-between"><span>Subtotal (₹):</span><span>${(order.subtotal ?? subtotal).toFixed(2)}</span></div>
                   ${Object.keys(order.gstBreakdown.rates || {}).map(rate => 
                         `<div class="flex justify-between"><span>GST (${rate}%) (₹):</span><span>${order.gstBreakdown.rates[rate].toFixed(2)}</span></div>`
                    ).join('')}
                    <div class="flex justify-between"><span>Shipping (₹):</span><span>${(state.siteSettings.pricesIncludeGst ? (order.totalAmount - (order.subtotal ?? subtotal)) : (order.totalAmount - (order.subtotal ?? subtotal) - (order.gstBreakdown?.total || 0))).toFixed(2)}</span></div>
                    <div class="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total (₹):</span><span>${order.totalAmount.toFixed(2)}</span></div>
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>Thank you for your business!</p>
               </div>
        </div>
        <div class="text-center mt-8">
               <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Invoice</button>
        </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
}

function renderAdminPurchasesPage() {
    const container = document.getElementById('adminPurchasesContainer');
    if (!container) return;

    const purchaseFormHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg mb-12">
            <h3 class="text-2xl font-bold mb-6">Add New Purchase Entry</h3>
            <form id="purchaseForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="supplierName" class="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                        <input type="text" id="supplierName" class="w-full px-4 py-2 border border-gray-300 rounded-md" required>
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
                        <div class="col-span-1">GST %</div>
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
                              <div class="text-gray-600">Subtotal (₹)</div>
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
                </div>
                <div class="flex justify-end">
                    <button type="submit" class="bg-green-600 text-white font-semibold py-3 px-8 rounded-md shadow hover:bg-green-700 transition">Record Purchase</button>
                </div>
            </form>
        </div>
    `;
    
    const purchaseHistoryHTML = `
        <div class="bg-white p-8 rounded-lg shadow-lg">
            <h3 class="text-2xl font-bold mb-6">Purchase History</h3>
            <div id="purchaseHistoryContainer" class="space-y-4">
                </div>
        </div>
    `;

    container.innerHTML = purchaseFormHTML + purchaseHistoryHTML;
    addPurchaseItemRow(); // Add the first row initially
    renderPurchaseHistory(); // Render the history list
    // Initialize totals and badge state once after first row added
    updatePurchaseTotal();

    // Attach listeners specific to this page
    document.getElementById('addPurchaseItemBtn').addEventListener('click', addPurchaseItemRow);
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
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                         <label for="customerName" class="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
                         <input type="text" id="customerName" class="w-full px-4 py-2 border border-gray-300 rounded-md" required>
                     </div>
                    <div>
                        <label for="saleDate" class="block text-sm font-medium text-gray-700 mb-1">Sale Date</label>
                        <input type="date" id="saleDate" class="w-full px-4 py-2 border border-gray-300 rounded-md" required value="${new Date().toISOString().split('T')[0]}">
                    </div>
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
    
    container.innerHTML = saleFormHTML;
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

    form.addEventListener('submit', handleGenerateLocalInvoice);
    // Initialize totals and badge immediately
    updateLocalSaleTotals();
}

function renderPurchaseInvoicePage() {
    const purchase = state.allPurchases.find(p => p.id === state.currentOrderId);
    if (!purchase) {
        pageContent.innerHTML = `<div class="container mx-auto p-8 text-center"><p>Purchase record not found.</p></div>`;
        return;
    }

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
                    <div class="flex justify-between border-t pt-2 mt-2"><span>Subtotal (₹):</span><span>${(purchase.subtotal ?? (purchase.totalAmount - (purchase.gstBreakdown?.total || 0)) ).toFixed(2)}</span></div>
                    <div class="flex justify-between"><span>GST (₹):</span><span>${(purchase.gstBreakdown?.total || 0).toFixed(2)}</span></div>
                    <div class="flex justify-between font-bold text-lg"><span>Grand Total (₹):</span><span>${purchase.totalAmount.toFixed(2)}</span></div>
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>This is a record of a purchase entry.</p>
               </div>
        </div>
        <div class="text-center mt-8">
               <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Record</button>
        </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
}

function renderLocalSaleInvoicePage() {
    const saleData = state.allLocalSales.find(s => s.id === state.currentOrderId) || state.localSaleData;
    if (!saleData) {
        pageContent.innerHTML = `<div class="container mx-auto p-8 text-center"><p>No invoice data found. Please create a sale first.</p></div>`;
        navigateTo('admin'); // redirect back
        return;
    }
    
    const saleDate = saleData.saleDate.seconds ? new Date(saleData.saleDate.seconds * 1000) : saleData.saleDate;
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
                    ${saleData.gstInfo?.requested && saleData.gstInfo.number ? `<p class="mt-2 font-semibold"><strong>GSTIN:</strong> ${saleData.gstInfo.number}</p>` : ''}
                </div>
            </div>
            <table class="w-full text-left mb-12">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="p-3 text-sm font-semibold">Item</th>
                        <th class="p-3 text-sm font-semibold text-center">Quantity</th>
                        <th class="p-3 text-sm font-semibold text-right">Unit Price (₹)</th>
                        <th class="p-3 text-sm font-semibold text-right">GST</th>
                        <th class="p-3 text-sm font-semibold text-right">Total (₹)</th>
                    </tr>
                </thead>
                <tbody>
                ${saleData.items.map(item => `
                            <tr class="border-b">
                                 <td class="p-3">${item.name}</td>
                                 <td class="p-3 text-center">${item.quantity}</td>
                                 <td class="p-3 text-right">${item.price.toFixed(2)}</td>
                                 <td class="p-3 text-right">${item.gstPercentage}%</td>
                           <td class="p-3 text-right">${(state.siteSettings.pricesIncludeGst ? (item.price * item.quantity) : ((item.price * item.quantity) * (1 + (item.gstPercentage||0)/100))).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                </tbody>
            </table>
            <div class="flex justify-end">
                <div class="w-full max-w-xs space-y-2">
                    <div class="flex justify-between"><span>Subtotal (₹):</span><span>${(saleData.subtotal ?? saleData.items.reduce((s,i)=>s+(i.price*i.quantity),0)).toFixed(2)}</span></div>
                   ${Object.keys(saleData.gstBreakdown.rates || {}).map(rate => 
                         `<div class="flex justify-between"><span>GST (${rate}%) (₹):</span><span>${saleData.gstBreakdown.rates[rate].toFixed(2)}</span></div>`
                    ).join('')}
                    <div class="flex justify-between font-bold text-lg border-t pt-2 mt-2"><span>Grand Total (₹):</span><span>${saleData.totalAmount.toFixed(2)}</span></div>
                </div>
            </div>
               <div class="mt-16 text-center text-xs text-gray-500">
                       <p>Thank you for your business!</p>
               </div>
        </div>
        <div class="text-center mt-8">
            <button id="printInvoiceBtn" class="bg-black text-white font-semibold py-2 px-6 rounded-md shadow hover:bg-gray-800 transition">Print Invoice</button>
            <button data-page="admin" data-tab="local_sale" id="backToLocalSale" class="ml-4 admin-tab-btn nav-btn bg-gray-200 text-gray-700 font-semibold py-2 px-6 rounded-md hover:bg-gray-300 transition">Back to Sale</button>
        </div>
    </div>
    `;
   document.getElementById('printInvoiceBtn').addEventListener('click', () => window.print());
   document.getElementById('backToLocalSale').addEventListener('click', (e) => {
       e.preventDefault();
       state.adminCurrentTab = 'local_sale';
       navigateTo('admin');
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
            state.siteSettings = { ...state.siteSettings, ...incoming };
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
                        isGstEnabled: document.getElementById('gstEnabled').checked,
                        merchantGstRegistered: document.getElementById('merchantGstRegistered')?.checked || false,
                // --- UPDATED: Save new GST fields ---
                merchantGstin: document.getElementById('merchantGstin').value,
                businessAddress: document.getElementById('businessAddress').value,
                // ------------------------------------
            };
            try {
                await setDoc(doc(db, siteSettingsDocPath), newSettings, { merge: true });
                showMessage("Settings saved successfully!");
                console.log('Settings saved:', newSettings);
            } catch (error) {
               console.error("Error saving settings: ", error);
               showMessage("Failed to save settings.");
            }
        });
    }

    const gstEnabledToggle = document.getElementById('gstEnabled');
    if (gstEnabledToggle) {
       gstEnabledToggle.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
                    // If merchant not registered, disallow enabling GST
                    if (!state.siteSettings.merchantGstRegistered && isChecked) {
                        e.target.checked = false;
                        showMessage('Enable "Merchant is GST registered" first to charge GST on sales.');
                        return;
                    }
            try {
                await setDoc(doc(db, siteSettingsDocPath), { 
                    isGstEnabled: isChecked
                }, { merge: true });
                showMessage(`GST Calculations are now ${isChecked ? 'Enabled' : 'Disabled'}.`);
            } catch (error) {
                console.error("Error updating GST setting: ", error);
                showMessage("Failed to update GST setting.");
            }
        });
    }

            const merchantGstRegisteredToggle = document.getElementById('merchantGstRegistered');
            if (merchantGstRegisteredToggle) {
               merchantGstRegisteredToggle.addEventListener('change', async (e) => {
                    const isReg = e.target.checked;
                    try {
                        const payload = { merchantGstRegistered: isReg };
                        // If unregistered, force-disable sales GST
                        if (!isReg) {
                            payload.isGstEnabled = false;
                            const gstEnabledEl = document.getElementById('gstEnabled');
                            if (gstEnabledEl) gstEnabledEl.checked = false;
                        }
                        await setDoc(doc(db, siteSettingsDocPath), payload, { merge: true });
                        showMessage(`Merchant GST registration is now ${isReg ? 'ON' : 'OFF'}.`);
                        // Update local state quickly to reflect constraints
                        state.siteSettings = { ...state.siteSettings, ...payload };
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
            const isAdmin = state.currentUser && state.currentUser.uid === ADMIN_UID;
            if (!isAdmin) { showMessage('Only admin can perform master reset.'); return; }
            const confirmText = prompt('Type RESET to confirm Master Reset. This will delete most data.');
            if (confirmText !== 'RESET') return;
            try {
                const result = await resetAllData();
                if (result.ok) {
                    showMessage('Master Reset completed.');
                } else {
                    console.warn('Master Reset completed with errors:', result.errors);
                    showMessage(`Master Reset completed with ${result.errors.length} error(s). Check console for details.`);
                }
            } catch (e) {
                console.error('Master Reset failed:', e);
                showMessage(`Master Reset failed: ${e?.message || 'Unknown error'}. Check console for details.`);
            }
        });
    }

    // Reset Selected button
    const resetSelectedBtn = document.getElementById('resetSelectedBtn');
    if (resetSelectedBtn) {
        resetSelectedBtn.addEventListener('click', async () => {
            const isAdmin = state.currentUser && state.currentUser.uid === ADMIN_UID;
            if (!isAdmin) { showMessage('Only admin can perform reset.'); return; }

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
    
    // NOTE: The event listeners for .admin-order-status-selector are now handled inside renderAdminOrderList to ensure they are re-attached after filtering/rendering.

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
    if (flags.orders) await safe('Orders', () => deleteAllPublicOrders(), () => markAllPublicOrdersDeleted(), 'orders');
    if (flags.products) await safe('Products', () => deleteAllDocsInCollection(productsColPath), () => markAllDocsInCollection(productsColPath), 'products');
    if (flags.productGroups) await safe('Product Groups', () => deleteAllDocsInCollection(productGroupsColPath), () => markAllDocsInCollection(productGroupsColPath), 'productGroups');
    if (flags.slides) await safe('Hero Slides', () => deleteAllDocsInCollection(slidesColPath), () => markAllDocsInCollection(slidesColPath), 'slides');
    if (flags.gallery) await safe('Gallery Images', () => deleteAllDocsInCollection(galleryImagesColPath), () => markAllDocsInCollection(galleryImagesColPath), 'galleryImages');
    if (flags.testimonials) await safe('Testimonials', () => deleteAllDocsInCollection(testimonialsColPath), () => markAllDocsInCollection(testimonialsColPath), 'testimonials');
    if (flags.purchases) await safe('Purchases', () => deleteAllDocsInCollection(purchasesColPath), () => markAllDocsInCollection(purchasesColPath), 'purchases');
    if (flags.localSales) await safe('Local Sales', () => deleteAllDocsInCollection(localSalesColPath), () => markAllDocsInCollection(localSalesColPath), 'localSales');
    if (flags.salesReturns) await safe('Sales Returns', () => deleteAllDocsInCollection(salesReturnsColPath), () => markAllDocsInCollection(salesReturnsColPath), 'salesReturns');
    if (flags.purchaseReturns) await safe('Purchase Returns', () => deleteAllDocsInCollection(purchaseReturnsColPath), () => markAllDocsInCollection(purchaseReturnsColPath), 'purchaseReturns');
    if (flags.carts) await safe('User Carts', () => deleteAllUserCarts());

    // Site settings
    if (flags.siteSettings) {
        const defaultSettings = {
            isScrollingBarVisible: true,
            scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
            isGstEnabled: true,
            merchantGstin: '29ABCDE1234F1Z5',
            businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542',
        };
        await safe('Site Settings', () => setDoc(doc(db, siteSettingsDocPath), defaultSettings, { merge: false }));
        state.siteSettings = { ...state.siteSettings, ...defaultSettings };
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
    const defaultSettings = {
        isScrollingBarVisible: true,
        scrollingBarText: "✨ FLAT 10% OFF ON ALL BEAUTY PRODUCTS ✨ LIMITED TIME OFFER: FREE SHIPPING ON ORDERS OVER ₹4000! NEW ARRIVALS: CHECK OUT OUR LATEST ORNAMENTS",
        isGstEnabled: true,
        merchantGstin: '29ABCDE1234F1Z5',
        businessAddress: 'TIARAS Headquarters, 123 Luxury Lane, Perumbavoor, Kerala, India 683542',
    };
    await safe('Site Settings', () => setDoc(doc(db, siteSettingsDocPath), defaultSettings, { merge: false }));

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
    state.siteSettings = { ...state.siteSettings, ...defaultSettings };

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

    container.innerHTML = salesReturnHTML + purchaseReturnHTML;

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
        const creditNoteNumber = await getAndIncrementCounter('salesReturns');

        try {
            const batch = writeBatch(db);
            // increase stock for returned items
            items.forEach(it => {
                const productRef = doc(db, productsColPath, it.id);
                batch.update(productRef, { stock: increment(it.quantity) });
            });
            const retRef = doc(collection(db, salesReturnsColPath));
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
                returnDate: serverTimestamp(),
            };
            batch.set(retRef, retDoc);
            await batch.commit();
            showMessage('Sales return recorded (credit note created).');
            // reset form
            orderSelect.value = '';
            salesItemsContainer.innerHTML = '';
            document.getElementById('salesReturnTotal').textContent = '0.00';
        } catch (error) {
            console.error('Error recording sales return:', error);
            showMessage('Failed to record sales return.');
        }
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

        const debitNoteNumber = await getAndIncrementCounter('purchaseReturns');

        try {
            const batch = writeBatch(db);
            // decrease stock for returned items back to supplier
            items.forEach(it => {
                const productRef = doc(db, productsColPath, it.productId);
                batch.update(productRef, { stock: increment(-it.quantity) });
            });
            const retRef = doc(collection(db, purchaseReturnsColPath));
            const retDoc = {
                purchaseId: purchase.id,
                supplierName: purchase.supplierName,
                debitNoteNumber,
                items,
                totalAmount,
                returnDate: serverTimestamp(),
            };
            batch.set(retRef, retDoc);
            await batch.commit();
            showMessage('Purchase return recorded (debit note created).');
            // reset form
            purchaseSelect.value = '';
            purchaseItemsContainer.innerHTML = '';
            document.getElementById('purchaseReturnTotal').textContent = '0.00';
        } catch (error) {
            console.error('Error recording purchase return:', error);
            showMessage('Failed to record purchase return.');
        }
    });
}

document.body.addEventListener('click', async e => {
    const navBtn = e.target.closest('.nav-btn');
    if (navBtn) {
        e.preventDefault();
        navigateTo(navBtn.dataset.page, navBtn.dataset.id, navBtn.dataset.category, navBtn.dataset.group);
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
        const supplierName = document.getElementById('supplierName').value;
        const purchaseDate = document.getElementById('purchaseDate').value;
        const pricesIncludeGst = document.getElementById('purchasePricesIncludeGst')?.checked || false;
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
                    const lineInc = purchasePrice * quantity;
                    const factor = 1 + (gstPercentage/100);
                    const lineEx = factor > 0 ? (lineInc / factor) : lineInc;
                    subtotalEx += lineEx; subtotalInc += lineInc; gstTotal += (lineInc - lineEx);
                } else {
                    const lineEx = purchasePrice * quantity;
                    const lineGst = lineEx * (gstPercentage/100);
                    subtotalEx += lineEx; subtotalInc += (lineEx + lineGst); gstTotal += lineGst;
                }
            }
        });

        if (items.length === 0) {
            showMessage("Please add at least one item to the purchase.");
            return;
        }
        
        const invoiceNumber = await getAndIncrementCounter('purchases');

        const purchaseData = {
            supplierName,
            invoiceNumber,
            purchaseDate: new Date(purchaseDate),
            items,
            subtotal: (pricesIncludeGst ? subtotalInc : subtotalEx),
            gstBreakdown: { total: gstTotal },
            totalAmount: subtotalInc,
            pricesIncludeGst,
            // **NEW FIELD:** Mark as not deleted
            isDeleted: false,
            createdAt: serverTimestamp()
        };

        try {
            const batch = writeBatch(db);
            
            const purchaseRef = doc(collection(db, purchasesColPath));
            batch.set(purchaseRef, purchaseData);

            for (const item of items) {
                const allItemPurchases = state.allPurchases.filter(p => p.items.some(i => i.productId === item.productId));
                
                let totalCost = item.purchasePrice * item.quantity;
                let totalQuantity = item.quantity;

               allItemPurchases.forEach(p => {
                    p.items.forEach(i => {
                        if (i.productId === item.productId) {
                            totalCost += i.purchasePrice * i.quantity;
                           totalQuantity += i.quantity;
                        }
                    });
                });
                
                const productRef = doc(db, productsColPath, item.productId);
                const currentProduct = state.products.find(p => p.id === item.productId);
                const newStock = (currentProduct.stock || 0) + item.quantity;

                const newAveragePrice = totalQuantity > 0 ? totalCost / totalQuantity : item.purchasePrice;
                const lastPurchasePrice = item.purchasePrice;

               batch.update(productRef, { 
                    stock: newStock,
                    purchasePrice: newAveragePrice,
                    lastPurchasePrice: lastPurchasePrice,
                });
            }

            await batch.commit();
            showMessage("Purchase recorded successfully!");
            e.target.reset();
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
    const isAdmin = state.currentUser && state.currentUser.uid === ADMIN_UID;
    if (!isAdmin) {
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
        }

        // Handle user-specific listeners
        if (state.listeners.cart) { state.listeners.cart(); state.listeners.cart = null; }
        if (state.listeners.orders) { state.listeners.orders(); state.listeners.orders = null; }
        if (state.listeners.allOrders) { state.listeners.allOrders(); state.listeners.allOrders = null; }
        if (state.listeners.allTestimonials) { state.listeners.allTestimonials(); state.listeners.allTestimonials = null; }
        if (state.listeners.allPurchases) { state.listeners.allPurchases(); state.listeners.allPurchases = null; }
        if (state.listeners.allLocalSales) { state.listeners.allLocalSales(); state.listeners.allLocalSales = null; }
    if (state.listeners.allSalesReturns) { state.listeners.allSalesReturns(); state.listeners.allSalesReturns = null; }
    if (state.listeners.allPurchaseReturns) { state.listeners.allPurchaseReturns(); state.listeners.allPurchaseReturns = null; }

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
            if (user.uid === ADMIN_UID) {
                listenToAllOrders();
               listenToAllTestimonials();
                listenToAllPurchases();
               listenToAllLocalSales();
                listenToAllSalesReturns();
                listenToAllPurchaseReturns();
            }
        } else {
            state.cart = { items: {} };
            state.orders = [];
            state.allOrders = [];
            state.userProfile = null;
            if (state.listeners.profile) { try { state.listeners.profile(); } catch {} state.listeners.profile = null; }
        }
        
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
        <div class="col-span-1">
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
}

function updatePurchaseTotal() {
    const pricesIncludeGst = document.getElementById('purchasePricesIncludeGst')?.checked || false;
    let subtotalEx = 0, gstTotal = 0, subtotalInc = 0;
    document.querySelectorAll('.purchase-item-row').forEach(row => {
        const price = parseFloat(row.querySelector('.purchase-price').value) || 0;
        const quantity = parseInt(row.querySelector('.purchase-quantity').value) || 0;
        const gstPercentage = parseFloat(row.querySelector('.purchase-gst')?.value) || 0;
        let lineEx, lineGst, lineInc;
        if (pricesIncludeGst) {
            lineInc = price * quantity;
            const factor = 1 + (gstPercentage / 100);
            lineEx = factor > 0 ? (lineInc / factor) : lineInc;
            lineGst = lineInc - lineEx;
        } else {
            lineEx = price * quantity;
            lineGst = lineEx * (gstPercentage / 100);
            lineInc = lineEx + lineGst;
        }
        row.querySelector('.purchase-item-total').textContent = `${lineInc.toFixed(2)}`;
        subtotalEx += lineEx; gstTotal += lineGst; subtotalInc += lineInc;
    });
    document.getElementById('purchaseSubtotal').textContent = `${(pricesIncludeGst ? subtotalInc : subtotalEx).toFixed(2)}`;
    document.getElementById('purchaseGst').textContent = `${gstTotal.toFixed(2)}`;
    document.getElementById('purchaseTotal').textContent = `${subtotalInc.toFixed(2)}`;

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
    
    const invoiceNumber = await getAndIncrementCounter('localSales');

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
        createdAt: serverTimestamp()
    };
    
    state.localSaleData = localSaleDocData; // for immediate navigation

    // Batch write to update stock and save local sale record
    try {
        const batch = writeBatch(db);
        items.forEach(item => {
            const productRef = doc(db, productsColPath, item.id);
            batch.update(productRef, { stock: increment(-item.quantity) });
        });
        
        // Save the local sale to its own collection
        const localSaleRef = doc(collection(db, localSalesColPath));
        batch.set(localSaleRef, localSaleDocData);

        await batch.commit();
        
        state.localSaleData.id = localSaleRef.id;
        
        // Navigate to invoice page
        navigateTo('local_sale_invoice', localSaleRef.id);

    } catch (error) {
        console.error("Error finalizing local sale:", error);
        showMessage("Failed to finalize sale. Invoice not generated.");
    }
}


function openNewProductModal(triggeringSelect) {
    window.newProductTriggerSelect = triggeringSelect; // Save the select element
   document.getElementById('newProductModal').classList.remove('hidden');
}

function closeNewProductModal() {
    if(window.newProductTriggerSelect) {
       window.newProductTriggerSelect.value = ''; // Reset the triggering select
    }
    const modal = document.getElementById('newProductModal');
   modal.querySelector('form').reset();
    modal.classList.add('hidden');
}

document.getElementById('closeNewProductModalBtn').addEventListener('click', closeNewProductModal);
document.getElementById('cancelNewProductBtn').addEventListener('click', closeNewProductModal);
        
initializeAppAndListeners();
