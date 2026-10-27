$(document).ready(function () {
    // Live Google Books API Key
    const API_KEY = "AIzaSyBooXNHNiLMLJOatAOteGcGTHwHL6DTJlI";
    const API_BASE_URL = "https://www.googleapis.com/books/v1/volumes";
    const STORAGE_KEY = "bookish-saved-books";
    let savedBooks = loadSavedBooks();
    let currentItems = [];
    let lastRecommendationGenre = null;
    let popularShelfRequested = false;
    let topSellingShelfRequested = false;

    updateSavedCount();
    loadDiscoveryShelves();

    $("[data-view]").on("click", function () {
        const view = $(this).data("view");
        $("[data-view]").removeClass("is-active");
        $(this).addClass("is-active");
        $("#discover-view").prop("hidden", view !== "discover");
        $("#saved-view").prop("hidden", view !== "saved");
        if (view === "saved") renderSavedBooks();
    });

    $("#genre-select").on("change", function () {
        const genre = $(this).val();
        if (genre) {
            $("#search-input").val("");
            fetchBooksFromGoogle(`${genre} books`);
            $("#results-title").text(`${genre.replace(/\b\w/g, letter => letter.toUpperCase())} books`);
        } else {
            $("#search-section").prop("hidden", true);
        }
    });

    // Handle form submit / Load Books button click
    $("#search-form").on("submit", function (event) {
        event.preventDefault();
        const query = $("#search-input").val().trim();
        if (query) {
            $("#genre-select").val("");
            $("#results-title").text(`Results for “${query}”`);
            fetchBooksFromGoogle(query);
        }
    });

    $("#book-list, #saved-list").on("click", ".save-book-btn", function (event) {
        event.stopPropagation();
        const book = $(this).closest(".book-card").data("book");
        if (book) toggleSavedBook(book);
    });

    $("#recommendation-list, #popular-list, #top-selling-list").on("click", ".save-book-btn", function (event) {
        event.stopPropagation();
        const book = $(this).closest(".shelf-card").data("book");
        if (book) toggleSavedBook(book);
    });

    // Event Delegation: Click on book card or View Details button to open modal
    $("#book-list, #recommendation-list, #popular-list, #top-selling-list, #saved-list").on("click", ".book-card, .shelf-card, .view-details-btn", function (e) {
        if ($(e.target).closest(".save-book-btn").length) return;
        // Prevent opening if user clicked directly on "View on Google Books" link
        if ($(e.target).hasClass("view-link")) return;

        const volumeId = $(this).closest(".book-card, .shelf-card").data("id");
        if (volumeId) {
            openBookModal(volumeId);
        }
    });

    // Modal Close Event Handlers
    $("#modal-close-btn").on("click", closeModal);
    $("#book-detail-modal").on("click", function (e) {
        if ($(e.target).hasClass("modal-overlay")) {
            closeModal();
        }
    });
    $(document).on("keydown", function (e) {
        if (e.key === "Escape" && $("#book-detail-modal").is(":visible")) {
            closeModal();
        }
    });

    function closeModal() {
        $("#book-detail-modal").fadeOut(200);
        $("body").css("overflow", "auto"); // Restore scrolling
    }

    /**
     * Function to fetch live search results directly from Google Books API using $.ajax
     * @param {string} query Search term (title, author, or category)
     */
    function fetchBooksFromGoogle(query) {
        const $bookList = $("#book-list");
        const $statusMessage = $("#status-message");
        const $errorMessage = $("#error-message");

        $bookList.empty();
        $("#search-section").prop("hidden", false);
        $("#results-count").text("");
        $errorMessage.hide().text("");
        $statusMessage.text(`Searching Google Books API for "${query}"...`).show();

        // Perform live AJAX GET request to Google Books API
        $.ajax({
            url: API_BASE_URL,
            method: "GET",
            data: {
                q: query,
                key: API_KEY,
                maxResults: 12
            },
            dataType: "json",
            timeout: 10000,
            success: function (response) {
                $statusMessage.hide();

                if (response.items && response.items.length > 0) {
                    $("#results-count").text(`${response.items.length} books`);
                    displayBooks(response.items);
                } else {
                    $statusMessage.text(`No books found for "${query}". Try another search term.`).show();
                    $bookList.html('<div class="empty-state">No titles found. Try a broader search or another genre.</div>');
                }
            },
            error: function (xhr, status, error) {
                $statusMessage.hide();
                console.error("Google Books API Error:", { xhr, status, error });

                let errorMsg = "An error occurred while fetching data from Google Books API.";
                if (xhr.responseJSON && xhr.responseJSON.error && xhr.responseJSON.error.message) {
                    errorMsg = xhr.responseJSON.error.message;
                }
                $errorMessage.html(`<strong>API Error (${xhr.status}):</strong> ${escapeHtml(errorMsg)}`).show();
            }
        });
    }

    /**
     * Render Google Books API search results into DOM
     * @param {Array} items Array of volume objects returned by Google Books API
     */
    function displayBooks(items) {
        const $bookList = $("#book-list");
        currentItems = items;
        $bookList.empty();
        $.each(items, function (index, item) {
            $bookList.append(createBookCard(item));
        });
    }

    function loadDiscoveryShelves() {
        if (!popularShelfRequested) {
            popularShelfRequested = true;
            loadShelf("bestselling fiction books", "#popular-list");
        }
        if (!topSellingShelfRequested) {
            topSellingShelfRequested = true;
            loadShelf("best selling books", "#top-selling-list");
        }
        const favoriteGenre = getFavoriteGenre();
        $("#recommendation-note").text(favoriteGenre ? `Because you saved ${favoriteGenre}` : "A thoughtful place to begin");
        if (favoriteGenre === lastRecommendationGenre) return;
        lastRecommendationGenre = favoriteGenre;
        loadShelf(favoriteGenre ? `${favoriteGenre} books` : "fiction novels", "#recommendation-list");
    }

    function loadShelf(query, target) {
        $.ajax({
            url: API_BASE_URL,
            method: "GET",
            data: { q: query, key: API_KEY, maxResults: 8, orderBy: "relevance", printType: "books" },
            dataType: "json",
            timeout: 10000,
            success: function (response) {
                const $shelf = $(target).empty();
                if (!response.items || !response.items.length) {
                    $shelf.html('<div class="shelf-loading">No books found right now.</div>');
                    return;
                }
                response.items.slice(0, 8).forEach(function (item) {
                    $shelf.append(createShelfCard(item));
                });
            },
            error: function (xhr) {
                const message = xhr.status === 429
                    ? "Google Books has reached its request limit. This shelf will return when access is restored."
                    : "Could not load this shelf right now. Please try again later.";
                $(target).html(`<div class="shelf-loading">${escapeHtml(message)}</div>`);
            }
        });
    }

    function createBookCard(item) {
        const info = item.volumeInfo || {};
        const book = normalizeBook(item);
        const category = info.categories && info.categories[0] ? info.categories[0] : "Reading pick";
        const description = info.description || "A new title to add to your reading list.";
        const isSaved = savedBooks.some(saved => saved.id === book.id);
        return `
            <article class="book-card" data-id="${escapeAttribute(book.id)}" data-book="${escapeAttribute(JSON.stringify(book))}" tabindex="0">
                <div class="cover-wrapper"><img src="${escapeAttribute(book.cover)}" alt="Cover of ${escapeAttribute(book.title)}" class="book-cover" loading="lazy"></div>
                <div class="book-info">
                    <div><span class="badge">${escapeHtml(category)}</span><h3 class="book-title">${escapeHtml(book.title)}</h3>
                    <p class="book-author">${escapeHtml(book.authors)}</p><p class="book-description">${escapeHtml(description.slice(0, 150))}${description.length > 150 ? "..." : ""}</p></div>
                    <div class="card-actions"><button type="button" class="btn-secondary view-details-btn">Details <span aria-hidden="true">↗</span></button>
                    <button type="button" class="save-book-btn ${isSaved ? "is-saved" : ""}" aria-label="${isSaved ? "Remove from" : "Save to"} your shelf" title="${isSaved ? "Remove from shelf" : "Save to shelf"}">${isSaved ? "♥" : "♡"}</button></div>
                </div>
            </article>`;
    }

    function createShelfCard(item) {
        const book = normalizeBook(item);
        const isSaved = savedBooks.some(saved => saved.id === book.id);
        return `<article class="shelf-card" data-id="${escapeAttribute(book.id)}" data-book="${escapeAttribute(JSON.stringify(book))}" tabindex="0">
            <div class="shelf-cover-wrap"><img class="shelf-cover" src="${escapeAttribute(book.cover)}" alt="Cover of ${escapeAttribute(book.title)}" loading="lazy">
            <button type="button" class="save-book-btn shelf-save ${isSaved ? "is-saved" : ""}" aria-label="${isSaved ? "Remove from" : "Save to"} your shelf" title="${isSaved ? "Remove from shelf" : "Save to shelf"}">${isSaved ? "♥" : "♡"}</button></div>
            <h3 class="shelf-title">${escapeHtml(book.title)}</h3><p class="shelf-author">${escapeHtml(book.authors)}</p></article>`;
    }

    function normalizeBook(item) {
        const info = item.volumeInfo || {};
        const images = info.imageLinks || {};
        return {
            id: item.id,
            title: info.title || "Untitled book",
            authors: Array.isArray(info.authors) ? info.authors.join(", ") : (info.authors || "Unknown author"),
            categories: info.categories || [],
            cover: (images.thumbnail || images.smallThumbnail || info.cover || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 170'%3E%3Crect width='120' height='170' fill='%23e8e9e2'/%3E%3Cpath d='M38 60h44M38 72h44M38 84h32' stroke='%2374807b' stroke-width='3'/%3E%3C/svg%3E").replace(/^http:\/\//i, "https://"),
            description: info.description || ""
        };
    }

    function loadSavedBooks() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
        catch (error) { return []; }
    }

    function toggleSavedBook(book) {
        const existingIndex = savedBooks.findIndex(saved => saved.id === book.id);
        if (existingIndex >= 0) savedBooks.splice(existingIndex, 1);
        else savedBooks.unshift(book);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedBooks));
        updateSavedCount();
        refreshSaveButtons(book.id);
        if ($("#saved-view").is(":visible")) renderSavedBooks();
        loadDiscoveryShelves();
    }

    function updateSavedCount() {
        $("#saved-count").text(savedBooks.length);
    }

    function refreshSaveButtons(bookId) {
        const isSaved = savedBooks.some(saved => saved.id === bookId);
        $(`[data-id="${escapeSelector(bookId)}"] .save-book-btn`).toggleClass("is-saved", isSaved)
            .attr("aria-label", `${isSaved ? "Remove from" : "Save to"} your shelf`)
            .attr("title", isSaved ? "Remove from shelf" : "Save to shelf").text(isSaved ? "♥" : "♡");
    }

    function escapeSelector(value) {
        return String(value).replace(/["\\]/g, "\\$&");
    }

    function escapeAttribute(value) {
        return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function getFavoriteGenre() {
        const counts = {};
        savedBooks.forEach(book => (book.categories || []).forEach(category => {
            const genre = category.split("/")[0].trim();
            if (genre) counts[genre] = (counts[genre] || 0) + 1;
        }));
        return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || "";
    }

    function renderSavedBooks() {
        const $savedList = $("#saved-list").empty();
        if (!savedBooks.length) {
            $savedList.html('<div class="empty-state">Your shelf is ready for its first book. Save a title from Discover to keep it close.</div>');
            return;
        }
        savedBooks.forEach(book => $savedList.append(createBookCard({ id: book.id, volumeInfo: book })));
    }

    /**
     * Fetch complete single volume details directly from Google Books API and render in Modal Overlay
     * @param {string} volumeId Google Books Volume ID
     */
    function openBookModal(volumeId) {
        const $modal = $("#book-detail-modal");
        const $modalStatus = $("#modal-status");
        const $modalError = $("#modal-error");
        const $modalBody = $("#modal-body");

        $modalBody.empty();
        $modalError.hide().text("");
        $modalStatus.text("Loading full book details from Google Books API...").show();
        
        $modal.fadeIn(200);
        $("body").css("overflow", "hidden");

        // AJAX request for single volume details from Google Books API
        $.ajax({
            url: `${API_BASE_URL}/${volumeId}`,
            method: "GET",
            data: { key: API_KEY },
            dataType: "json",
            timeout: 10000,
            success: function (data) {
                $modalStatus.hide();
                renderModalContent(data);
            },
            error: function (xhr, status, error) {
                $modalStatus.hide();
                console.error("Modal Fetch Error:", { xhr, status, error });
                $modalError.html(`<strong>Error:</strong> Could not load details for this book from Google Books API.`).show();
            }
        });
    }

    /**
     * Render complete volume info inside Modal
     * @param {Object} data Google Books Volume resource
     */
    function renderModalContent(data) {
        const $modalBody = $("#modal-body");
        const volumeInfo = data.volumeInfo || {};
        const saleInfo = data.saleInfo || {};
        const volumeId = data.id;

        const title = volumeInfo.title || "Untitled Book";
        const subtitle = volumeInfo.subtitle ? `<h4 class="modal-subtitle">${escapeHtml(volumeInfo.subtitle)}</h4>` : "";
        const authors = volumeInfo.authors ? volumeInfo.authors.join(", ") : "Unknown Author";
        const publisher = volumeInfo.publisher || "Publisher not specified";
        const publishedDate = volumeInfo.publishedDate || "Unknown date";
        const pageCount = volumeInfo.pageCount ? `${volumeInfo.pageCount} pages` : "N/A";
        const language = volumeInfo.language ? volumeInfo.language.toUpperCase() : "N/A";
        const category = (volumeInfo.categories && volumeInfo.categories.length > 0) ? volumeInfo.categories.join(", ") : "General";
        
        // Extract best available cover image
        let coverUrl = "";
        if (volumeInfo.imageLinks) {
            coverUrl = volumeInfo.imageLinks.extraLarge || 
                       volumeInfo.imageLinks.large || 
                       volumeInfo.imageLinks.medium || 
                       volumeInfo.imageLinks.small || 
                       volumeInfo.imageLinks.thumbnail;
            coverUrl = coverUrl.replace(/^http:\/\//i, "https://");
        } else {
            coverUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280"><rect width="100%" height="100%" fill="%23cbd5e1"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="16">No Cover Available</text></svg>`;
        }

        // Ratings star calculation
        let ratingHtml = "";
        if (volumeInfo.averageRating) {
            const rating = Math.round(volumeInfo.averageRating);
            const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
            const count = volumeInfo.ratingsCount ? `(${volumeInfo.ratingsCount} reviews)` : "";
            ratingHtml = `<div class="rating-box"><span class="stars">${stars}</span> <strong>${volumeInfo.averageRating}</strong> ${count}</div>`;
        }

        // Pricing & Google Play Buy Link determination
        let buyLink = "";
        let priceTag = "";

        if (saleInfo.buyLink) {
            buyLink = saleInfo.buyLink;
        } else {
            // Direct Google Play Books store link fallback
            buyLink = `https://play.google.com/store/books/details?id=${volumeId}`;
        }

        if (saleInfo.listPrice || saleInfo.retailPrice) {
            const priceObj = saleInfo.retailPrice || saleInfo.listPrice;
            priceTag = `<span class="price-badge">${priceObj.currencyCode} ${priceObj.amount}</span>`;
        } else if (saleInfo.saleability === "FREE") {
            priceTag = `<span class="price-badge free">FREE EBOOK</span>`;
        } else {
            priceTag = `<span class="price-badge info">Available on Google Play</span>`;
        }

        // ISBN formatting
        let isbns = "";
        if (volumeInfo.industryIdentifiers) {
            isbns = volumeInfo.industryIdentifiers.map(i => `${i.type.replace('_', ' ')}: ${i.identifier}`).join(" | ");
        }

        // Full unabridged description
        const description = volumeInfo.description || "No full description is available for this volume.";

        const modalHtml = `
            <div class="modal-detail-container">
                <div class="modal-left">
                    <div class="modal-cover-wrapper">
                        <img src="${coverUrl}" alt="${escapeHtml(title)}" class="modal-cover-img" />
                    </div>
                    
                    <div class="buy-action-card">
                        <div class="price-row">
                            ${priceTag}
                        </div>
                        <a href="${buyLink}" target="_blank" rel="noopener noreferrer" class="btn-buy-play">
                            <svg class="play-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.5,12.92 20.16,13.19L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z"/>
                            </svg>
                            Buy Now on Google Play
                        </a>
                    </div>
                </div>

                <div class="modal-right">
                    <div class="modal-header">
                        <span class="badge category-badge">${escapeHtml(category)}</span>
                        <h2 class="modal-title">${escapeHtml(title)}</h2>
                        ${subtitle}
                        <p class="modal-authors">By <strong>${escapeHtml(authors)}</strong></p>
                        ${ratingHtml}
                    </div>

                    <div class="specs-grid">
                        <div class="spec-item">
                            <span class="spec-label">Publisher</span>
                            <span class="spec-value">${escapeHtml(publisher)}</span>
                        </div>
                        <div class="spec-item">
                            <span class="spec-label">Published</span>
                            <span class="spec-value">${escapeHtml(publishedDate)}</span>
                        </div>
                        <div class="spec-item">
                            <span class="spec-label">Length</span>
                            <span class="spec-value">${escapeHtml(pageCount)}</span>
                        </div>
                        <div class="spec-item">
                            <span class="spec-label">Language</span>
                            <span class="spec-value">${escapeHtml(language)}</span>
                        </div>
                    </div>

                    ${isbns ? `<p class="isbn-line"><strong>Identifiers:</strong> ${escapeHtml(isbns)}</p>` : ''}

                    <div class="description-section">
                        <h3>Description</h3>
                        <div class="description-text">${description}</div>
                    </div>
                </div>
            </div>
        `;

        $modalBody.html(modalHtml);
    }

    /**
     * Helper function to escape HTML special characters
     * @param {string} str String to sanitize
     */
    function escapeHtml(str) {
        return $('<div>').text(str || '').html();
    }
});
